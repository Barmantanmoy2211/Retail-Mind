"""In-app notifications for business events."""
from bson import ObjectId
from db import get_db, utcnow_iso


async def notify_business_owners(
    business_id: str,
    ntype: str,
    message: str,
    entity_type: str = "",
    entity_id: str = "",
):
    db = get_db()
    owners = await db.users.find({
        "business_id": business_id,
        "$or": [{"role": "business_admin"}, {"system_role": "business_admin"}],
        "active": True,
    }).to_list(20)
    for owner in owners:
        await db.notifications.insert_one({
            "business_id": business_id,
            "user_id": str(owner["_id"]),
            "type": ntype,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "message": message,
            "read": False,
            "created_at": utcnow_iso(),
        })


async def notify_stock_request(business_id: str, po_id: str, requester_name: str, outlet_name: str):
    await notify_business_owners(
        business_id,
        "stock_request",
        f"{requester_name} requested stock for {outlet_name}",
        "purchase_order",
        po_id,
    )
