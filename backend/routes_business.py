"""Routes for products, inventory, customers, bills, suppliers, expenses, etc."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import get_db, clean_doc, utcnow_iso
from auth_utils import get_current_user, require_roles, get_business_scope, require_permission_or_roles
from models import (
    ProductCreate, ProductUpdate, ProductAssignOutlets, InventoryTxnCreate,
    CustomerCreate, CustomerUpdate, BillCreate,
    SupplierCreate, SupplierUpdate, PurchaseOrderCreate, PurchaseOrderUpdate,
    StockRequestCreate, PurchaseOrderApprove,
    ExpenseCreate, ExpenseApprove, TaxConfigCreate, RewardConfig,
    CategoryCreate, PaymentMethod,
)
from routes_core import audit_log, _scope_filter
from permissions import is_business_owner, get_user_permissions, has_permission
from workflow_engine import start_expense_approval, process_approval
from salary_expense_sync import sync_salary_expenses, build_expense_scope_filter, get_user_accessible_outlet_ids
from product_cost import enrich_product_suppliers, recalculate_product_cost_from_pos, get_supplier_cost_map
from notification_utils import notify_stock_request
from outlet_utils import get_business_warehouse

router = APIRouter(prefix="/api")


def _product_status(product: dict) -> str:
    return product.get("status", "approved")


def _product_assigned_to_outlet(product: dict, outlet_id: str) -> bool:
    if not outlet_id:
        return True
    outlet_ids = product.get("outlet_ids")
    if outlet_ids:
        return outlet_id in outlet_ids
    legacy = product.get("outlet_id")
    if legacy is None:
        return True
    return legacy == outlet_id


async def _validate_outlets_for_business(db, business_id: str, outlet_ids: list):
    for oid in outlet_ids:
        if not await db.outlets.find_one({"_id": ObjectId(oid), "business_id": business_id}):
            raise HTTPException(400, f"Invalid outlet: {oid}")


async def _enforce_outlet_access(user: dict, outlet_id: str):
    if user.get("role") in ("business_admin", "platform_admin"):
        return
    db = get_db()
    accessible = await get_user_accessible_outlet_ids(db, user)
    if accessible and outlet_id not in accessible:
        raise HTTPException(403, "Not allowed for this outlet")


async def _business_outlet_ids(db, business_id: str) -> list:
    outlets = await db.outlets.find(
        {"business_id": business_id, "active": {"$ne": False}}
    ).to_list(100)
    return [str(o["_id"]) for o in outlets]


async def _business_outlet_lookup(db, business_id: str) -> tuple[dict, dict]:
    outlets = await db.outlets.find(
        {"business_id": business_id, "active": {"$ne": False}}
    ).to_list(200)
    id_to_name = {str(o["_id"]): o["name"] for o in outlets}
    name_to_id = {o["name"]: str(o["_id"]) for o in outlets}
    return id_to_name, name_to_id


def _is_object_id(value: str) -> bool:
    return isinstance(value, str) and len(value) == 24 and ObjectId.is_valid(value)


def _normalize_outlet_ids(
    outlet_ids: Optional[list],
    id_to_name: dict,
    name_to_id: dict,
) -> list:
    if not outlet_ids:
        return []
    normalized = []
    seen = set()
    for raw in outlet_ids:
        if not raw:
            continue
        if raw in id_to_name:
            oid = raw
        elif raw in name_to_id:
            oid = name_to_id[raw]
        elif _is_object_id(raw):
            oid = raw
        else:
            continue
        if oid not in seen:
            seen.add(oid)
            normalized.append(oid)
    return normalized


def _enrich_product_outlets(product: dict, id_to_name: dict, name_to_id: dict) -> None:
    raw_ids = product.get("outlet_ids")
    normalized = _normalize_outlet_ids(raw_ids, id_to_name, name_to_id)
    total_outlets = len(id_to_name)
    if not normalized or (total_outlets and len(normalized) >= total_outlets):
        product["all_outlets"] = True
        product["outlet_names"] = []
        product["outlet_ids"] = normalized or list(id_to_name.keys())
    else:
        product["all_outlets"] = False
        product["outlet_names"] = [
            id_to_name[oid] for oid in normalized if oid in id_to_name
        ]
        product["outlet_ids"] = normalized


def _filter_products_for_user(docs: list, user: dict, outlet_id: Optional[str], approved_only: bool) -> list:
    role = user.get("role")
    oid = outlet_id or user.get("outlet_id")
    filtered = []
    for d in docs:
        status = _product_status(d)
        if approved_only and status != "approved":
            continue
        if role in ("outlet_manager", "cashier") and oid:
            if status != "approved" or not _product_assigned_to_outlet(d, oid):
                continue
        elif role == "business_admin" and outlet_id:
            if not _product_assigned_to_outlet(d, outlet_id):
                continue
        filtered.append(d)
    return filtered


# ============ CATEGORIES ============
@router.get("/categories")
async def list_categories(user: dict = Depends(get_business_scope)):
    db = get_db()
    docs = await db.categories.find({"business_id": user["business_id"]}).to_list(1000)
    return [clean_doc(d) for d in docs]


@router.post("/categories")
async def create_category(
    payload: CategoryCreate,
    user: dict = Depends(require_permission_or_roles("products.edit", "business_admin", "outlet_manager")),
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
    user: dict = Depends(require_permission_or_roles("products.edit", "business_admin")),
):
    db = get_db()
    await db.categories.delete_one({"_id": ObjectId(cid), "business_id": user["business_id"]})
    return {"success": True}


# ============ PRODUCTS ============
@router.get("/products")
async def list_products(
    outlet_id: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    approved_only: bool = False,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if status:
        f["status"] = status
    if search:
        f["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
            {"barcode": search},
        ]
    docs = await db.products.find(f).to_list(2000)
    id_to_name, name_to_id = await _business_outlet_lookup(db, user["business_id"])
    for d in docs:
        d["outlet_ids"] = _normalize_outlet_ids(d.get("outlet_ids"), id_to_name, name_to_id)
    docs = _filter_products_for_user(docs, user, outlet_id, approved_only)
    scope_outlet = outlet_id or user.get("outlet_id")
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        stocks = await db.stocks.find({"product_id": d["id"]}).to_list(100)
        d["stock_by_outlet"] = {s["outlet_id"]: s["quantity"] for s in stocks}
        d["total_stock"] = sum(s["quantity"] for s in stocks)
        if scope_outlet:
            d["outlet_stock"] = d["stock_by_outlet"].get(scope_outlet, 0)
        _enrich_product_outlets(d, id_to_name, name_to_id)
        await enrich_product_suppliers(db, d)
    return docs


@router.get("/products/{pid}/cost-breakdown")
async def product_cost_breakdown(pid: str, user: dict = Depends(get_business_scope)):
    db = get_db()
    product = await db.products.find_one({"_id": ObjectId(pid), "business_id": user["business_id"]})
    if not product:
        raise HTTPException(404, "Product not found")
    costs = await get_supplier_cost_map(db, user["business_id"], pid)
    supplier_details = []
    for sid, price in costs.items():
        s = await db.suppliers.find_one({"_id": ObjectId(sid)})
        supplier_details.append({"supplier_id": sid, "supplier_name": s.get("name") if s else sid, "unit_cost": price})
    avg = round(sum(costs.values()) / len(costs), 2) if costs else product.get("cost_price", 0)
    return {
        "product_id": pid,
        "product_name": product.get("name"),
        "supplier_ids": product.get("supplier_ids", []),
        "supplier_prices": supplier_details,
        "average_cost": avg,
        "cost_source": "po_average" if costs else "manual",
    }


@router.post("/products")
async def create_product(
    payload: ProductCreate,
    user: dict = Depends(require_permission_or_roles("products.create", "business_admin", "outlet_manager")),
):
    db = get_db()
    data = payload.model_dump()
    outlet_ids = data.pop("outlet_ids", None) or []
    initial_stock = data.pop("initial_stock", 0) or 0
    data.pop("outlet_id", None)

    doc = {k: v for k, v in data.items() if v is not None}
    doc["business_id"] = user["business_id"]
    doc["created_by"] = user["id"]
    doc["created_at"] = utcnow_iso()
    doc["updated_at"] = utcnow_iso()

    supplier_ids = doc.get("supplier_ids") or []
    if user["role"] == "outlet_manager":
        if not user.get("outlet_id"):
            raise HTTPException(400, "No outlet assigned to your account")
        outlet_ids = [user["outlet_id"]]
        doc["outlet_id"] = user["outlet_id"]
    else:
        if is_business_owner(user) and len(supplier_ids) < 1:
            raise HTTPException(400, "At least one supplier is required per product")
        if supplier_ids:
            for sid in supplier_ids:
                if not await db.suppliers.find_one({"_id": ObjectId(sid), "business_id": user["business_id"]}):
                    raise HTTPException(400, f"Invalid supplier: {sid}")
        if outlet_ids:
            id_map, name_map = await _business_outlet_lookup(db, user["business_id"])
            outlet_ids = _normalize_outlet_ids(outlet_ids, id_map, name_map)
            await _validate_outlets_for_business(db, user["business_id"], outlet_ids)
        else:
            outlet_ids = await _business_outlet_ids(db, user["business_id"])

    doc["status"] = "approved"
    doc["active"] = True
    doc["outlet_ids"] = outlet_ids
    res = await db.products.insert_one(doc)
    pid = str(res.inserted_id)

    if initial_stock > 0:
        for oid in outlet_ids:
            await _adjust_stock(db, pid, oid, initial_stock, user["business_id"])

    await audit_log(user, "create", "product", pid)
    return {"id": pid, "status": "approved"}


@router.put("/products/{pid}")
async def update_product(
    pid: str,
    payload: ProductUpdate,
    user: dict = Depends(require_permission_or_roles("products.edit", "business_admin", "outlet_manager")),
):
    db = get_db()
    existing = await db.products.find_one({"_id": ObjectId(pid), "business_id": user["business_id"]})
    if not existing:
        raise HTTPException(404)
    data = payload.model_dump()
    outlet_ids = data.pop("outlet_ids", None)
    initial_stock = data.pop("initial_stock", None) or 0
    update = {k: v for k, v in data.items() if v is not None}

    if user["role"] == "outlet_manager":
        if not _product_assigned_to_outlet(existing, user.get("outlet_id", "")):
            raise HTTPException(403, "You can only edit products for your outlet")
    else:
        if "supplier_ids" in update:
            sids = update["supplier_ids"] or []
            if is_business_owner(user) and len(sids) < 1:
                raise HTTPException(400, "At least one supplier is required per product")
            for sid in sids:
                if not await db.suppliers.find_one({"_id": ObjectId(sid), "business_id": user["business_id"]}):
                    raise HTTPException(400, f"Invalid supplier: {sid}")
    if outlet_ids is not None and user["role"] != "outlet_manager":
        id_map, name_map = await _business_outlet_lookup(db, user["business_id"])
        outlet_ids = _normalize_outlet_ids(outlet_ids, id_map, name_map)
        await _validate_outlets_for_business(db, user["business_id"], outlet_ids)
        update["outlet_ids"] = outlet_ids
        prev_ids = set(existing.get("outlet_ids") or [])
        new_ids = [oid for oid in outlet_ids if oid not in prev_ids]
        if initial_stock > 0:
            for oid in new_ids:
                await _adjust_stock(db, pid, oid, initial_stock, user["business_id"])

    update["updated_at"] = utcnow_iso()
    await db.products.update_one(
        {"_id": ObjectId(pid), "business_id": user["business_id"]},
        {"$set": update},
    )
    await audit_log(user, "update", "product", pid)
    return {"success": True}


@router.put("/products/{pid}/outlets")
async def assign_product_outlets(
    pid: str,
    payload: ProductAssignOutlets,
    user: dict = Depends(require_permission_or_roles("products.edit", "business_admin")),
):
    """Business owner assigns product to outlets and optionally seeds stock."""
    db = get_db()
    product = await db.products.find_one({"_id": ObjectId(pid), "business_id": user["business_id"]})
    if not product:
        raise HTTPException(404)
    id_map, name_map = await _business_outlet_lookup(db, user["business_id"])
    outlet_ids = _normalize_outlet_ids(payload.outlet_ids, id_map, name_map)
    await _validate_outlets_for_business(db, user["business_id"], outlet_ids)
    prev_ids = set(_normalize_outlet_ids(product.get("outlet_ids"), id_map, name_map))
    new_ids = [oid for oid in outlet_ids if oid not in prev_ids]
    await db.products.update_one(
        {"_id": ObjectId(pid)},
        {"$set": {
            "outlet_ids": outlet_ids,
            "status": "approved",
            "active": True,
            "updated_at": utcnow_iso(),
        }},
    )
    if payload.initial_stock > 0:
        for oid in new_ids:
            await _adjust_stock(db, pid, oid, payload.initial_stock, user["business_id"])
    await audit_log(user, "assign_outlets", "product", pid, {"outlet_ids": payload.outlet_ids})
    return {"success": True}


@router.delete("/products/{pid}")
async def delete_product(
    pid: str,
    user: dict = Depends(require_permission_or_roles("products.edit", "business_admin")),
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
    elif user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        f["outlet_id"] = user["outlet_id"]
    docs = await db.inventory_txns.find(f).sort("created_at", -1).limit(500).to_list(500)
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        p = await db.products.find_one({"_id": ObjectId(d["product_id"])})
        d["product_name"] = p["name"] if p else "(deleted)"
    return docs


async def _ensure_product_at_outlet(db, product: dict, outlet_id: str, business_id: str):
    """Assign product to outlet if stock is received there but product was not linked yet."""
    if _product_assigned_to_outlet(product, outlet_id):
        return
    pid = str(product["_id"])
    outlet_ids = list(product.get("outlet_ids") or [])
    if product.get("outlet_id") and product["outlet_id"] not in outlet_ids:
        outlet_ids.append(product["outlet_id"])
    if outlet_id not in outlet_ids:
        outlet_ids.append(outlet_id)
    await db.products.update_one(
        {"_id": ObjectId(pid), "business_id": business_id},
        {"$set": {"outlet_ids": outlet_ids, "updated_at": utcnow_iso()}},
    )


async def _record_owner_stock_in_po(
    db,
    user: dict,
    payload: InventoryTxnCreate,
    product: dict,
    txn_id: str,
):
    """Create an auto-approved received PO + expense for owner stock-in (stock already adjusted)."""
    if not payload.supplier_id:
        raise HTTPException(400, "Supplier is required for stock-in (creates purchase order)")
    supplier = await db.suppliers.find_one({
        "_id": ObjectId(payload.supplier_id),
        "business_id": user["business_id"],
    })
    if not supplier:
        raise HTTPException(400, "Supplier not found")

    unit_cost = float(payload.cost_price if payload.cost_price is not None else product.get("cost_price") or 0)
    line_total = round(unit_cost * payload.quantity, 2)
    items = [{
        "product_id": payload.product_id,
        "product_name": product["name"],
        "quantity": payload.quantity,
        "cost_price": unit_cost,
        "line_total": line_total,
    }]
    now = utcnow_iso()
    po_doc = {
        "business_id": user["business_id"],
        "po_type": "stock_in",
        "outlet_id": payload.outlet_id,
        "fulfill_outlet_id": payload.outlet_id,
        "requested_outlet_id": payload.outlet_id,
        "supplier_id": payload.supplier_id,
        "items": items,
        "total": line_total,
        "status": "received",
        "note": payload.note or f"Stock-in transaction {txn_id}",
        "created_by": user["id"],
        "approved_by": user["id"],
        "approved_at": now,
        "received_at": now,
        "inventory_txn_id": txn_id,
        "created_at": now,
    }
    res = await db.purchase_orders.insert_one(po_doc)
    po_id = str(res.inserted_id)
    await db.inventory_txns.update_one(
        {"_id": ObjectId(txn_id)},
        {"$set": {"purchase_order_id": po_id}},
    )
    await recalculate_product_cost_from_pos(db, user["business_id"], payload.product_id)
    line_details = [{
        "product_id": payload.product_id,
        "product_name": product["name"],
        "quantity": payload.quantity,
        "unit_cost": unit_cost,
        "line_total": line_total,
    }]
    await db.expenses.insert_one({
        "business_id": user["business_id"],
        "outlet_id": payload.outlet_id,
        "category": "inventory",
        "subcategory": "stock_purchase",
        "amount": line_total,
        "description": f"Stock purchase — {supplier['name']}",
        "status": "approved",
        "created_by": user["id"],
        "created_at": now,
        "approved_at": now,
        "approved_by": user["id"],
        "supplier_id": payload.supplier_id,
        "purchase_order_id": po_id,
        "line_items": line_details,
    })
    await audit_log(user, "create", "purchase_order", po_id, {"source": "stock_in", "auto_approved": True})
    return po_id


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
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin", "outlet_manager")),
):
    db = get_db()
    await _enforce_outlet_access(user, payload.outlet_id)
    if payload.to_outlet_id:
        await _enforce_outlet_access(user, payload.to_outlet_id)
    product = await db.products.find_one({"_id": ObjectId(payload.product_id), "business_id": user["business_id"]})
    if not product:
        raise HTTPException(404, "Product not found")
    if _product_status(product) != "approved":
        raise HTTPException(400, "Product is not approved yet")
    if is_business_owner(user) and payload.type == "stock_in":
        await _ensure_product_at_outlet(db, product, payload.outlet_id, user["business_id"])
    elif not _product_assigned_to_outlet(product, payload.outlet_id):
        raise HTTPException(400, "Product is not assigned to this outlet")
    if is_business_owner(user) and payload.type == "stock_in" and payload.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive for stock-in")
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
    txn_id = str(res.inserted_id)
    po_id = None
    if txn_type == "stock_in" and is_business_owner(user):
        po_id = await _record_owner_stock_in_po(db, user, payload, product, txn_id)
    await audit_log(user, txn_type, "inventory", txn_id)
    return {"id": txn_id, "purchase_order_id": po_id}


@router.get("/inventory/low-stock")
async def low_stock(
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    products = await db.products.find({"business_id": user["business_id"]}).to_list(2000)
    products = _filter_products_for_user(products, user, outlet_id, approved_only=True)
    scope_outlet = outlet_id or user.get("outlet_id")
    alerts = []
    for p in products:
        pid = str(p["_id"])
        stocks = await db.stocks.find({"product_id": pid}).to_list(100)
        for s in stocks:
            if scope_outlet and s["outlet_id"] != scope_outlet:
                continue
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


@router.get("/inventory/summary")
async def inventory_summary(
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    """Stock levels — owner sees all outlets; managers see their outlet only."""
    db = get_db()
    from permissions import is_business_owner

    scope_outlet = outlet_id
    if not is_business_owner(user):
        accessible = await get_user_accessible_outlet_ids(db, user)
        if outlet_id and outlet_id not in accessible:
            raise HTTPException(403, "Not allowed for this outlet")
        scope_outlet = outlet_id or (accessible[0] if len(accessible) == 1 else None)
        if not scope_outlet and accessible:
            scope_outlet = None  # multi-outlet role: all accessible

    products = await db.products.find({"business_id": user["business_id"], "active": {"$ne": False}}).to_list(2000)
    product_scope = None if is_business_owner(user) else scope_outlet
    products = _filter_products_for_user(products, user, product_scope, approved_only=True)
    if is_business_owner(user) and scope_outlet:
        existing_ids = {str(p["_id"]) for p in products}
        stocked = await db.stocks.find({"outlet_id": scope_outlet}).to_list(5000)
        for s in stocked:
            pid = s.get("product_id")
            if not pid or pid in existing_ids:
                continue
            extra = await db.products.find_one({
                "_id": ObjectId(pid),
                "business_id": user["business_id"],
                "active": {"$ne": False},
            })
            if extra and _product_status(extra) == "approved":
                products.append(extra)
                existing_ids.add(pid)

    outlets = await db.outlets.find({
        "business_id": user["business_id"],
        "active": {"$ne": False},
    }).to_list(100)
    outlet_map = {str(o["_id"]): o["name"] for o in outlets}

    if is_business_owner(user) and not scope_outlet:
        target_outlets = [str(o["_id"]) for o in outlets]
    elif scope_outlet:
        target_outlets = [scope_outlet]
    else:
        target_outlets = await get_user_accessible_outlet_ids(db, user)

    rows = []
    totals_by_outlet = {oid: 0 for oid in target_outlets}
    grand_total = 0

    for p in products:
        pid = str(p["_id"])
        stocks = await db.stocks.find({"product_id": pid}).to_list(100)
        stock_map = {s["outlet_id"]: s["quantity"] for s in stocks}
        outlet_stocks = {}
        row_total = 0
        for oid in target_outlets:
            qty = stock_map.get(oid, 0)
            outlet_stocks[oid] = qty
            totals_by_outlet[oid] = totals_by_outlet.get(oid, 0) + qty
            row_total += qty
        grand_total += row_total
        rows.append({
            "product_id": pid,
            "product_name": p["name"],
            "sku": p.get("sku"),
            "min_stock": p.get("min_stock", 0),
            "cost_price": p.get("cost_price", 0),
            "outlet_stocks": outlet_stocks,
            "total_stock": row_total,
        })

    return {
        "outlets": [{"id": oid, "name": outlet_map.get(oid, oid)} for oid in target_outlets],
        "products": rows,
        "totals_by_outlet": totals_by_outlet,
        "grand_total": grand_total,
    }


async def _stock_qty(db, product_id: str, outlet_id: str) -> int:
    row = await db.stocks.find_one({"product_id": product_id, "outlet_id": outlet_id})
    return int(row.get("quantity") or 0) if row else 0


async def _enrich_po_warehouse_stock(db, po: dict, business_id: str) -> None:
    wh = await get_business_warehouse(db, business_id)
    if not wh:
        po["warehouse"] = None
        return
    wh_id = str(wh["_id"])
    po["warehouse"] = {"id": wh_id, "name": wh.get("name", "Central Warehouse")}
    for it in po.get("items") or []:
        it["warehouse_stock"] = await _stock_qty(db, it["product_id"], wh_id)


async def _record_warehouse_service_revenue(
    db,
    business_id: str,
    warehouse_id: str,
    dest_outlet_id: str,
    dest_name: str,
    shipping: float,
    center: float,
    po_id: str,
    user: dict,
):
    """Internal revenue at warehouse for shipping + center handling fees."""
    total = round(float(shipping or 0) + float(center or 0), 2)
    if total <= 0:
        return
    now = utcnow_iso()
    items = []
    if shipping > 0:
        items.append({
            "product_name": "Shipping & handling",
            "quantity": 1,
            "unit_price": round(shipping, 2),
            "cost_price": 0,
            "line_total": round(shipping, 2),
        })
    if center > 0:
        items.append({
            "product_name": "Center warehouse charge",
            "quantity": 1,
            "unit_price": round(center, 2),
            "cost_price": 0,
            "line_total": round(center, 2),
        })
    counter = await db.counters.find_one_and_update(
        {"_id": f"bill_{business_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    bill_no = f"INT-{counter.get('seq', 1):05d}"
    await db.bills.insert_one({
        "business_id": business_id,
        "outlet_id": warehouse_id,
        "bill_no": bill_no,
        "is_internal": True,
        "internal_type": "warehouse_service",
        "purchase_order_id": po_id,
        "dest_outlet_id": dest_outlet_id,
        "items": items,
        "subtotal": total,
        "tax_total": 0,
        "discount_total": 0,
        "total": total,
        "payment_method": "internal",
        "note": f"Transfer service fees — {dest_name}",
        "created_by": user["id"],
        "created_at": now,
    })


async def _fulfill_from_warehouse(
    db,
    po: dict,
    po_id: str,
    warehouse_id: str,
    dest_outlet_id: str,
    items: list,
    shipping_charge: float,
    center_charge: float,
    user: dict,
):
    """Transfer stock warehouse → outlet; expense on outlet; warehouse earns fees."""
    wh = await db.outlets.find_one({
        "_id": ObjectId(warehouse_id),
        "business_id": po["business_id"],
        "is_warehouse": True,
    })
    if not wh:
        raise HTTPException(400, "Invalid central warehouse")
    dest = await db.outlets.find_one({
        "_id": ObjectId(dest_outlet_id),
        "business_id": po["business_id"],
    })
    if not dest:
        raise HTTPException(400, "Invalid destination outlet")
    if dest.get("is_warehouse"):
        raise HTTPException(400, "Assign stock to a retail outlet, not the warehouse")

    for it in items:
        avail = await _stock_qty(db, it["product_id"], warehouse_id)
        if avail < it["quantity"]:
            name = it.get("product_name") or it["product_id"]
            raise HTTPException(
                400,
                f"Insufficient warehouse stock for {name}: need {it['quantity']}, have {avail}",
            )

    goods_total = 0.0
    line_details = []
    now = utcnow_iso()
    wh_name = wh.get("name", "Central Warehouse")
    dest_name = dest.get("name", "outlet")

    for it in items:
        pid = it["product_id"]
        qty = int(it["quantity"])
        await _adjust_stock(db, pid, warehouse_id, -qty, po["business_id"])
        await _adjust_stock(db, pid, dest_outlet_id, qty, po["business_id"])
        product = await db.products.find_one({"_id": ObjectId(pid)})
        if product:
            await _ensure_product_at_outlet(db, product, dest_outlet_id, po["business_id"])
        await db.inventory_txns.insert_one({
            "business_id": po["business_id"],
            "product_id": pid,
            "outlet_id": warehouse_id,
            "to_outlet_id": dest_outlet_id,
            "type": "transfer",
            "quantity": qty,
            "note": f"PO {po_id} — warehouse to {dest_name}",
            "created_by": user["id"],
            "created_at": now,
        })
        line_total = round(float(it.get("cost_price") or 0) * qty, 2)
        goods_total += line_total
        line_details.append({
            "product_id": pid,
            "product_name": it.get("product_name"),
            "quantity": qty,
            "unit_cost": it.get("cost_price", 0),
            "line_total": line_total,
        })

    goods_total = round(goods_total, 2)
    shipping = round(float(shipping_charge or 0), 2)
    center = round(float(center_charge or 0), 2)
    fees = round(shipping + center, 2)

    await db.expenses.insert_one({
        "business_id": po["business_id"],
        "outlet_id": dest_outlet_id,
        "category": "inventory",
        "subcategory": "warehouse_transfer",
        "amount": goods_total,
        "description": f"Stock received from {wh_name} — PO {po_id}",
        "status": "approved",
        "created_by": user["id"],
        "created_at": now,
        "approved_at": now,
        "approved_by": user["id"],
        "purchase_order_id": po_id,
        "warehouse_id": warehouse_id,
        "line_items": line_details,
    })

    if fees > 0:
        await db.expenses.insert_one({
            "business_id": po["business_id"],
            "outlet_id": dest_outlet_id,
            "category": "operations",
            "subcategory": "warehouse_fees",
            "amount": fees,
            "description": f"Shipping & center charges ({wh_name}) — PO {po_id}",
            "status": "approved",
            "created_by": user["id"],
            "created_at": now,
            "approved_at": now,
            "approved_by": user["id"],
            "purchase_order_id": po_id,
            "warehouse_id": warehouse_id,
        })
        await _record_warehouse_service_revenue(
            db, po["business_id"], warehouse_id, dest_outlet_id,
            dest_name, shipping, center, po_id, user,
        )


async def _fulfill_purchase_order(db, po: dict, po_id: str, fulfill_outlet_id: str, user: dict):
    """Add stock, log transactions, create expense, and update product avg costs from PO prices."""
    line_details = []
    for it in po["items"]:
        await _adjust_stock(db, it["product_id"], fulfill_outlet_id, it["quantity"], po["business_id"])
        await db.inventory_txns.insert_one({
            "business_id": po["business_id"],
            "product_id": it["product_id"],
            "outlet_id": fulfill_outlet_id,
            "type": "stock_in",
            "quantity": it["quantity"],
            "note": f"PO {po_id} fulfilled",
            "created_by": user["id"],
            "created_at": utcnow_iso(),
        })
        await recalculate_product_cost_from_pos(db, po["business_id"], it["product_id"])
        line_details.append({
            "product_id": it["product_id"],
            "product_name": it.get("product_name"),
            "quantity": it["quantity"],
            "unit_cost": it.get("cost_price", 0),
            "line_total": it.get("line_total", 0),
        })
    supplier_name = ""
    if po.get("supplier_id"):
        s = await db.suppliers.find_one({"_id": ObjectId(po["supplier_id"])})
        supplier_name = s["name"] if s else ""
    await db.expenses.insert_one({
        "business_id": po["business_id"],
        "outlet_id": fulfill_outlet_id,
        "category": "inventory",
        "subcategory": "stock_purchase",
        "amount": po["total"],
        "description": f"Stock purchase — {supplier_name}" if supplier_name else f"Purchase Order {po_id}",
        "status": "approved",
        "created_by": user["id"],
        "created_at": utcnow_iso(),
        "approved_at": utcnow_iso(),
        "approved_by": user["id"],
        "supplier_id": po.get("supplier_id"),
        "purchase_order_id": po_id,
        "line_items": line_details,
    })


# ============ CUSTOMERS ============
async def _outlet_customer_ids(db, biz_id: str, scope_oid: str) -> tuple[set[str], dict[str, dict]]:
    """Customers linked to an outlet: purchased here, registered here, or location matches outlet name."""
    rows = await db.bills.aggregate([
        {"$match": {
            "business_id": biz_id,
            "outlet_id": scope_oid,
            "customer_id": {"$exists": True, "$ne": None},
        }},
        {"$group": {
            "_id": "$customer_id",
            "outlet_purchases": {"$sum": 1},
            "outlet_spent": {"$sum": "$total"},
        }},
    ]).to_list(10000)
    outlet_stats = {r["_id"]: r for r in rows if r.get("_id")}
    customer_ids = set(outlet_stats.keys())

    outlet_doc = await db.outlets.find_one({"_id": ObjectId(scope_oid), "business_id": biz_id})
    outlet_name = outlet_doc.get("name", "") if outlet_doc else ""
    link_filter: dict = {
        "business_id": biz_id,
        "$or": [{"registered_outlet_id": scope_oid}],
    }
    if outlet_name:
        link_filter["$or"].append({"location": outlet_name})
    linked = await db.customers.find(link_filter, {"_id": 1}).to_list(5000)
    for c in linked:
        customer_ids.add(str(c["_id"]))
    return customer_ids, outlet_stats


@router.get("/customers")
async def list_customers(
    search: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    biz_id = user["business_id"]
    scope_oid = outlet_id
    if user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        scope_oid = user["outlet_id"]

    outlet_stats: dict[str, dict] = {}
    if scope_oid:
        customer_ids, outlet_stats = await _outlet_customer_ids(db, biz_id, scope_oid)
        if not customer_ids:
            return []
        valid_ids = []
        for cid in customer_ids:
            try:
                valid_ids.append(ObjectId(cid))
            except Exception:
                continue
        if not valid_ids:
            return []
        f: dict = {"business_id": biz_id, "_id": {"$in": valid_ids}}
    else:
        f = {"business_id": biz_id}

    if search:
        search_clause = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search}},
                {"email": {"$regex": search, "$options": "i"}},
                {"location": {"$regex": search, "$options": "i"}},
            ],
        }
        if scope_oid:
            f = {"$and": [f, search_clause]}
        else:
            f.update(search_clause)
    docs = await db.customers.find(f).sort("created_at", -1).limit(1000).to_list(1000)
    results = []
    for d in docs:
        row = clean_doc(d)
        if scope_oid:
            st = outlet_stats.get(row["id"], {})
            row["outlet_purchases"] = int(st.get("outlet_purchases") or 0)
            row["outlet_spent"] = round(float(st.get("outlet_spent") or 0), 2)
        results.append(row)
    return results


async def _resolve_customer_outlet(db, business_id: str, user: dict, payload: CustomerCreate) -> dict:
    """Set registered_outlet_id and location from user context or payload."""
    extra: dict = {}
    if user.get("role") in ("outlet_manager", "cashier") and user.get("outlet_id"):
        oid = user["outlet_id"]
        extra["registered_outlet_id"] = oid
        if not payload.location:
            o = await db.outlets.find_one({"_id": ObjectId(oid), "business_id": business_id})
            if o:
                extra["location"] = o["name"]
    elif payload.outlet_id:
        o = await db.outlets.find_one({"_id": ObjectId(payload.outlet_id), "business_id": business_id})
        if o:
            extra["registered_outlet_id"] = payload.outlet_id
            if not payload.location:
                extra["location"] = o["name"]
    elif payload.location:
        o = await db.outlets.find_one({"business_id": business_id, "name": payload.location})
        if o:
            extra["registered_outlet_id"] = str(o["_id"])
    return extra


@router.post("/customers")
async def create_customer(
    payload: CustomerCreate,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    biz_id = user["business_id"]
    outlet_extra = await _resolve_customer_outlet(db, biz_id, user, payload)
    existing = await db.customers.find_one({"business_id": biz_id, "phone": payload.phone})
    if existing:
        updates = {k: v for k, v in outlet_extra.items() if v is not None}
        if updates:
            updates["updated_at"] = utcnow_iso()
            await db.customers.update_one({"_id": existing["_id"]}, {"$set": updates})
            existing.update(updates)
        return clean_doc(existing)
    doc = payload.model_dump()
    doc.pop("outlet_id", None)
    doc.update(outlet_extra)
    doc["business_id"] = biz_id
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
    bill_filter = {"customer_id": cid, "business_id": user["business_id"]}
    scope_oid = user.get("outlet_id") if user.get("role") in ("outlet_manager", "cashier") else None
    if scope_oid:
        outlet_ids, _ = await _outlet_customer_ids(db, user["business_id"], scope_oid)
        if cid not in outlet_ids:
            raise HTTPException(404, "Customer not found at your outlet")
        bill_filter["outlet_id"] = scope_oid
    bills = await db.bills.find(bill_filter).sort("created_at", -1).limit(100).to_list(100)
    c["bills"] = [clean_doc(b) for b in bills]
    if scope_oid:
        c["outlet_purchases"] = len(bills)
        c["outlet_spent"] = round(sum(float(b.get("total") or 0) for b in bills), 2)
    rewards = await db.rewards.find({"customer_id": cid}).sort("created_at", -1).limit(100).to_list(100)
    c["reward_history"] = [clean_doc(r) for r in rewards]
    return c


# ============ BILLS / POS ============
@router.post("/bills")
async def create_bill(
    payload: BillCreate,
    user: dict = Depends(require_permission_or_roles("bills.create", "business_admin", "outlet_manager", "cashier")),
):
    db = get_db()
    if user.get("role") in ("outlet_manager", "cashier"):
        if user.get("outlet_id") and user["outlet_id"] != payload.outlet_id:
            raise HTTPException(403, "Cannot bill for other outlets")

    outlet = await db.outlets.find_one({
        "_id": ObjectId(payload.outlet_id),
        "business_id": user["business_id"],
    })
    if not outlet:
        raise HTTPException(400, "Invalid outlet")
    if outlet.get("active") is False:
        raise HTTPException(400, "This outlet is inactive")
    if outlet.get("is_warehouse"):
        raise HTTPException(400, "Cannot bill at a warehouse — select a retail outlet")

    items_out = []
    subtotal = 0.0
    tax_total = 0.0
    reward_points_earned = 0
    for it in payload.items:
        p = await db.products.find_one({"_id": ObjectId(it.product_id)})
        if not p:
            raise HTTPException(400, f"Product not found: {it.product_id}")
        if _product_status(p) != "approved":
            raise HTTPException(400, f"Product not approved: {p['name']}")
        if not _product_assigned_to_outlet(p, payload.outlet_id):
            raise HTTPException(400, f"Product not available at this outlet: {p['name']}")
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
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin", "outlet_manager")),
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
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin", "outlet_manager")),
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
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin")),
):
    db = get_db()
    await db.suppliers.delete_one({"_id": ObjectId(sid), "business_id": user["business_id"]})
    return {"success": True}


# ============ PURCHASE ORDERS ============
async def _enrich_po(db, d: dict) -> dict:
    d["id"] = str(d["_id"])
    del d["_id"]
    if d.get("supplier_id"):
        s = await db.suppliers.find_one({"_id": ObjectId(d["supplier_id"])})
        d["supplier_name"] = s["name"] if s else "(deleted)"
    else:
        d["supplier_name"] = "—"
    d["requested_by_name"] = ""
    if d.get("created_by"):
        try:
            req = await db.users.find_one({"_id": ObjectId(d["created_by"])})
            d["requested_by_name"] = req.get("name", "") if req else ""
        except Exception:
            pass
    if d.get("requested_outlet_id"):
        o = await db.outlets.find_one({"_id": ObjectId(d["requested_outlet_id"])})
        d["requested_outlet_name"] = o["name"] if o else ""
    if d.get("fulfill_outlet_id"):
        o = await db.outlets.find_one({"_id": ObjectId(d["fulfill_outlet_id"])})
        d["fulfill_outlet_name"] = o["name"] if o else ""
    if d.get("outlet_id"):
        o = await db.outlets.find_one({"_id": ObjectId(d["outlet_id"])})
        d["outlet_name"] = o["name"] if o else ""
    if d.get("warehouse_id"):
        w = await db.outlets.find_one({"_id": ObjectId(d["warehouse_id"])})
        d["warehouse_name"] = w["name"] if w else ""
    return d


@router.get("/purchase-orders")
async def list_pos(user: dict = Depends(get_business_scope)):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if not is_business_owner(user):
        oid = user.get("outlet_id")
        if oid:
            f["$or"] = [
                {"requested_outlet_id": oid},
                {"outlet_id": oid},
                {"fulfill_outlet_id": oid},
            ]
    docs = await db.purchase_orders.find(f).sort("created_at", -1).to_list(500)
    result = []
    for d in docs:
        result.append(await _enrich_po(db, d))
    return result


@router.post("/purchase-orders/stock-request")
async def create_stock_request(
    payload: StockRequestCreate,
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin", "outlet_manager")),
):
    """Outlet manager requests stock — creates PO pending owner approval."""
    db = get_db()
    outlet_id = user.get("outlet_id")
    if not outlet_id and user.get("outlet_ids"):
        outlet_id = user["outlet_ids"][0]
    if not outlet_id:
        raise HTTPException(400, "No outlet assigned to your account")
    if is_business_owner(user):
        raise HTTPException(400, "Business owner should create a direct purchase order with supplier")

    merged: dict[str, int] = {}
    for it in payload.items:
        merged[it.product_id] = merged.get(it.product_id, 0) + int(it.quantity)

    items = []
    for product_id, quantity in merged.items():
        if quantity <= 0:
            continue
        p = await db.products.find_one({"_id": ObjectId(product_id), "business_id": user["business_id"]})
        if not p:
            raise HTTPException(400, f"Product not found: {product_id}")
        if not _product_assigned_to_outlet(p, outlet_id):
            raise HTTPException(400, f"Product not available at your outlet: {p.get('name')}")
        items.append({
            "product_id": product_id,
            "product_name": p["name"],
            "quantity": quantity,
            "cost_price": 0,
            "line_total": 0,
        })
    if not items:
        raise HTTPException(400, "No valid items in request")

    doc = {
        "business_id": user["business_id"],
        "po_type": "stock_request",
        "outlet_id": outlet_id,
        "requested_outlet_id": outlet_id,
        "supplier_id": None,
        "items": items,
        "total": 0,
        "status": "pending_approval",
        "note": payload.note,
        "created_by": user["id"],
        "created_at": utcnow_iso(),
    }
    res = await db.purchase_orders.insert_one(doc)
    po_id = str(res.inserted_id)
    outlet = await db.outlets.find_one({"_id": ObjectId(outlet_id)})
    outlet_name = outlet.get("name", "outlet") if outlet else "outlet"
    await notify_stock_request(user["business_id"], po_id, user.get("name", "Staff"), outlet_name)
    await audit_log(user, "create", "stock_request", po_id)
    return {"id": po_id, "item_count": len(items)}


@router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, user: dict = Depends(get_business_scope)):
    db = get_db()
    po = await db.purchase_orders.find_one({
        "_id": ObjectId(po_id),
        "business_id": user["business_id"],
    })
    if not po:
        raise HTTPException(404)
    if not is_business_owner(user):
        oid = user.get("outlet_id")
        if oid and oid not in {
            po.get("outlet_id"),
            po.get("requested_outlet_id"),
            po.get("fulfill_outlet_id"),
        }:
            raise HTTPException(403)
    result = await _enrich_po(db, po)
    await _enrich_po_warehouse_stock(db, result, user["business_id"])
    return result


@router.post("/purchase-orders")
async def create_po(
    payload: PurchaseOrderCreate,
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin")),
):
    """Business owner direct PO with supplier — receive when goods arrive."""
    db = get_db()
    if not is_business_owner(user):
        raise HTTPException(403, "Only business owner can create supplier purchase orders")
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
        "po_type": "direct",
        "outlet_id": payload.outlet_id,
        "requested_outlet_id": payload.outlet_id,
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


@router.put("/purchase-orders/{po_id}/approve")
async def approve_stock_request(
    po_id: str,
    payload: PurchaseOrderApprove,
    user: dict = Depends(require_roles("business_admin")),
):
    """Owner approves outlet stock request — assign supplier, outlet, costs; stock + expense."""
    db = get_db()
    po = await db.purchase_orders.find_one({"_id": ObjectId(po_id), "business_id": user["business_id"]})
    if not po:
        raise HTTPException(404)
    if po.get("status") != "pending_approval":
        raise HTTPException(400, "Request is not pending approval")

    outlet = await db.outlets.find_one({"_id": ObjectId(payload.fulfill_outlet_id), "business_id": user["business_id"]})
    if not outlet:
        raise HTTPException(400, "Outlet not found")

    source = (payload.fulfillment_source or "supplier").lower()
    if source not in ("supplier", "warehouse"):
        raise HTTPException(400, "fulfillment_source must be supplier or warehouse")

    items = []
    goods_total = 0.0
    po_items_by_id = {it["product_id"]: it for it in (po.get("items") or [])}
    for it in payload.items:
        p = await db.products.find_one({"_id": ObjectId(it.product_id)})
        stored = po_items_by_id.get(it.product_id, {})
        name = p["name"] if p else stored.get("product_name") or it.product_id
        if not p and not stored:
            raise HTTPException(400, f"Product not found: {it.product_id}")
        line = it.cost_price * it.quantity
        goods_total += line
        items.append({
            "product_id": it.product_id,
            "product_name": name,
            "quantity": it.quantity,
            "cost_price": it.cost_price,
            "line_total": round(line, 2),
        })
    if not items:
        raise HTTPException(400, "No items to approve")

    shipping = round(float(payload.shipping_charge or 0), 2)
    center = round(float(payload.center_charge or 0), 2)
    fees_total = round(shipping + center, 2)
    now = utcnow_iso()

    warehouse_id = None
    supplier_id = None

    if source == "warehouse":
        warehouse_id = payload.warehouse_id
        if not warehouse_id:
            wh = await get_business_warehouse(db, user["business_id"])
            if not wh:
                raise HTTPException(400, "No central warehouse configured. Set up warehouse under Outlets.")
            warehouse_id = str(wh["_id"])
        await _fulfill_from_warehouse(
            db, po, po_id, warehouse_id, payload.fulfill_outlet_id,
            items, shipping, center, user,
        )
        po_total = round(goods_total + fees_total, 2)
    else:
        if not payload.supplier_id:
            raise HTTPException(400, "Supplier is required when buying from supplier")
        supplier = await db.suppliers.find_one({
            "_id": ObjectId(payload.supplier_id),
            "business_id": user["business_id"],
        })
        if not supplier:
            raise HTTPException(400, "Supplier not found")
        supplier_id = payload.supplier_id
        updated_po = {
            **po,
            "supplier_id": supplier_id,
            "fulfill_outlet_id": payload.fulfill_outlet_id,
            "outlet_id": payload.fulfill_outlet_id,
            "items": items,
            "total": round(goods_total, 2),
            "status": "received",
        }
        await _fulfill_purchase_order(db, updated_po, po_id, payload.fulfill_outlet_id, user)
        po_total = round(goods_total, 2)

    await db.purchase_orders.update_one(
        {"_id": ObjectId(po_id)},
        {"$set": {
            "fulfillment_source": source,
            "supplier_id": supplier_id,
            "warehouse_id": warehouse_id,
            "fulfill_outlet_id": payload.fulfill_outlet_id,
            "outlet_id": payload.fulfill_outlet_id,
            "items": items,
            "total": po_total,
            "shipping_charge": shipping,
            "center_charge": center,
            "status": "received",
            "approved_by": user["id"],
            "approved_at": now,
            "updated_at": now,
        }},
    )
    await db.notifications.update_many(
        {"business_id": user["business_id"], "entity_type": "purchase_order", "entity_id": po_id},
        {"$set": {"read": True}},
    )
    await audit_log(user, "approve", "stock_request", po_id)
    return {"success": True}


@router.put("/purchase-orders/{po_id}")
async def update_po(
    po_id: str,
    payload: PurchaseOrderUpdate,
    user: dict = Depends(require_permission_or_roles("inventory.manage", "business_admin", "outlet_manager")),
):
    db = get_db()
    po = await db.purchase_orders.find_one({"_id": ObjectId(po_id), "business_id": user["business_id"]})
    if not po:
        raise HTTPException(404)

    if po.get("po_type") == "stock_request" and po.get("status") == "pending_approval":
        if payload.status == "rejected" and is_business_owner(user):
            await db.purchase_orders.update_one(
                {"_id": ObjectId(po_id)},
                {"$set": {"status": "rejected", "updated_at": utcnow_iso()}},
            )
            await db.notifications.update_many(
                {"business_id": user["business_id"], "entity_type": "purchase_order", "entity_id": po_id},
                {"$set": {"read": True}},
            )
            await audit_log(user, "reject", "stock_request", po_id)
            return {"success": True}
        raise HTTPException(400, "Use approve endpoint for stock requests")

    if payload.status == "received":
        if not is_business_owner(user):
            raise HTTPException(403, "Only business owner can receive purchase orders")
        if po["status"] == "received":
            raise HTTPException(400, "Already received")
        fulfill_outlet = po.get("fulfill_outlet_id") or po["outlet_id"]
        await _fulfill_purchase_order(db, po, po_id, fulfill_outlet, user)
        await db.purchase_orders.update_one(
            {"_id": ObjectId(po_id)},
            {"$set": {"status": "received", "updated_at": utcnow_iso()}},
        )
        await audit_log(user, "po_received", "purchase_order", po_id)
        return {"success": True}

    if payload.status == "cancelled":
        await db.purchase_orders.update_one(
            {"_id": ObjectId(po_id)},
            {"$set": {"status": "cancelled", "updated_at": utcnow_iso()}},
        )
        return {"success": True}

    raise HTTPException(400, "Invalid status transition")


# ============ EXPENSES ============
@router.get("/expenses")
async def list_expenses(
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    await sync_salary_expenses(db, user["business_id"])
    f = await build_expense_scope_filter(db, user, outlet_id)
    if status:
        f["status"] = status
    if category:
        f["category"] = category
    docs = await db.expenses.find(f).sort("created_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        if d.get("outlet_id"):
            o = await db.outlets.find_one({"_id": ObjectId(d["outlet_id"])})
            d["outlet_name"] = o["name"] if o else ""
        if d.get("employee_id") and not d.get("employee_name"):
            emp = await db.users.find_one({"_id": ObjectId(d["employee_id"])})
            if emp:
                d["employee_name"] = emp.get("name")
    return docs


@router.post("/expenses")
async def create_expense(
    payload: ExpenseCreate,
    user: dict = Depends(require_permission_or_roles("expenses.create", "business_admin", "outlet_manager", "cashier")),
):
    db = get_db()
    await _enforce_outlet_access(user, payload.outlet_id)
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["status"] = "approved" if is_business_owner(user) else "pending"
    doc["created_by"] = user["id"]
    doc["created_at"] = utcnow_iso()
    doc["approval_level"] = 0
    res = await db.expenses.insert_one(doc)
    expense_id = str(res.inserted_id)
    if not is_business_owner(user):
        await start_expense_approval(expense_id, user["business_id"], payload.outlet_id, user["id"])
    else:
        doc["approved_by"] = user["id"]
        doc["approved_at"] = utcnow_iso()
        await db.expenses.update_one({"_id": res.inserted_id}, {"$set": {"approved_by": user["id"], "approved_at": utcnow_iso()}})
    await audit_log(user, "create", "expense", expense_id)
    return {"id": expense_id}


@router.put("/expenses/{eid}/action")
async def expense_action(
    eid: str,
    payload: ExpenseApprove,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    expense = await db.expenses.find_one({"_id": ObjectId(eid), "business_id": user["business_id"]})
    if not expense:
        raise HTTPException(404, "Expense not found")
    approval_req = await db.approval_requests.find_one({
        "entity_type": "expense",
        "entity_id": eid,
        "status": "pending",
    })
    if approval_req:
        perms = await get_user_permissions(user)
        if not has_permission(user, perms, "approvals.act") and not has_permission(user, perms, "expenses.approve"):
            raise HTTPException(403, "Not authorized to approve expenses")
        result = await process_approval(
            "expense",
            str(approval_req["_id"]),
            {**user, "_id": ObjectId(user["id"])},
            payload.action,
            payload.note,
        )
        await audit_log(user, f"expense_{payload.action}", "expense", eid, result)
        return result
    if not is_business_owner(user):
        raise HTTPException(403, "Only business owner can approve this expense")
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
    user: dict = Depends(require_permission_or_roles("expenses.approve", "business_admin")),
):
    db = get_db()
    expense = await db.expenses.find_one({"_id": ObjectId(eid), "business_id": user["business_id"]})
    if not expense:
        raise HTTPException(404, "Expense not found")
    if expense.get("source") == "salary_sync":
        raise HTTPException(400, "Recurring salary expenses are managed from Organization → Employees")
    await db.expenses.delete_one({"_id": ObjectId(eid)})
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
    user: dict = Depends(require_permission_or_roles("settings.manage", "business_admin")),
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
    user: dict = Depends(require_permission_or_roles("settings.manage", "business_admin")),
):
    db = get_db()
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    res = await db.tax_configs.insert_one(doc)
    return {"id": str(res.inserted_id)}


@router.delete("/taxes/configs/{tid}")
async def delete_tax_config(
    tid: str,
    user: dict = Depends(require_permission_or_roles("settings.manage", "business_admin")),
):
    db = get_db()
    await db.tax_configs.delete_one({"_id": ObjectId(tid), "business_id": user["business_id"]})
    return {"success": True}


# ============ AUDIT LOGS ============
@router.get("/audit-logs")
async def list_audit_logs(
    days: int = 30,
    user: dict = Depends(require_permission_or_roles("audit.view", "business_admin", "platform_admin")),
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
    if not is_business_owner(user):
        f["user_id"] = user["id"]
    docs = await db.notifications.find(f).sort("created_at", -1).limit(50).to_list(50)
    notifications = [clean_doc(d) for d in docs]

    pending_stock_requests = []
    pending_stock_count = 0
    if is_business_owner(user) and user.get("business_id"):
        pending_stock_count = await db.purchase_orders.count_documents({
            "business_id": user["business_id"],
            "status": "pending_approval",
        })
        raw = await db.purchase_orders.find({
            "business_id": user["business_id"],
            "status": "pending_approval",
        }).sort("created_at", -1).limit(10).to_list(10)
        for d in raw:
            pending_stock_requests.append(await _enrich_po(db, d))

    from workflow_engine import get_pending_for_user
    pending_approvals = len(await get_pending_for_user(user)) if user.get("business_id") else 0

    return {
        "notifications": notifications,
        "unread_count": sum(1 for n in notifications if not n.get("read")),
        "pending_stock_requests": pending_stock_count,
        "pending_stock_request_details": pending_stock_requests,
        "pending_approvals": pending_approvals,
    }


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one({"_id": ObjectId(nid)}, {"$set": {"read": True}})
    return {"success": True}
