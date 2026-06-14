"""Product cost from supplier purchase order prices."""
from bson import ObjectId
from db import utcnow_iso


async def get_supplier_cost_map(db, business_id: str, product_id: str) -> dict:
    """Latest unit cost per supplier from received purchase orders."""
    costs: dict[str, float] = {}
    cursor = db.purchase_orders.find({
        "business_id": business_id,
        "status": "received",
        "items.product_id": product_id,
    }).sort("created_at", -1)

    async for po in cursor:
        sid = po.get("supplier_id")
        if not sid:
            continue
        if sid in costs:
            continue
        for it in po.get("items") or []:
            if it.get("product_id") == product_id and it.get("cost_price", 0) > 0:
                costs[sid] = float(it["cost_price"])
                break
    return costs


async def recalculate_product_cost_from_pos(db, business_id: str, product_id: str) -> dict:
    """
    Average of latest supplier unit prices from POs becomes product cost_price.
    Stores supplier_costs cache on product document.
    """
    costs = await get_supplier_cost_map(db, business_id, product_id)
    if not costs:
        product = await db.products.find_one({"_id": ObjectId(product_id)})
        return {
            "cost_price": float(product.get("cost_price", 0)) if product else 0,
            "supplier_costs": product.get("supplier_costs", {}) if product else {},
            "source": "manual",
        }

    avg = round(sum(costs.values()) / len(costs), 2)
    await db.products.update_one(
        {"_id": ObjectId(product_id), "business_id": business_id},
        {"$set": {
            "cost_price": avg,
            "supplier_costs": costs,
            "cost_source": "po_average",
            "updated_at": utcnow_iso(),
        }},
    )
    return {"cost_price": avg, "supplier_costs": costs, "source": "po_average"}


async def enrich_product_suppliers(db, product: dict) -> dict:
    """Attach supplier names and cost breakdown."""
    if not product:
        return product
    supplier_ids = product.get("supplier_ids") or []
    names = []
    for sid in supplier_ids:
        try:
            s = await db.suppliers.find_one({"_id": ObjectId(sid)})
            if s:
                names.append({"id": sid, "name": s.get("name")})
        except Exception:
            pass
    product["suppliers"] = names
    pid = str(product.get("_id") or product.get("id"))
    business_id = product.get("business_id")
    if pid and business_id:
        po_costs = await get_supplier_cost_map(db, business_id, pid)
        product["supplier_costs"] = po_costs or product.get("supplier_costs", {})
        if po_costs:
            product["computed_cost_price"] = round(sum(po_costs.values()) / len(po_costs), 2)
    return product
