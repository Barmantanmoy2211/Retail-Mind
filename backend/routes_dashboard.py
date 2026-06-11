"""Dashboard / analytics / reports endpoints."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import get_db, clean_doc
from auth_utils import get_business_scope

router = APIRouter(prefix="/api")


def _date_range(days: int):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def _scoped_outlet_id(user: dict, outlet_id: Optional[str] = None) -> Optional[str]:
    if outlet_id:
        return outlet_id
    if user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        return user["outlet_id"]
    return None


@router.get("/dashboard/business")
async def business_dashboard(
    outlet_id: Optional[str] = None,
    days: int = 30,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    biz_id = user["business_id"]
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    start, _ = _date_range(days)

    scope_oid = _scoped_outlet_id(user, outlet_id)
    bill_filter = {"business_id": biz_id}
    if scope_oid:
        bill_filter["outlet_id"] = scope_oid

    # Today
    today_bills = await db.bills.find({**bill_filter, "created_at": {"$gte": today_start}}).to_list(10000)
    today_sales = sum(b.get("total", 0) for b in today_bills)
    today_orders = len(today_bills)

    # Monthly
    monthly_bills = await db.bills.find({**bill_filter, "created_at": {"$gte": month_start}}).to_list(50000)
    monthly_sales = sum(b.get("total", 0) for b in monthly_bills)
    monthly_tax = sum(b.get("tax_total", 0) for b in monthly_bills)

    # All time
    all_bills = await db.bills.find(bill_filter).to_list(100000)
    total_revenue = sum(b.get("total", 0) for b in all_bills)
    total_tax = sum(b.get("tax_total", 0) for b in all_bills)
    total_orders = len(all_bills)

    # Expenses
    exp_filter = {"business_id": biz_id, "status": "approved"}
    if scope_oid:
        exp_filter["outlet_id"] = scope_oid
    all_exp = await db.expenses.find(exp_filter).to_list(100000)
    total_expenses = sum(e.get("amount", 0) for e in all_exp)
    monthly_exp = sum(e.get("amount", 0) for e in all_exp if e.get("created_at", "") >= month_start)

    # Customers
    total_customers = await db.customers.count_documents({"business_id": biz_id})

    # Products & inventory (optionally scoped to one outlet)
    products = await db.products.find({"business_id": biz_id}).to_list(5000)
    if scope_oid:
        visible = []
        for p in products:
            status = p.get("status", "approved")
            if status != "approved":
                continue
            outlet_ids = p.get("outlet_ids")
            if outlet_ids:
                if scope_oid not in outlet_ids:
                    continue
            else:
                legacy = p.get("outlet_id")
                if legacy is not None and legacy != scope_oid:
                    continue
            visible.append(p)
        products = visible
    total_products = len(products)

    inventory_value = 0.0
    for p in products:
        stocks = await db.stocks.find({"product_id": str(p["_id"])}).to_list(100)
        if scope_oid:
            stock_qty = sum(s.get("quantity", 0) for s in stocks if s.get("outlet_id") == scope_oid)
        else:
            stock_qty = sum(s.get("quantity", 0) for s in stocks)
        inventory_value += stock_qty * p.get("cost_price", 0)

    # Reward points issued
    rew_pipeline = [
        {"$match": {"business_id": biz_id, "type": "earn"}},
        {"$group": {"_id": None, "total": {"$sum": "$points"}}},
    ]
    rew = await db.rewards.aggregate(rew_pipeline).to_list(1)
    reward_points_issued = rew[0]["total"] if rew else 0

    # Daily sales trend (last N days)
    daily_trend = {}
    for b in monthly_bills:
        d = (b.get("created_at") or "")[:10]
        if d:
            daily_trend.setdefault(d, {"date": d, "sales": 0, "orders": 0, "tax": 0})
            daily_trend[d]["sales"] += b.get("total", 0)
            daily_trend[d]["tax"] += b.get("tax_total", 0)
            daily_trend[d]["orders"] += 1
    daily_trend_list = sorted(daily_trend.values(), key=lambda x: x["date"])

    # Outlet comparison
    outlet_comparison = []
    outlets = await db.outlets.find({"business_id": biz_id}).to_list(100)
    if scope_oid:
        outlets = [o for o in outlets if str(o["_id"]) == scope_oid]
    for o in outlets:
        oid = str(o["_id"])
        obills = [b for b in monthly_bills if b.get("outlet_id") == oid]
        outlet_comparison.append({
            "outlet_id": oid,
            "outlet_name": o["name"],
            "sales": sum(x.get("total", 0) for x in obills),
            "orders": len(obills),
            "tax": sum(x.get("tax_total", 0) for x in obills),
        })

    # Top products
    prod_sales = {}
    for b in monthly_bills:
        for it in b.get("items", []):
            pid = it.get("product_id")
            prod_sales.setdefault(pid, {"product_id": pid, "name": it.get("product_name"),
                                        "quantity": 0, "revenue": 0})
            prod_sales[pid]["quantity"] += it.get("quantity", 0)
            prod_sales[pid]["revenue"] += it.get("line_total", 0)
    top_products = sorted(prod_sales.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    # Recent bills
    recent_bills = await db.bills.find(bill_filter).sort("created_at", -1).limit(10).to_list(10)
    recent_bills = [clean_doc(b) for b in recent_bills]

    # Low stock count
    low_stock_count = 0
    for p in products:
        stocks = await db.stocks.find({"product_id": str(p["_id"])}).to_list(100)
        for s in stocks:
            if scope_oid and s.get("outlet_id") != scope_oid:
                continue
            if s.get("quantity", 0) <= p.get("min_stock", 0):
                low_stock_count += 1
                break

    return {
        "today_sales": round(today_sales, 2),
        "today_orders": today_orders,
        "monthly_sales": round(monthly_sales, 2),
        "monthly_expenses": round(monthly_exp, 2),
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(total_revenue - total_expenses - total_tax, 2),
        "monthly_profit": round(monthly_sales - monthly_exp - monthly_tax, 2),
        "tax_collected": round(total_tax, 2),
        "monthly_tax": round(monthly_tax, 2),
        "total_customers": total_customers,
        "total_products": total_products,
        "total_orders": total_orders,
        "inventory_value": round(inventory_value, 2),
        "reward_points_issued": reward_points_issued,
        "low_stock_count": low_stock_count,
        "daily_trend": daily_trend_list,
        "outlet_comparison": outlet_comparison,
        "top_products": top_products,
        "recent_bills": recent_bills,
    }


@router.get("/reports/profit-loss")
async def profit_loss(
    period: str = Query("monthly"),  # daily, weekly, monthly, quarterly, yearly
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    days_map = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
    days = days_map.get(period, 30)
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    scope_oid = _scoped_outlet_id(user, outlet_id)
    f = {"business_id": user["business_id"], "created_at": {"$gte": start}}
    if scope_oid:
        f["outlet_id"] = scope_oid

    bills = await db.bills.find(f).to_list(100000)
    exp_f = {"business_id": user["business_id"], "status": "approved", "created_at": {"$gte": start}}
    if scope_oid:
        exp_f["outlet_id"] = scope_oid
    expenses = await db.expenses.find(exp_f).to_list(100000)

    revenue = sum(b.get("total", 0) for b in bills)
    tax = sum(b.get("tax_total", 0) for b in bills)
    cogs = 0.0
    for b in bills:
        for it in b.get("items", []):
            cogs += it.get("cost_price", 0) * it.get("quantity", 0)
    exp_total = sum(e.get("amount", 0) for e in expenses)
    net = revenue - exp_total - tax

    # by category
    by_cat = {}
    for e in expenses:
        c = e.get("category", "misc")
        by_cat[c] = by_cat.get(c, 0) + e.get("amount", 0)

    return {
        "period": period,
        "revenue": round(revenue, 2),
        "tax": round(tax, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(revenue - cogs, 2),
        "expenses": round(exp_total, 2),
        "net_profit": round(net, 2),
        "expense_by_category": by_cat,
        "orders": len(bills),
    }


@router.get("/reports/tax")
async def tax_report(
    days: int = 30,
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    scope_oid = _scoped_outlet_id(user, outlet_id)
    f = {"business_id": user["business_id"], "created_at": {"$gte": start}}
    if scope_oid:
        f["outlet_id"] = scope_oid
    bills = await db.bills.find(f).to_list(100000)

    daily = {}
    by_rate = {}
    by_outlet = {}
    total_sales = 0
    total_tax = 0
    for b in bills:
        d = (b.get("created_at") or "")[:10]
        total_sales += b.get("total", 0)
        total_tax += b.get("tax_total", 0)
        daily.setdefault(d, {"date": d, "sales": 0, "tax": 0})
        daily[d]["sales"] += b.get("total", 0)
        daily[d]["tax"] += b.get("tax_total", 0)
        oid = b.get("outlet_id", "")
        by_outlet.setdefault(oid, {"outlet_id": oid, "sales": 0, "tax": 0})
        by_outlet[oid]["sales"] += b.get("total", 0)
        by_outlet[oid]["tax"] += b.get("tax_total", 0)
        for it in b.get("items", []):
            rate = it.get("tax_percent", 0)
            by_rate.setdefault(rate, {"rate": rate, "sales": 0, "tax": 0})
            by_rate[rate]["sales"] += it.get("line_total", 0)
            by_rate[rate]["tax"] += it.get("tax_amount", 0)

    # outlet names
    for oid, v in by_outlet.items():
        if oid:
            o = await db.outlets.find_one({"_id": ObjectId(oid)})
            v["outlet_name"] = o["name"] if o else ""

    return {
        "total_sales": round(total_sales, 2),
        "total_tax": round(total_tax, 2),
        "net_revenue": round(total_sales - total_tax, 2),
        "daily": sorted(daily.values(), key=lambda x: x["date"]),
        "by_rate": list(by_rate.values()),
        "by_outlet": list(by_outlet.values()),
    }


@router.get("/reports/inventory")
async def inventory_report(
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    scope_oid = _scoped_outlet_id(user, outlet_id)
    products = await db.products.find({"business_id": user["business_id"]}).to_list(5000)
    if scope_oid:
        visible = []
        for p in products:
            if p.get("status", "approved") != "approved":
                continue
            outlet_ids = p.get("outlet_ids")
            if outlet_ids:
                if scope_oid not in outlet_ids:
                    continue
            else:
                legacy = p.get("outlet_id")
                if legacy is not None and legacy != scope_oid:
                    continue
            visible.append(p)
        products = visible

    # Sales by product (last 90 days)
    start = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    bill_f = {"business_id": user["business_id"], "created_at": {"$gte": start}}
    if scope_oid:
        bill_f["outlet_id"] = scope_oid
    bills = await db.bills.find(bill_f).to_list(100000)
    sales_by_product = {}
    for b in bills:
        for it in b.get("items", []):
            pid = it.get("product_id")
            sales_by_product[pid] = sales_by_product.get(pid, 0) + it.get("quantity", 0)

    fast, slow, dead = [], [], []
    inv_value = 0
    for p in products:
        pid = str(p["_id"])
        stocks = await db.stocks.find({"product_id": pid}).to_list(100)
        if scope_oid:
            qty = sum(s.get("quantity", 0) for s in stocks if s.get("outlet_id") == scope_oid)
        else:
            qty = sum(s.get("quantity", 0) for s in stocks)
        sold = sales_by_product.get(pid, 0)
        item = {
            "id": pid,
            "name": p["name"],
            "sku": p.get("sku"),
            "stock": qty,
            "sold_90d": sold,
            "cost_price": p.get("cost_price", 0),
            "value": qty * p.get("cost_price", 0),
        }
        inv_value += item["value"]
        if sold == 0:
            dead.append(item)
        elif sold >= 50:
            fast.append(item)
        else:
            slow.append(item)
    fast.sort(key=lambda x: x["sold_90d"], reverse=True)
    return {
        "total_inventory_value": round(inv_value, 2),
        "fast_moving": fast[:20],
        "slow_moving": sorted(slow, key=lambda x: x["sold_90d"], reverse=True)[:20],
        "dead_stock": dead[:50],
    }


@router.get("/reports/sales")
async def sales_report(
    days: int = 30,
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    scope_oid = _scoped_outlet_id(user, outlet_id)
    f = {"business_id": user["business_id"], "created_at": {"$gte": start}}
    if scope_oid:
        f["outlet_id"] = scope_oid
    bills = await db.bills.find(f).sort("created_at", -1).to_list(100000)
    return {
        "bills": [clean_doc(b) for b in bills[:500]],
        "total_count": len(bills),
        "total_revenue": round(sum(b.get("total", 0) for b in bills), 2),
    }
