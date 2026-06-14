"""Organization: roles, workflows, hiring, approvals, org chart."""
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from bson import ObjectId
from db import get_db, clean_doc, utcnow_iso
from auth_utils import get_current_user, require_roles, hash_password, get_business_scope
from models import (
    BusinessRoleCreate, BusinessRoleUpdate, ApprovalWorkflowCreate, ApprovalWorkflowUpdate,
    HiringRequestCreate, RoleRequestCreate, ApprovalActionRequest, TransferRequestCreate,
    DirectEmployeeCreate, EmployeeUpdate, PermissionMatrixUpdate,
)
from employee_utils import enrich_employee, compute_monthly_salary
from salary_expense_sync import sync_salary_expenses
from permissions import (
    PERMISSION_CATALOG, require_permission, require_any_permission,
    is_business_owner, can_create_employee_for_role, enrich_user_context,
)
from org_seed import TEMPLATES, import_role_template, migrate_business_users, seed_default_workflows
from workflow_engine import (
    start_hiring_request, start_role_request, start_transfer_request,
    process_approval, get_pending_for_user,
)
from routes_core import audit_log

router = APIRouter(prefix="/api/org")


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "role"


async def _ensure_migrated(user: dict):
    if user.get("business_id"):
        db = get_db()
        await migrate_business_users(db, user["business_id"])


# ============ PERMISSIONS CATALOG ============
@router.get("/permissions/catalog")
async def permissions_catalog(user: dict = Depends(get_business_scope)):
    return PERMISSION_CATALOG


# ============ ROLE TEMPLATES ============
@router.get("/templates")
async def list_templates(user: dict = Depends(require_roles("business_admin"))):
    return [{"key": k, "name": v["name"], "role_count": len(v["roles"])} for k, v in TEMPLATES.items()]


@router.post("/templates/{template_key}/import")
async def import_template(
    template_key: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    try:
        result = await import_role_template(db, user["business_id"], template_key, user["id"])
    except ValueError as e:
        raise HTTPException(400, str(e))
    await audit_log(user, "import_template", "business_roles", user["business_id"], result)
    return result


# ============ BUSINESS ROLES CRUD ============
@router.get("/roles")
async def list_roles(user: dict = Depends(require_any_permission("roles.view", "employees.view"))):
    await _ensure_migrated(user)
    db = get_db()
    docs = await db.business_roles.find({"business_id": user["business_id"]}).sort("level", 1).to_list(500)
    return [clean_doc(d) for d in docs]


@router.post("/roles")
async def create_role(
    payload: BusinessRoleCreate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    slug = _slugify(payload.name)
    existing = await db.business_roles.find_one({"business_id": user["business_id"], "slug": slug})
    if existing:
        raise HTTPException(400, "Role with similar name already exists")
    level = 1
    if payload.parent_role_id:
        parent = await db.business_roles.find_one({
            "_id": ObjectId(payload.parent_role_id),
            "business_id": user["business_id"],
        })
        if not parent:
            raise HTTPException(400, "Parent role not found")
        level = parent.get("level", 1) + 1
    doc = {
        **payload.model_dump(),
        "business_id": user["business_id"],
        "slug": slug,
        "can_create_roles": False,
        "level": level,
        "created_by": user["id"],
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.business_roles.insert_one(doc)
    await audit_log(user, "create", "business_role", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/roles/{role_id}")
async def update_role(
    role_id: str,
    payload: BusinessRoleUpdate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    update = {k: (v.value if hasattr(v, "value") else v) for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    if "parent_role_id" in update and update["parent_role_id"]:
        parent = await db.business_roles.find_one({
            "_id": ObjectId(update["parent_role_id"]),
            "business_id": user["business_id"],
        })
        if parent:
            update["level"] = parent.get("level", 1) + 1
    result = await db.business_roles.update_one(
        {"_id": ObjectId(role_id), "business_id": user["business_id"]},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Role not found")
    await audit_log(user, "update", "business_role", role_id, update)
    return {"success": True}


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    in_use = await db.users.count_documents({"business_id": user["business_id"], "role_id": role_id})
    if in_use:
        raise HTTPException(400, "Role is assigned to employees")
    await db.business_roles.delete_one({"_id": ObjectId(role_id), "business_id": user["business_id"]})
    await audit_log(user, "delete", "business_role", role_id)
    return {"success": True}


# ============ WORKFLOWS ============
@router.get("/workflows")
async def list_workflows(user: dict = Depends(require_any_permission("workflows.manage", "approvals.view"))):
    db = get_db()
    docs = await db.approval_workflows.find({"business_id": user["business_id"]}).to_list(100)
    return [clean_doc(d) for d in docs]


@router.post("/workflows")
async def create_workflow(
    payload: ApprovalWorkflowCreate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    doc = {
        **payload.model_dump(),
        "business_id": user["business_id"],
        "approval_levels": [l.model_dump() for l in payload.approval_levels],
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.approval_workflows.insert_one(doc)
    await audit_log(user, "create", "approval_workflow", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/workflows/{wf_id}")
async def update_workflow(
    wf_id: str,
    payload: ApprovalWorkflowUpdate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    update = {}
    if payload.name is not None:
        update["name"] = payload.name
    if payload.is_active is not None:
        update["is_active"] = payload.is_active
    if payload.approval_levels is not None:
        update["approval_levels"] = [l.model_dump() for l in payload.approval_levels]
    update["updated_at"] = utcnow_iso()
    await db.approval_workflows.update_one(
        {"_id": ObjectId(wf_id), "business_id": user["business_id"]},
        {"$set": update},
    )
    await audit_log(user, "update", "approval_workflow", wf_id)
    return {"success": True}


# ============ EMPLOYEES ============
@router.get("/employees")
async def list_employees(user: dict = Depends(require_any_permission("employees.view", "roles.view"))):
    await _ensure_migrated(user)
    db = get_db()
    f = {"business_id": user["business_id"], "role": {"$ne": "platform_admin"}}
    if not is_business_owner(user) and user.get("outlet_id"):
        f["$or"] = [{"outlet_id": user["outlet_id"]}, {"outlet_ids": user["outlet_id"]}]
    docs = await db.users.find(f, {"password_hash": 0}).to_list(1000)
    result = []
    for d in docs:
        result.append(await enrich_employee(db, d))
    return result


@router.get("/employees/{employee_id}")
async def get_employee(
    employee_id: str,
    user: dict = Depends(require_any_permission("employees.view", "employees.edit")),
):
    db = get_db()
    doc = await db.users.find_one(
        {"_id": ObjectId(employee_id), "business_id": user["business_id"]},
        {"password_hash": 0},
    )
    if not doc:
        raise HTTPException(404, "Employee not found")
    return await enrich_employee(db, doc)


@router.get("/employees/{employee_id}/salary")
async def get_employee_salary(
    employee_id: str,
    user: dict = Depends(require_any_permission("employees.view", "employees.edit")),
):
    db = get_db()
    doc = await db.users.find_one(
        {"_id": ObjectId(employee_id), "business_id": user["business_id"]},
        {"password_hash": 0},
    )
    if not doc:
        raise HTTPException(404, "Employee not found")
    return await compute_monthly_salary(db, doc)


@router.put("/employees/{employee_id}")
async def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    user: dict = Depends(require_any_permission("employees.edit")),
):
    db = get_db()
    existing = await db.users.find_one({
        "_id": ObjectId(employee_id),
        "business_id": user["business_id"],
        "role": {"$ne": "platform_admin"},
    })
    if not existing:
        raise HTTPException(404, "Employee not found")
    if existing.get("role") == "business_admin":
        raise HTTPException(403, "Cannot edit business owner via this endpoint")

    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "email" in update:
        other = await db.users.find_one({
            "email": update["email"].lower(),
            "_id": {"$ne": ObjectId(employee_id)},
        })
        if other:
            raise HTTPException(400, "Email already in use")
        update["email"] = update["email"].lower()
    if "password" in update:
        update["password_hash"] = hash_password(update.pop("password"))
    if "role_id" in update:
        role = await db.business_roles.find_one({
            "_id": ObjectId(update["role_id"]),
            "business_id": user["business_id"],
        })
        if not role:
            raise HTTPException(400, "Role not found")
        update["role"] = role.get("slug", existing.get("role"))
    if "outlet_ids" in update:
        update["outlet_id"] = update["outlet_ids"][0] if update["outlet_ids"] else None

    update["updated_at"] = utcnow_iso()
    await db.users.update_one({"_id": ObjectId(employee_id)}, {"$set": update})
    await sync_salary_expenses(db, user["business_id"])
    await audit_log(user, "update", "employee", employee_id, update)
    doc = await db.users.find_one({"_id": ObjectId(employee_id)}, {"password_hash": 0})
    return await enrich_employee(db, doc)


@router.post("/employees/direct")
async def create_employee_direct(
    payload: DirectEmployeeCreate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(400, "Email already exists")
    role = await db.business_roles.find_one({
        "_id": ObjectId(payload.role_id),
        "business_id": user["business_id"],
    })
    if not role:
        raise HTTPException(400, "Role not found")
    outlet_id = payload.outlet_ids[0] if payload.outlet_ids else None
    doc = {
        "name": payload.name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": role.get("slug", "cashier"),
        "role_id": payload.role_id,
        "business_id": user["business_id"],
        "outlet_id": outlet_id,
        "outlet_ids": payload.outlet_ids,
        "reports_to_user_id": payload.reports_to_user_id or user["id"],
        "hired_by": user["id"],
        "employee_status": "active",
        "date_of_joining": payload.date_of_joining or utcnow_iso()[:10],
        "base_salary": payload.base_salary,
        "active": True,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.users.insert_one(doc)
    await sync_salary_expenses(db, user["business_id"])
    await audit_log(user, "create", "employee", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


# ============ HIRING ============
@router.get("/hiring-requests")
async def list_hiring_requests(user: dict = Depends(require_any_permission("employees.view", "approvals.view"))):
    db = get_db()
    f = {"business_id": user["business_id"]}
    if not is_business_owner(user):
        f["requested_by"] = user["id"]
    docs = await db.hiring_requests.find(f).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]


@router.post("/hiring-requests")
async def create_hiring_request(
    payload: HiringRequestCreate,
    user: dict = Depends(require_any_permission("employees.create")),
):
    if not is_business_owner(user):
        if not await can_create_employee_for_role(user, payload.requested_role_id):
            raise HTTPException(403, "Cannot hire for this role")
    data = payload.model_dump()
    data["candidate"] = payload.candidate.model_dump()
    result = await start_hiring_request(data, {**user, "_id": ObjectId(user["id"])})
    await audit_log(user, "create", "hiring_request", result["id"])
    return result


# ============ ROLE REQUESTS ============
@router.get("/role-requests")
async def list_role_requests(user: dict = Depends(require_any_permission("roles.view", "approvals.view"))):
    db = get_db()
    f = {"business_id": user["business_id"]}
    docs = await db.role_requests.find(f).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]


@router.post("/role-requests")
async def create_role_request(
    payload: RoleRequestCreate,
    user: dict = Depends(require_any_permission("employees.create", "roles.create")),
):
    if is_business_owner(user):
        raise HTTPException(400, "Business owner can create roles directly")
    data = payload.model_dump()
    data["slug"] = _slugify(payload.name)
    result = await start_role_request(data, {**user, "_id": ObjectId(user["id"])})
    await audit_log(user, "create", "role_request", result["id"])
    return result


# ============ TRANSFERS ============
@router.get("/transfer-requests")
async def list_transfer_requests(user: dict = Depends(require_any_permission("employees.transfer", "approvals.view"))):
    db = get_db()
    docs = await db.transfer_requests.find({"business_id": user["business_id"]}).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]


@router.post("/transfer-requests")
async def create_transfer_request(
    payload: TransferRequestCreate,
    user: dict = Depends(require_any_permission("employees.transfer")),
):
    data = payload.model_dump()
    result = await start_transfer_request(data, {**user, "_id": ObjectId(user["id"])})
    await audit_log(user, "create", "transfer_request", result["id"])
    return result


# ============ APPROVALS ============
@router.get("/approvals/pending")
async def pending_approvals(user: dict = Depends(require_any_permission("approvals.view", "approvals.act"))):
    await _ensure_migrated(user)
    return await get_pending_for_user(user)


@router.post("/approvals/action")
async def approval_action(
    payload: ApprovalActionRequest,
    request: Request,
    user: dict = Depends(require_any_permission("approvals.act")),
):
    ip = request.client.host if request.client else None
    result = await process_approval(
        payload.request_type,
        payload.request_id,
        {**user, "_id": ObjectId(user["id"])},
        payload.action,
        payload.comments,
        ip,
    )
    await audit_log(user, f"approval_{payload.action}", payload.request_type, payload.request_id, result, ip_address=ip)
    return result


@router.get("/approvals/actions/{request_type}/{request_id}")
async def approval_history(
    request_type: str,
    request_id: str,
    user: dict = Depends(require_any_permission("approvals.view")),
):
    db = get_db()
    docs = await db.approval_actions.find({
        "request_type": request_type,
        "request_id": request_id,
    }).sort("timestamp", 1).to_list(100)
    return [clean_doc(d) for d in docs]


# ============ ORG CHART ============
@router.get("/chart")
async def org_chart(user: dict = Depends(require_any_permission("employees.view", "roles.view"))):
    await _ensure_migrated(user)
    db = get_db()
    f = {"business_id": user["business_id"], "active": True, "role": {"$ne": "platform_admin"}}
    users = await db.users.find(f, {"password_hash": 0}).to_list(1000)
    by_id = {}
    for u in users:
        uid = str(u["_id"])
        role_name = u.get("role", "").replace("_", " ")
        if u.get("role_id"):
            role = await db.business_roles.find_one({"_id": ObjectId(u["role_id"])})
            if role:
                role_name = role.get("name", role_name)
        by_id[uid] = {
            "id": uid,
            "name": u.get("name"),
            "role": role_name,
            "outlet_id": u.get("outlet_id"),
            "children": [],
        }
    roots = []
    for u in users:
        uid = str(u["_id"])
        parent = u.get("reports_to_user_id")
        if parent and parent in by_id:
            by_id[parent]["children"].append(by_id[uid])
        else:
            roots.append(by_id[uid])

    roles = await db.business_roles.find({"business_id": user["business_id"]}).to_list(200)
    role_tree = {}
    role_roots = []
    for r in roles:
        rid = str(r["_id"])
        role_tree[rid] = {
            "id": rid,
            "name": r.get("name"),
            "slug": r.get("slug"),
            "children": [],
        }
    for r in roles:
        rid = str(r["_id"])
        parent = r.get("parent_role_id")
        if parent and parent in role_tree:
            role_tree[parent]["children"].append(role_tree[rid])
        else:
            role_roots.append(role_tree[rid])

    return {"employee_tree": roots, "role_tree": role_roots}


# ============ PERMISSION MATRIX ============
@router.get("/permission-matrix")
async def permission_matrix(user: dict = Depends(require_roles("business_admin"))):
    db = get_db()
    roles = await db.business_roles.find({"business_id": user["business_id"]}).to_list(200)
    matrix = []
    for r in roles:
        matrix.append({
            "role_id": str(r["_id"]),
            "role_name": r.get("name"),
            "permissions": r.get("permissions", []),
        })
    return {"catalog": PERMISSION_CATALOG, "matrix": matrix}


@router.put("/permission-matrix/{role_id}")
async def update_permission_matrix(
    role_id: str,
    payload: PermissionMatrixUpdate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.business_roles.update_one(
        {"_id": ObjectId(role_id), "business_id": user["business_id"]},
        {"$set": {"permissions": payload.permissions, "updated_at": utcnow_iso()}},
    )
    await audit_log(user, "update", "permission_matrix", role_id)
    return {"success": True}


# ============ NOTIFICATIONS ============
@router.get("/notifications")
async def list_notifications(user: dict = Depends(get_business_scope)):
    db = get_db()
    f = {"business_id": user["business_id"]} if user.get("business_id") else {}
    docs = await db.notifications.find(f).sort("created_at", -1).limit(50).to_list(50)
    pending_count = len(await get_pending_for_user(user))
    return {"notifications": [clean_doc(d) for d in docs], "pending_approvals": pending_count}
