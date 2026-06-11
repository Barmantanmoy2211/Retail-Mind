"""Uploads, Health Score, and Excel export routes."""
import io
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from bson import ObjectId
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from db import get_db, clean_doc
from auth_utils import get_current_user, require_roles, get_business_scope, hash_password
from s3_utils import upload_bytes, is_configured as s3_is_configured
from pdf_invoice import build_invoice_pdf

router = APIRouter(prefix="/api")

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_IMAGE_MB = 5


# ============ PDF INVOICE ============
@router.get("/bills/{bill_id}/invoice.pdf")
async def bill_pdf(bill_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        bill = await db.bills.find_one({"_id": ObjectId(bill_id)})
    except Exception:
        raise HTTPException(400, "Invalid bill id")
    if not bill:
        raise HTTPException(404, "Bill not found")
    # tenant check
    if user.get("role") != "platform_admin" and bill.get("business_id") != user.get("business_id"):
        raise HTTPException(403, "Forbidden")
    biz = await db.businesses.find_one({"_id": ObjectId(bill["business_id"])})
    outlet = None
    if bill.get("outlet_id"):
        outlet = await db.outlets.find_one({"_id": ObjectId(bill["outlet_id"])})

    pdf_bytes = build_invoice_pdf(bill, biz or {}, outlet)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{bill.get("bill_no", "invoice")}.pdf"'},
    )


# ============ PLATFORM ADMINS (only platform_admin can manage) ============
from pydantic import BaseModel, EmailStr
from typing import Optional as Opt


class PlatformAdminCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Opt[str] = None


@router.get("/platform/admins")
async def list_platform_admins(user: dict = Depends(require_roles("platform_admin"))):
    db = get_db()
    docs = await db.users.find({"role": "platform_admin"}, {"password_hash": 0}).to_list(100)
    return [clean_doc(d) for d in docs]


@router.post("/platform/admins")
async def create_platform_admin(
    payload: PlatformAdminCreate,
    user: dict = Depends(require_roles("platform_admin")),
):
    db = get_db()
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    doc = {
        "name": payload.name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": "platform_admin",
        "business_id": None,
        "outlet_id": None,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    res = await db.users.insert_one(doc)
    await db.audit_logs.insert_one({
        "user_id": user["id"],
        "user_name": user["name"],
        "action": "create_platform_admin",
        "entity": "user",
        "entity_id": str(res.inserted_id),
        "details": {"email": payload.email.lower()},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": str(res.inserted_id)}


@router.delete("/platform/admins/{admin_id}")
async def delete_platform_admin(
    admin_id: str,
    user: dict = Depends(require_roles("platform_admin")),
):
    if admin_id == user["id"]:
        raise HTTPException(400, "Cannot delete yourself")
    db = get_db()
    # safety: keep at least 1 platform admin
    count = await db.users.count_documents({"role": "platform_admin", "active": True})
    if count <= 1:
        raise HTTPException(400, "At least one platform admin must remain")
    res = await db.users.delete_one({"_id": ObjectId(admin_id), "role": "platform_admin"})
    if res.deleted_count == 0:
        raise HTTPException(404, "Admin not found")
    return {"success": True}


@router.put("/platform/admins/{admin_id}/toggle")
async def toggle_platform_admin(
    admin_id: str,
    user: dict = Depends(require_roles("platform_admin")),
):
    if admin_id == user["id"]:
        raise HTTPException(400, "Cannot disable yourself")
    db = get_db()
    admin = await db.users.find_one({"_id": ObjectId(admin_id), "role": "platform_admin"})
    if not admin:
        raise HTTPException(404, "Admin not found")
    await db.users.update_one(
        {"_id": ObjectId(admin_id)},
        {"$set": {"active": not admin.get("active", True), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "active": not admin.get("active", True)}



# ============ UPLOADS ============
@router.get("/uploads/status")
async def upload_status(user: dict = Depends(get_current_user)):
    return {"s3_configured": s3_is_configured()}


@router.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Query("products"),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}")
    data = await file.read()
    if len(data) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(400, f"Max image size: {MAX_IMAGE_MB}MB")
    biz_id = user.get("business_id") or "platform"
    url = upload_bytes(data, file.content_type, folder=f"{biz_id}/{folder}")
    return {"url": url, "size": len(data)}


# ============ HEALTH SCORE (Formula-based, no LLM) ============
@router.get("/health-score")
async def health_score(
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    biz_id = user["business_id"]

    outlets = []
    if outlet_id:
        try:
            o = await db.outlets.find_one({"_id": ObjectId(outlet_id), "business_id": biz_id})
        except Exception:
            raise HTTPException(400, "Invalid outlet_id")
        if o:
            outlets = [o]
    else:
        outlets = await db.outlets.find({"business_id": biz_id}).to_list(100)

    now = datetime.now(timezone.utc)
    cur_start = (now - timedelta(days=30)).isoformat()
    prev_start = (now - timedelta(days=60)).isoformat()

    results = []
    for o in outlets:
        oid = str(o["_id"])
        # 1. Sales growth: this 30d vs prev 30d
        cur_bills = await db.bills.find({"business_id": biz_id, "outlet_id": oid, "created_at": {"$gte": cur_start}}).to_list(100000)
        prev_bills = await db.bills.find({"business_id": biz_id, "outlet_id": oid, "created_at": {"$gte": prev_start, "$lt": cur_start}}).to_list(100000)
        cur_rev = sum(b.get("total", 0) for b in cur_bills)
        prev_rev = sum(b.get("total", 0) for b in prev_bills)
        cur_cogs = sum((it.get("cost_price", 0) * it.get("quantity", 0)) for b in cur_bills for it in b.get("items", []))
        cur_tax = sum(b.get("tax_total", 0) for b in cur_bills)
        cur_expenses = sum(e.get("amount", 0) for e in (await db.expenses.find({"business_id": biz_id, "outlet_id": oid, "status": "approved", "created_at": {"$gte": cur_start}}).to_list(100000)))

        sales_growth_pct = ((cur_rev - prev_rev) / prev_rev * 100) if prev_rev > 0 else (100 if cur_rev > 0 else 0)
        sales_growth_score = max(0, min(100, 50 + sales_growth_pct))  # 0% growth = 50, +50% = 100, -50% = 0

        # 2. Profit margin
        profit = cur_rev - cur_cogs - cur_tax - cur_expenses
        profit_margin = (profit / cur_rev * 100) if cur_rev > 0 else 0
        profit_score = max(0, min(100, profit_margin * 4))  # 25% margin = 100

        # 3. Customer growth
        cur_cust_ids = set(b.get("customer_id") for b in cur_bills if b.get("customer_id"))
        prev_cust_ids = set(b.get("customer_id") for b in prev_bills if b.get("customer_id"))
        new_cust = len(cur_cust_ids - prev_cust_ids)
        cust_score = max(0, min(100, new_cust * 10))  # 10 new = 100

        # 4. Inventory health (% products NOT in low stock)
        products = await db.products.find({"business_id": biz_id}).to_list(5000)
        low_count = 0
        total_count = 0
        for p in products:
            stocks = await db.stocks.find({"product_id": str(p["_id"]), "outlet_id": oid}).to_list(10)
            for s in stocks:
                total_count += 1
                if s.get("quantity", 0) <= p.get("min_stock", 0):
                    low_count += 1
        inv_score = ((total_count - low_count) / total_count * 100) if total_count > 0 else 50

        # 5. Expense ratio (lower better)
        exp_ratio = (cur_expenses / cur_rev * 100) if cur_rev > 0 else 100
        exp_score = max(0, min(100, 100 - exp_ratio))  # 0% = 100, 100% = 0

        # 6. Tax compliance (assume 100 if tax_total > 0 and bills present)
        tax_score = 100 if cur_tax > 0 or len(cur_bills) == 0 else 50

        # 7. Reward engagement (% of bills with customer)
        with_cust = sum(1 for b in cur_bills if b.get("customer_id"))
        reward_score = (with_cust / len(cur_bills) * 100) if cur_bills else 50

        # Weighted total (sums to 100)
        total = (
            sales_growth_score * 0.25 +
            profit_score * 0.20 +
            cust_score * 0.15 +
            inv_score * 0.15 +
            exp_score * 0.10 +
            tax_score * 0.10 +
            reward_score * 0.05
        )
        total = round(total)

        status = ("Excellent" if total >= 81 else
                  "Good" if total >= 61 else
                  "Needs Attention" if total >= 41 else "Critical")

        recommendations = []
        if sales_growth_score < 50:
            recommendations.append(f"Sales dropped {abs(sales_growth_pct):.0f}% vs last 30d — run a campaign or promo")
        if profit_score < 50:
            recommendations.append(f"Margin is {profit_margin:.0f}% — review pricing or cut overhead")
        if cust_score < 30:
            recommendations.append("Few new customers — invest in marketing or referrals")
        if inv_score < 70:
            recommendations.append(f"{low_count} SKUs below min-stock — restock soon")
        if exp_score < 50:
            recommendations.append(f"Expenses are {exp_ratio:.0f}% of revenue — investigate")
        if reward_score < 30:
            recommendations.append("Less than 30% of bills are tied to customers — push loyalty signup")
        if not recommendations:
            recommendations.append("All systems healthy — consider expansion or new offerings ✨")

        results.append({
            "outlet_id": oid,
            "outlet_name": o["name"],
            "score": total,
            "status": status,
            "metrics": {
                "sales_growth": {"score": round(sales_growth_score), "value_pct": round(sales_growth_pct, 1), "weight": 25},
                "profit_margin": {"score": round(profit_score), "value_pct": round(profit_margin, 1), "weight": 20},
                "customer_growth": {"score": round(cust_score), "new_customers": new_cust, "weight": 15},
                "inventory_health": {"score": round(inv_score), "low_stock": low_count, "total": total_count, "weight": 15},
                "expense_control": {"score": round(exp_score), "expense_ratio_pct": round(exp_ratio, 1), "weight": 10},
                "tax_compliance": {"score": round(tax_score), "weight": 10},
                "reward_engagement": {"score": round(reward_score), "weight": 5},
            },
            "recommendations": recommendations,
            "revenue_30d": round(cur_rev, 2),
            "profit_30d": round(profit, 2),
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"outlets": results}


# ============ EXCEL EXPORTS ============
def _excel_response(wb: Workbook, filename: str):
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _style_header(ws, row=1):
    for cell in ws[row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0055FF", end_color="0055FF", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")


@router.get("/exports/bills.xlsx")
async def export_bills(
    days: int = 30,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        f["outlet_id"] = user["outlet_id"]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    f["created_at"] = {"$gte": cutoff}
    bills = await db.bills.find(f).sort("created_at", -1).to_list(100000)

    wb = Workbook()
    ws = wb.active
    ws.title = "Bills"
    ws.append(["Bill No", "Date", "Customer", "Phone", "Outlet", "Items", "Subtotal", "Tax", "Discount", "Total", "Payment", "Cashier"])
    _style_header(ws)

    outlets = {str(o["_id"]): o["name"] for o in await db.outlets.find({"business_id": user["business_id"]}).to_list(100)}
    for b in bills:
        ws.append([
            b.get("bill_no", ""),
            b.get("created_at", "")[:19].replace("T", " "),
            b.get("customer_name", ""),
            b.get("customer_phone", "") or "",
            outlets.get(b.get("outlet_id", ""), ""),
            len(b.get("items", [])),
            b.get("subtotal", 0),
            b.get("tax_total", 0),
            b.get("discount_total", 0),
            b.get("total", 0),
            b.get("payment_method", ""),
            b.get("cashier_name", ""),
        ])
    for col_idx in range(1, 13):
        ws.column_dimensions[chr(64 + col_idx)].width = 18

    return _excel_response(wb, f"bills-{datetime.now().strftime('%Y%m%d')}.xlsx")


@router.get("/exports/products.xlsx")
async def export_products(user: dict = Depends(get_business_scope)):
    db = get_db()
    products = await db.products.find({"business_id": user["business_id"]}).to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append(["Name", "SKU", "Barcode", "Category", "Cost Price", "Selling Price", "Tax %", "Reward Pts", "Min Stock", "Total Stock"])
    _style_header(ws)
    for p in products:
        pid = str(p["_id"])
        stocks = await db.stocks.find({"product_id": pid}).to_list(100)
        total = sum(s.get("quantity", 0) for s in stocks)
        ws.append([
            p.get("name", ""), p.get("sku", ""), p.get("barcode", "") or "",
            p.get("category", "") or "", p.get("cost_price", 0), p.get("selling_price", 0),
            p.get("tax_percent", 0), p.get("reward_points", 0), p.get("min_stock", 0), total,
        ])
    for col in "ABCDEFGHIJ":
        ws.column_dimensions[col].width = 18
    return _excel_response(wb, f"products-{datetime.now().strftime('%Y%m%d')}.xlsx")


@router.get("/exports/customers.xlsx")
async def export_customers(user: dict = Depends(get_business_scope)):
    db = get_db()
    customers = await db.customers.find({"business_id": user["business_id"]}).to_list(10000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Customers"
    ws.append(["Name", "Phone", "Email", "Address", "Reward Balance", "Total Purchases", "Total Spent", "Joined"])
    _style_header(ws)
    for c in customers:
        ws.append([
            c.get("name", ""), c.get("phone", ""), c.get("email", "") or "",
            c.get("address", "") or "", c.get("reward_balance", 0),
            c.get("total_purchases", 0), c.get("total_spent", 0),
            c.get("created_at", "")[:10],
        ])
    for col in "ABCDEFGH":
        ws.column_dimensions[col].width = 22
    return _excel_response(wb, f"customers-{datetime.now().strftime('%Y%m%d')}.xlsx")


@router.get("/exports/profit-loss.xlsx")
async def export_pl(
    period: str = "monthly",
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    days_map = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
    days = days_map.get(period, 30)
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    f = {"business_id": user["business_id"], "created_at": {"$gte": start}}
    bills = await db.bills.find(f).to_list(100000)
    expenses = await db.expenses.find({**f, "status": "approved"}).to_list(100000)

    revenue = sum(b.get("total", 0) for b in bills)
    tax = sum(b.get("tax_total", 0) for b in bills)
    cogs = sum(it.get("cost_price", 0) * it.get("quantity", 0) for b in bills for it in b.get("items", []))
    exp_total = sum(e.get("amount", 0) for e in expenses)

    wb = Workbook()
    ws = wb.active
    ws.title = "P&L"
    ws.append(["Profit & Loss Statement", ""])
    ws["A1"].font = Font(bold=True, size=16)
    ws.append(["Period", period.title()])
    ws.append(["Generated", datetime.now().strftime("%Y-%m-%d %H:%M")])
    ws.append([""])
    ws.append(["Line Item", "Amount"])
    _style_header(ws, row=5)
    ws.append(["Revenue", revenue])
    ws.append(["COGS (Cost of Goods Sold)", -cogs])
    ws.append(["Gross Profit", revenue - cogs])
    ws.append(["Tax Collected", -tax])
    ws.append(["Operating Expenses", -exp_total])
    ws.append(["Net Profit", revenue - cogs - tax - exp_total])
    ws["A11"].font = Font(bold=True)
    ws["B11"].font = Font(bold=True)
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 18

    # Expense breakdown sheet
    ws2 = wb.create_sheet("Expenses by Category")
    by_cat = {}
    for e in expenses:
        c = e.get("category", "misc")
        by_cat[c] = by_cat.get(c, 0) + e.get("amount", 0)
    ws2.append(["Category", "Amount"])
    _style_header(ws2)
    for k, v in sorted(by_cat.items(), key=lambda x: -x[1]):
        ws2.append([k.title(), v])
    ws2.column_dimensions["A"].width = 25
    ws2.column_dimensions["B"].width = 18

    return _excel_response(wb, f"profit-loss-{period}-{datetime.now().strftime('%Y%m%d')}.xlsx")
