"""Multi-step approval workflow engine."""
from typing import Optional
from bson import ObjectId
from fastapi import HTTPException
from db import get_db, utcnow_iso
from permissions import is_business_owner, get_business_role


async def get_active_workflow(business_id: str, trigger_type: str) -> Optional[dict]:
    db = get_db()
    return await db.approval_workflows.find_one({
        "business_id": business_id,
        "trigger_type": trigger_type,
        "is_active": True,
    })


async def resolve_approvers(business_id: str, level: dict, outlet_id: Optional[str] = None) -> list[dict]:
    db = get_db()
    approvers = []
    if level.get("type") == "system_role":
        if level.get("system_role") == "business_admin":
            cursor = db.users.find({
                "business_id": business_id,
                "$or": [{"role": "business_admin"}, {"system_role": "business_admin"}],
                "active": True,
            })
            async for u in cursor:
                approvers.append(u)
    elif level.get("type") == "role" and level.get("role_id"):
        try:
            role_oid = ObjectId(level["role_id"])
        except Exception:
            return []
        cursor = db.users.find({
            "business_id": business_id,
            "role_id": str(role_oid),
            "active": True,
        })
        async for u in cursor:
            if outlet_id:
                oids = u.get("outlet_ids") or ([u["outlet_id"]] if u.get("outlet_id") else [])
                if outlet_id not in oids:
                    continue
            approvers.append(u)
    return approvers


async def can_user_approve_at_level(user: dict, business_id: str, level: dict, outlet_id: Optional[str] = None) -> bool:
    if is_business_owner(user) and level.get("type") == "system_role":
        return level.get("system_role") == "business_admin"
    if level.get("type") == "role" and user.get("role_id") == level.get("role_id"):
        if outlet_id:
            oids = user.get("outlet_ids") or ([user["outlet_id"]] if user.get("outlet_id") else [])
            return outlet_id in oids or not oids
        return True
    return False


async def log_action(
    request_type: str,
    request_id: str,
    approver_id: str,
    action: str,
    comments: Optional[str] = None,
    ip_address: Optional[str] = None,
    level: int = 0,
):
    db = get_db()
    await db.approval_actions.insert_one({
        "request_type": request_type,
        "request_id": request_id,
        "approver_id": approver_id,
        "action": action,
        "comments": comments,
        "level": level,
        "ip_address": ip_address,
        "timestamp": utcnow_iso(),
    })


async def start_hiring_request(data: dict, requester: dict) -> dict:
    db = get_db()
    business_id = requester["business_id"]
    wf = await get_active_workflow(business_id, "hiring")
    if not wf:
        raise HTTPException(400, "No hiring workflow configured")
    doc = {
        **data,
        "business_id": business_id,
        "requested_by": str(requester["_id"]),
        "status": "pending",
        "workflow_id": str(wf["_id"]),
        "current_level": 0,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.hiring_requests.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    return doc


async def start_role_request(data: dict, requester: dict) -> dict:
    db = get_db()
    business_id = requester["business_id"]
    wf = await get_active_workflow(business_id, "role_create")
    if not wf:
        raise HTTPException(400, "No role creation workflow configured")
    doc = {
        **data,
        "business_id": business_id,
        "requested_by": str(requester["_id"]),
        "status": "pending",
        "workflow_id": str(wf["_id"]),
        "current_level": 0,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.role_requests.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    return doc


async def start_expense_approval(expense_id: str, business_id: str, outlet_id: str, requester_id: str) -> Optional[dict]:
    db = get_db()
    wf = await get_active_workflow(business_id, "expense")
    if not wf or not wf.get("approval_levels"):
        return None
    doc = {
        "business_id": business_id,
        "entity_type": "expense",
        "entity_id": expense_id,
        "requested_by": requester_id,
        "outlet_id": outlet_id,
        "status": "pending",
        "workflow_id": str(wf["_id"]),
        "current_level": 0,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.approval_requests.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    return doc


async def start_transfer_request(data: dict, requester: dict) -> dict:
    db = get_db()
    business_id = requester["business_id"]
    wf = await get_active_workflow(business_id, "transfer")
    if not wf:
        raise HTTPException(400, "No transfer workflow configured")
    doc = {
        **data,
        "business_id": business_id,
        "requested_by": str(requester["_id"]),
        "status": "pending",
        "workflow_id": str(wf["_id"]),
        "current_level": 0,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.transfer_requests.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    return doc


async def _get_request_collection(request_type: str):
    mapping = {
        "hiring": "hiring_requests",
        "role_create": "role_requests",
        "expense": "approval_requests",
        "transfer": "transfer_requests",
    }
    name = mapping.get(request_type)
    if not name:
        raise HTTPException(400, f"Unknown request type: {request_type}")
    return get_db()[name]


async def _complete_hiring(req: dict, approver: dict):
    from auth_utils import hash_password
    db = get_db()
    candidate = req["candidate"]
    existing = await db.users.find_one({"email": candidate["email"].lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    role = await db.business_roles.find_one({"_id": ObjectId(req["requested_role_id"])})
    if not role:
        raise HTTPException(400, "Role not found")
    pwd = candidate.get("password") or "changeme123"
    user_doc = {
        "email": candidate["email"].lower(),
        "password_hash": hash_password(pwd),
        "name": candidate["name"],
        "phone": candidate.get("phone"),
        "business_id": req["business_id"],
        "role": role.get("slug", "cashier"),
        "role_id": req["requested_role_id"],
        "outlet_id": req.get("outlet_id"),
        "outlet_ids": [req["outlet_id"]] if req.get("outlet_id") else [],
        "reports_to_user_id": req.get("reports_to_user_id") or req.get("requested_by"),
        "hired_by": str(approver["_id"]),
        "employee_status": "active",
        "date_of_joining": utcnow_iso()[:10],
        "active": True,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.users.insert_one(user_doc)
    from salary_expense_sync import sync_salary_expenses
    await sync_salary_expenses(db, req["business_id"])
    return str(res.inserted_id)


async def _complete_role_create(req: dict):
    db = get_db()
    slug = req.get("slug") or req["name"].lower().replace(" ", "_")
    doc = {
        "business_id": req["business_id"],
        "name": req["name"],
        "slug": slug,
        "description": req.get("description", ""),
        "parent_role_id": req.get("parent_role_id"),
        "scope": req.get("scope", "outlet"),
        "outlet_ids": req.get("outlet_ids") or [],
        "permissions": req.get("permissions") or [],
        "can_create_employees": req.get("can_create_employees", False),
        "can_create_roles": False,
        "is_active": True,
        "level": 1,
        "created_by": req["requested_by"],
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.business_roles.insert_one(doc)
    return str(res.inserted_id)


async def _complete_transfer(req: dict):
    db = get_db()
    updates = {
        "outlet_ids": req.get("to_outlet_ids", []),
        "updated_at": utcnow_iso(),
        "employee_status": "active",
    }
    if req.get("to_outlet_ids"):
        updates["outlet_id"] = req["to_outlet_ids"][0]
    if req.get("to_role_id"):
        role = await db.business_roles.find_one({"_id": ObjectId(req["to_role_id"])})
        updates["role_id"] = req["to_role_id"]
        if role:
            updates["role"] = role.get("slug")
    if req.get("temporary_until"):
        updates["temporary_assignment"] = {
            "outlet_ids": req.get("to_outlet_ids", []),
            "until": req["temporary_until"],
            "role_id": req.get("to_role_id"),
        }
    await db.users.update_one(
        {"_id": ObjectId(req["user_id"])},
        {"$set": updates},
    )


async def _complete_expense(req: dict):
    db = get_db()
    await db.expenses.update_one(
        {"_id": ObjectId(req["entity_id"])},
        {"$set": {"status": "approved", "approved_at": utcnow_iso(), "updated_at": utcnow_iso()}},
    )


async def process_approval(
    request_type: str,
    request_id: str,
    approver: dict,
    action: str,
    comments: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> dict:
    db = get_db()
    coll = await _get_request_collection(request_type)
    try:
        req = await coll.find_one({"_id": ObjectId(request_id)})
    except Exception:
        raise HTTPException(404, "Request not found")
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("status") != "pending":
        raise HTTPException(400, "Request is not pending")
    if req["business_id"] != approver.get("business_id"):
        raise HTTPException(403, "Access denied")

    wf = await db.approval_workflows.find_one({"_id": ObjectId(req["workflow_id"])})
    if not wf:
        raise HTTPException(400, "Workflow not found")
    levels = wf.get("approval_levels") or []
    current = req.get("current_level", 0)
    if current >= len(levels):
        raise HTTPException(400, "No approval level defined")

    level_def = levels[current]
    outlet_id = req.get("outlet_id")
    if not await can_user_approve_at_level(approver, req["business_id"], level_def, outlet_id):
        raise HTTPException(403, "You are not authorized to approve at this level")

    await log_action(request_type, request_id, str(approver["_id"]), action, comments, ip_address, current)

    if action == "reject":
        await coll.update_one(
            {"_id": req["_id"]},
            {"$set": {"status": "rejected", "rejected_by": str(approver["_id"]), "updated_at": utcnow_iso()}},
        )
        if request_type == "expense":
            await db.expenses.update_one(
                {"_id": ObjectId(req["entity_id"])},
                {"$set": {"status": "rejected", "updated_at": utcnow_iso()}},
            )
        return {"status": "rejected", "request_id": request_id}

    next_level = current + 1
    if next_level >= len(levels):
        result_id = None
        if request_type == "hiring":
            result_id = await _complete_hiring(req, approver)
        elif request_type == "role_create":
            result_id = await _complete_role_create(req)
        elif request_type == "expense":
            await _complete_expense(req)
        elif request_type == "transfer":
            await _complete_transfer(req)
        await coll.update_one(
            {"_id": req["_id"]},
            {"$set": {"status": "approved", "current_level": next_level, "updated_at": utcnow_iso(), "result_id": result_id}},
        )
        return {"status": "approved", "request_id": request_id, "result_id": result_id}

    await coll.update_one(
        {"_id": req["_id"]},
        {"$set": {"current_level": next_level, "updated_at": utcnow_iso()}},
    )
    if request_type == "expense":
        await db.expenses.update_one(
            {"_id": ObjectId(req["entity_id"])},
            {"$set": {"approval_level": next_level, "updated_at": utcnow_iso()}},
        )
    return {"status": "pending", "request_id": request_id, "current_level": next_level}


async def get_pending_for_user(user: dict) -> list[dict]:
    db = get_db()
    business_id = user.get("business_id")
    if not business_id:
        return []
    pending = []
    for request_type, coll_name in [
        ("hiring", "hiring_requests"),
        ("role_create", "role_requests"),
        ("expense", "approval_requests"),
        ("transfer", "transfer_requests"),
    ]:
        coll = db[coll_name]
        async for req in coll.find({"business_id": business_id, "status": "pending"}):
            wf = await db.approval_workflows.find_one({"_id": ObjectId(req["workflow_id"])})
            if not wf:
                continue
            levels = wf.get("approval_levels") or []
            current = req.get("current_level", 0)
            if current >= len(levels):
                continue
            if await can_user_approve_at_level(user, business_id, levels[current], req.get("outlet_id")):
                item = dict(req)
                item["id"] = str(item.pop("_id"))
                item["request_type"] = request_type
                pending.append(item)
    return pending
