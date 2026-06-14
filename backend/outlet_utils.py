"""Outlet helpers — stats, staff counts, warehouse lookups."""
from datetime import datetime, timezone, timedelta
from bson import ObjectId


async def count_outlet_staff(db, business_id: str, outlet_id: str) -> int:
    return await db.users.count_documents({
        "business_id": business_id,
        "active": {"$ne": False},
        "role": {"$nin": ["business_admin", "platform_admin"]},
        "$or": [{"outlet_id": outlet_id}, {"outlet_ids": outlet_id}],
    })


async def compute_outlet_stats_30d(db, business_id: str, outlet_id: str) -> dict:
    """Revenue, expenses, and net profit for the last 30 days."""
    start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    bills = await db.bills.find({
        "business_id": business_id,
        "outlet_id": outlet_id,
        "created_at": {"$gte": start},
    }).to_list(100000)
    expenses = await db.expenses.find({
        "business_id": business_id,
        "outlet_id": outlet_id,
        "status": "approved",
        "created_at": {"$gte": start},
    }).to_list(100000)

    revenue = sum(float(b.get("total") or 0) for b in bills)
    tax = sum(float(b.get("tax_total") or 0) for b in bills)
    cogs = sum(
        float(it.get("cost_price") or 0) * float(it.get("quantity") or 0)
        for b in bills
        for it in b.get("items", [])
    )
    expense_total = sum(float(e.get("amount") or 0) for e in expenses)
    profit = revenue - cogs - tax - expense_total

    stock_value = 0.0
    stocks = await db.stocks.find({"outlet_id": outlet_id}).to_list(5000)
    for s in stocks:
        try:
            p = await db.products.find_one({"_id": ObjectId(s["product_id"])})
        except Exception:
            p = None
        if p:
            stock_value += float(s.get("quantity") or 0) * float(p.get("cost_price") or 0)

    return {
        "staff_count": await count_outlet_staff(db, business_id, outlet_id),
        "revenue_30d": round(revenue, 2),
        "expenses_30d": round(expense_total, 2),
        "profit_30d": round(profit, 2),
        "orders_30d": len(bills),
        "stock_value": round(stock_value, 2),
    }


async def get_business_warehouse(db, business_id: str):
    return await db.outlets.find_one({
        "business_id": business_id,
        "is_warehouse": True,
    })
