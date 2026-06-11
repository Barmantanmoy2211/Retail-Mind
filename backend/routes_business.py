"""Routes for products, inventory, customers, bills, suppliers, expenses, etc."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import get_db, clean_doc, utcnow_iso
from auth_utils import get_current_user, require_roles, get_business_scope
from models import (
    ProductCreate, ProductUpdate, InventoryTxnCreate,
    CustomerCreate, CustomerUpdate, BillCreate,
    SupplierCreate, SupplierUpdate, PurchaseOrderCreate, PurchaseOrderUpdate,
    ExpenseCreate, ExpenseApprove, TaxConfigCreate, RewardConfig,
    CategoryCreate, PaymentMethod,
)
from routes_core import audit_log, _scope_filter

router = APIRouter(prefix="/api")


# ============ CATEGORIES ============
@router.get("/categories")
async def list_categories(user: dict = Depends(get_business_scope)):
    db = get_db()
    docs = await db.categories.find({"business_id": user["business_id"]}).to_list(1000)
    return [clean_doc(d) for d in docs]


@router.post("/categories")
async def create_category(
    payload: CategoryCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["created_at"] = utcnow_iso()
    res = await db.categories.insert_one(doc)
    return {"id": str(res.inserted_id)}


@router.delete("/categories/{cid}")
async def delete_category(
    cid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.categories.delete_one({"_id": ObjectId(cid), "business_id": user["business_id"]})
    return {"success": True}


# ============ PRODUCTS ============
@router.get("/products")
async def list_products(
    outlet_id: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if outlet_id:
        f["outlet_id"] = outlet_id
    elif user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        f["$or"] = [{"outlet_id": user["outlet_id"]}, {"outlet_id": None}]
    if search:
        f["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
            {"barcode": search},
        ]
    docs = await db.products.find(f).to_list(2000)
    # attach stock per outlet
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        stocks = await db.stocks.find({"product_id": d["id"]}).to_list(100)
        d["stock_by_outlet"] = {s["outlet_id"]: s["quantity"] for s in stocks}
        d["total_stock"] = sum(s["quantity"] for s in stocks)
    return docs


@router.post("/products")
async def create_product(
    payload: ProductCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["active"] = True
    doc["created_at"] = utcnow_iso()
    doc["updated_at"] = utcnow_iso()
    res = await db.products.insert_one(doc)
    await audit_log(user, "create", "product", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/products/{pid}")
async def update_product(
    pid: str,
    payload: ProductUpdate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    await db.products.update_one(
        {"_id": ObjectId(pid), "business_id": user["business_id"]},
        {"$set": update},
    )
    await audit_log(user, "update", "product", pid)
    return {"success": True}


@router.delete("/products/{pid}")
async def delete_product(
    pid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.products.delete_one({"_id": ObjectId(pid), "business_id": user["business_id"]})
    await db.stocks.delete_many({"product_id": pid})
    await audit_log(user, "delete", "product", pid)
    return {"success": True}


# ============ INVENTORY ============
@router.get("/inventory/transactions")
async def list_inventory_txns(
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if outlet_id:
        f["outlet_id"] = outlet_id
    docs = await db.inventory_txns.find(f).sort("created_at", -1).limit(500).to_list(500)
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        p = await db.products.find_one({"_id": ObjectId(d["product_id"])})
        d["product_name"] = p["name"] if p else "(deleted)"
    return docs


async def _adjust_stock(db, product_id: str, outlet_id: str, delta: int, business_id: str):
    existing = await db.stocks.find_one({"product_id": product_id, "outlet_id": outlet_id})
    if existing:
        await db.stocks.update_one(
            {"_id": existing["_id"]},
            {"$inc": {"quantity": delta}, "$set": {"updated_at": utcnow_iso()}},
        )
    else:
        await db.stocks.insert_one({
            "product_id": product_id,
            "outlet_id": outlet_id,
            "business_id": business_id,
            "quantity": delta,
            "updated_at": utcnow_iso(),
        })


@router.post("/inventory/transactions")
async def create_inventory_txn(
    payload: InventoryTxnCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["created_by"] = user["id"]
    doc["created_at"] = utcnow_iso()
    res = await db.inventory_txns.insert_one(doc)
    txn_type = payload.type
    delta = 0
    if txn_type == "stock_in":
        delta = payload.quantity
    elif txn_type == "stock_out":
        delta = -payload.quantity
    elif txn_type == "adjustment":
        delta = payload.quantity  # signed
    elif txn_type == "transfer":
        await _adjust_stock(db, payload.product_id, payload.outlet_id, -payload.quantity, user["business_id"])
        await _adjust_stock(db, payload.product_id, payload.to_outlet_id, payload.quantity, user["business_id"])
    if txn_type != "transfer":
        await _adjust_stock(db, payload.product_id, payload.outlet_id, delta, user["business_id"])
    await audit_log(user, txn_type, "inventory", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.get("/inventory/low-stock")
async def low_stock(user: dict = Depends(get_business_scope)):
    db = get_db()
    products = await db.products.find({"business_id": user["business_id"]}).to_list(2000)
    alerts = []
    for p in products:
        pid = str(p["_id"])
        stocks = await db.stocks.find({"product_id": pid}).to_list(100)
        for s in stocks:
            if s["quantity"] <= p.get("min_stock", 0):
                outlet = await db.outlets.find_one({"_id": ObjectId(s["outlet_id"])})
                alerts.append({
                    "product_id": pid,
                    "product_name": p["name"],
                    "outlet_id": s["outlet_id"],
                    "outlet_name": outlet["name"] if outlet else "",
                    "stock": s["quantity"],
                    "min_stock": p.get("min_stock", 0),
                })
    return alerts


# ============ CUSTOMERS ============
@router.get("/customers")
async def list_customers(
    search: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if search:
        f["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.customers.find(f).sort("created_at", -1).limit(1000).to_list(1000)
    return [clean_doc(d) for d in docs]


@router.post("/customers")
async def create_customer(
    payload: CustomerCreate,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    existing = await db.customers.find_one({"business_id": user["business_id"], "phone": payload.phone})
    if existing:
        return clean_doc(existing)
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["reward_balance"] = 0
    doc["total_purchases"] = 0
    doc["total_spent"] = 0.0
    doc["created_at"] = utcnow_iso()
    doc["updated_at"] = utcnow_iso()
    res = await db.customers.insert_one(doc)
    return {"id": str(res.inserted_id)}


@router.put("/customers/{cid}")
async def update_customer(
    cid: str,
    payload: CustomerUpdate,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    await db.customers.update_one(
        {"_id": ObjectId(cid), "business_id": user["business_id"]},
        {"$set": update},
    )
    return {"success": True}


@router.get("/customers/{cid}")
async def customer_detail(cid: str, user: dict = Depends(get_business_scope)):
    db = get_db()
    c = await db.customers.find_one({"_id": ObjectId(cid), "business_id": user["business_id"]})
    if not c:
        raise HTTPException(404)
    c = clean_doc(c)
    bills = await db.bills.find({"customer_id": cid}).sort("created_at", -1).limit(100).to_list(100)
    c["bills"] = [clean_doc(b) for b in bills]
    rewards = await db.rewards.find({"customer_id": cid}).sort("created_at", -1).limit(100).to_list(100)
    c["reward_history"] = [clean_doc(r) for r in rewards]
    return c


# ============ BILLS / POS ============
@router.post("/bills")
async def create_bill(
    payload: BillCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager", "cashier")),
):
    db = get_db()
    if user.get("role") in ("outlet_manager", "cashier"):
        if user.get("outlet_id") and user["outlet_id"] != payload.outlet_id:
            raise HTTPException(403, "Cannot bill for other outlets")

    items_out = []
    subtotal = 0.0
    tax_total = 0.0
    reward_points_earned = 0
    for it in payload.items:
        p = await db.products.find_one({"_id": ObjectId(it.product_id)})
        if not p:
            raise HTTPException(400, f"Product not found: {it.product_id}")
        line_total = p["selling_price"] * it.quantity - it.discount
        tax_amt = line_total * (p.get("tax_percent", 0) / 100)
        subtotal += line_total
        tax_total += tax_amt
        reward_points_earned += p.get("reward_points", 0) * it.quantity
        items_out.append({
            "product_id": it.product_id,
            "product_name": p["name"],
            "sku": p.get("sku"),
            "quantity": it.quantity,
            "unit_price": p["selling_price"],
            "cost_price": p.get("cost_price", 0),
            "tax_percent": p.get("tax_percent", 0),
            "tax_amount": round(tax_amt, 2),
            "discount": it.discount,
            "line_total": round(line_total, 2),
        })
        # decrement stock
        await _adjust_stock(db, it.product_id, payload.outlet_id, -it.quantity, user["business_id"])
        await db.inventory_txns.insert_one({
            "business_id": user["business_id"],
            "product_id": it.product_id,
            "outlet_id": payload.outlet_id,
            "type": "sale",
            "quantity": -it.quantity,
            "created_by": user["id"],
            "created_at": utcnow_iso(),
        })

    # reward redemption
    redeem_value = 0.0
    redeem_pts = payload.redeem_points or 0
    customer = None
    if payload.customer_id:
        customer = await db.customers.find_one({"_id": ObjectId(payload.customer_id)})
        if customer and redeem_pts > 0:
            cfg = await db.reward_configs.find_one({"business_id": user["business_id"]})
            cpp = (cfg or {}).get("currency_per_point", 1.0)
            min_redeem = (cfg or {}).get("min_redeem_points", 100)
            if redeem_pts < min_redeem:
                raise HTTPException(400, f"Minimum {min_redeem} points to redeem")
            if redeem_pts > (customer.get("reward_balance") or 0):
                raise HTTPException(400, "Insufficient reward points")
            redeem_value = redeem_pts * cpp

    total = round(subtotal + tax_total - payload.discount_total - redeem_value, 2)
    bill_no_doc = await db.counters.find_one_and_update(
        {"_id": f"bill_{user['business_id']}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    bill_no = (bill_no_doc or {}).get("seq", 1)

    bill_doc = {
        "business_id": user["business_id"],
        "outlet_id": payload.outlet_id,
        "customer_id": payload.customer_id,
        "customer_name": customer["name"] if customer else "Walk-in",
        "customer_phone": customer["phone"] if customer else None,
        "bill_no": f"INV-{bill_no:06d}",
        "items": items_out,
        "subtotal": round(subtotal, 2),
        "tax_total": round(tax_total, 2),
        "discount_total": payload.discount_total,
        "redeem_points": redeem_pts,
        "redeem_value": round(redeem_value, 2),
        "total": total,
        "payment_method": payload.payment_method.value,
        "payment_splits": payload.payment_splits,
        "reward_points_earned": reward_points_earned,
        "cashier_id": user["id"],
        "cashier_name": user["name"],
        "note": payload.note,
        "created_at": utcnow_iso(),
    }
    res = await db.bills.insert_one(bill_doc)
    bill_id = str(res.inserted_id)

    # update customer
    if customer:
        new_balance = (customer.get("reward_balance") or 0) - redeem_pts + reward_points_earned
        await db.customers.update_one(
            {"_id": customer["_id"]},
            {"$inc": {"total_purchases": 1, "total_spent": total},
             "$set": {"reward_balance": new_balance, "updated_at": utcnow_iso()}},
        )
        if redeem_pts > 0:
            await db.rewards.insert_one({
                "business_id": user["business_id"],
                "customer_id": payload.customer_id,
                "bill_id": bill_id,
                "type": "redeem",
                "points": -redeem_pts,
                "value": redeem_value,
                "created_at": utcnow_iso(),
            })
        if reward_points_earned > 0:
            await db.rewards.insert_one({
                "business_id": user["business_id"],
                "customer_id": payload.customer_id,
                "bill_id": bill_id,
                "type": "earn",
                "points": reward_points_earned,
                "value": 0,
                "created_at": utcnow_iso(),
            })

    await audit_log(user, "create", "bill", bill_id, {"total": total})
    bill_doc.pop("_id", None)
    bill_doc["id"] = bill_id
    return bill_doc


@router.get("/bills")
async def list_bills(
    outlet_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    days: int = 30,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if outlet_id:
        f["outlet_id"] = outlet_id
    elif user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        f["outlet_id"] = user["outlet_id"]
    if customer_id:
        f["customer_id"] = customer_id
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    f["created_at"] = {"$gte": cutoff}
    docs = await db.bills.find(f).sort("created_at", -1).limit(500).to_list(500)
    return [clean_doc(d) for d in docs]


@router.get("/bills/{bill_id}")
async def get_bill(bill_id: str, user: dict = Depends(get_business_scope)):
    db = get_db()
    b = await db.bills.find_one({"_id": ObjectId(bill_id), "business_id": user["business_id"]})
    if not b:
        raise HTTPException(404)
    return clean_doc(b)


# ============ SUPPLIERS ============
@router.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_business_scope)):
    db = get_db()
    docs = await db.suppliers.find({"business_id": user["business_id"]}).to_list(1000)
    return [clean_doc(d) for d in docs]


@router.post("/suppliers")
async def create_supplier(
    payload: SupplierCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["created_at"] = utcnow_iso()
    res = await db.suppliers.insert_one(doc)
    await audit_log(user, "create", "supplier", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/suppliers/{sid}")
async def update_supplier(
    sid: str,
    payload: SupplierUpdate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.suppliers.update_one(
        {"_id": ObjectId(sid), "business_id": user["business_id"]},
        {"$set": update},
    )
    return {"success": True}


@router.delete("/suppliers/{sid}")
async def delete_supplier(
    sid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.suppliers.delete_one({"_id": ObjectId(sid), "business_id": user["business_id"]})
    return {"success": True}


# ============ PURCHASE ORDERS ============
@router.get("/purchase-orders")
async def list_pos(user: dict = Depends(get_business_scope)):
    db = get_db()
    f = {"business_id": user["business_id"]}
    docs = await db.purchase_orders.find(f).sort("created_at", -1).to_list(500)
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        s = await db.suppliers.find_one({"_id": ObjectId(d["supplier_id"])})
        d["supplier_name"] = s["name"] if s else "(deleted)"
    return docs


@router.post("/purchase-orders")
async def create_po(
    payload: PurchaseOrderCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    items = []
    total = 0.0
    for it in payload.items:
        p = await db.products.find_one({"_id": ObjectId(it.product_id)})
        if not p:
            continue
        line = it.cost_price * it.quantity
        total += line
        items.append({
            "product_id": it.product_id,
            "product_name": p["name"],
            "quantity": it.quantity,
            "cost_price": it.cost_price,
            "line_total": line,
        })
    doc = {
        "business_id": user["business_id"],
        "outlet_id": payload.outlet_id,
        "supplier_id": payload.supplier_id,
        "items": items,
        "total": round(total, 2),
        "status": "pending",
        "note": payload.note,
        "created_by": user["id"],
        "created_at": utcnow_iso(),
    }
    res = await db.purchase_orders.insert_one(doc)
    await audit_log(user, "create", "purchase_order", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/purchase-orders/{po_id}")
async def update_po(
    po_id: str,
    payload: PurchaseOrderUpdate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    po = await db.purchase_orders.find_one({"_id": ObjectId(po_id), "business_id": user["business_id"]})
    if not po:
        raise HTTPException(404)
    if payload.status == "received" and po["status"] != "received":
        for it in po["items"]:
            await _adjust_stock(db, it["product_id"], po["outlet_id"], it["quantity"], user["business_id"])
            await db.inventory_txns.insert_one({
                "business_id": user["business_id"],
                "product_id": it["product_id"],
                "outlet_id": po["outlet_id"],
                "type": "stock_in",
                "quantity": it["quantity"],
                "note": f"PO {po_id} received",
                "created_by": user["id"],
                "created_at": utcnow_iso(),
            })
        # create expense for the PO total
        await db.expenses.insert_one({
            "business_id": user["business_id"],
            "outlet_id": po["outlet_id"],
            "category": "inventory",
            "subcategory": "stock_purchase",
            "amount": po["total"],
            "description": f"Purchase Order {po_id}",
            "status": "approved",
            "created_by": user["id"],
            "created_at": utcnow_iso(),
            "approved_at": utcnow_iso(),
            "approved_by": user["id"],
        })
    await db.purchase_orders.update_one(
        {"_id": ObjectId(po_id)},
        {"$set": {"status": payload.status, "updated_at": utcnow_iso()}},
    )
    await audit_log(user, f"po_{payload.status}", "purchase_order", po_id)
    return {"success": True}


# ============ EXPENSES ============
@router.get("/expenses")
async def list_expenses(
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if outlet_id:
        f["outlet_id"] = outlet_id
    elif user.get("role") == "outlet_manager" and user.get("outlet_id"):
        f["outlet_id"] = user["outlet_id"]
    if status:
        f["status"] = status
    docs = await db.expenses.find(f).sort("created_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        if d.get("outlet_id"):
            o = await db.outlets.find_one({"_id": ObjectId(d["outlet_id"])})
            d["outlet_name"] = o["name"] if o else ""
    return docs


@router.post("/expenses")
async def create_expense(
    payload: ExpenseCreate,
    user: dict = Depends(require_roles("business_admin", "outlet_manager")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["status"] = "approved" if user["role"] == "business_admin" else "pending"
    doc["created_by"] = user["id"]
    doc["created_at"] = utcnow_iso()
    res = await db.expenses.insert_one(doc)
    await audit_log(user, "create", "expense", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/expenses/{eid}/action")
async def expense_action(
    eid: str,
    payload: ExpenseApprove,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.expenses.update_one(
        {"_id": ObjectId(eid), "business_id": user["business_id"]},
        {"$set": {
            "status": "approved" if payload.action == "approve" else "rejected",
            "approved_by": user["id"],
            "approved_at": utcnow_iso(),
            "approve_note": payload.note,
        }},
    )
    await audit_log(user, f"expense_{payload.action}", "expense", eid)
    return {"success": True}


@router.delete("/expenses/{eid}")
async def delete_expense(
    eid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.expenses.delete_one({"_id": ObjectId(eid), "business_id": user["business_id"]})
    return {"success": True}


# ============ REWARDS CONFIG ============
@router.get("/rewards/config")
async def get_reward_config(user: dict = Depends(get_business_scope)):
    db = get_db()
    cfg = await db.reward_configs.find_one({"business_id": user["business_id"]})
    if not cfg:
        cfg = {"business_id": user["business_id"], "points_per_currency": 1.0,
               "currency_per_point": 1.0, "min_redeem_points": 100, "expiry_days": 365}
    return clean_doc(cfg)


@router.put("/rewards/config")
async def update_reward_config(
    payload: RewardConfig,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.reward_configs.update_one(
        {"business_id": user["business_id"]},
        {"$set": payload.model_dump()},
        upsert=True,
    )
    return {"success": True}


# ============ TAX CONFIG ============
@router.get("/taxes/configs")
async def list_tax_configs(user: dict = Depends(get_business_scope)):
    db = get_db()
    docs = await db.tax_configs.find({"business_id": user["business_id"]}).to_list(100)
    return [clean_doc(d) for d in docs]


@router.post("/taxes/configs")
async def create_tax_config(
    payload: TaxConfigCreate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    res = await db.tax_configs.insert_one(doc)
    return {"id": str(res.inserted_id)}


@router.delete("/taxes/configs/{tid}")
async def delete_tax_config(
    tid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.tax_configs.delete_one({"_id": ObjectId(tid), "business_id": user["business_id"]})
    return {"success": True}


# ============ AUDIT LOGS ============
@router.get("/audit-logs")
async def list_audit_logs(
    days: int = 30,
    user: dict = Depends(require_roles("business_admin", "platform_admin")),
):
    db = get_db()
    f = {}
    if user["role"] != "platform_admin":
        f["business_id"] = user["business_id"]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    f["timestamp"] = {"$gte": cutoff}
    docs = await db.audit_logs.find(f).sort("timestamp", -1).limit(500).to_list(500)
    return [clean_doc(d) for d in docs]


# ============ NOTIFICATIONS ============
@router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    db = get_db()
    f = {}
    if user.get("business_id"):
        f["business_id"] = user["business_id"]
    docs = await db.notifications.find(f).sort("created_at", -1).limit(50).to_list(50)
    return [clean_doc(d) for d in docs]


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one({"_id": ObjectId(nid)}, {"$set": {"read": True}})
    return {"success": True}
