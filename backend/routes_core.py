"""All API routes for RetailFlow AI - consolidated for simplicity."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import get_db, clean_doc, utcnow_iso
from auth_utils import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_roles, get_business_scope, require_permission_or_roles,
)
from permissions import enrich_user_context, get_user_permissions
from org_seed import migrate_business_users, seed_default_workflows, import_role_template
from outlet_utils import compute_outlet_stats_30d, get_business_warehouse
from models import (
    LoginRequest, RegisterBusinessRequest, UserCreate, UserUpdate, DirectEmployeeCreate,
    BusinessUpdate, OutletCreate, OutletUpdate,
    ProductCreate, ProductUpdate, InventoryTxnCreate,
    CustomerCreate, CustomerUpdate, BillCreate,
    SupplierCreate, SupplierUpdate, PurchaseOrderCreate, PurchaseOrderUpdate,
    ExpenseCreate, ExpenseApprove, TaxConfigCreate, RewardConfig,
    SubscriptionActionRequest, CategoryCreate, UserRole, SubscriptionStatus,
    PlanTier, ExpenseStatus, PaymentMethod,
)

router = APIRouter(prefix="/api")

PLAN_LIMITS = {"starter": 1, "growth": 5, "enterprise": 9999}
PLAN_PRICES = {"starter": 999, "growth": 2999, "enterprise": 9999}


async def audit_log(
    user: dict,
    action: str,
    entity: str,
    entity_id: str = "",
    details: dict = None,
    previous: dict = None,
    new_value: dict = None,
    ip_address: str = None,
):
    db = get_db()
    await db.audit_logs.insert_one({
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "business_id": user.get("business_id"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "details": details or {},
        "previous": previous,
        "new_value": new_value,
        "ip_address": ip_address,
        "timestamp": utcnow_iso(),
    })


def _scope_filter(user: dict, extra: dict = None) -> dict:
    """Build business-scoped filter."""
    f = dict(extra) if extra else {}
    if user.get("role") != "platform_admin":
        f["business_id"] = user["business_id"]
    return f


# ============ AUTH ============
@router.post("/auth/login")
async def login(payload: LoginRequest):
    db = get_db()
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="User disabled")

    business = None
    if user.get("business_id"):
        business = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
        if business:
            if business.get("subscription_status") == "rejected":
                raise HTTPException(status_code=403, detail="Subscription rejected. Contact platform admin.")
            if business.get("subscription_status") == "suspended":
                raise HTTPException(status_code=403, detail="Business suspended. Contact platform admin.")
        await migrate_business_users(db, user["business_id"])

    token = create_access_token({"sub": str(user["_id"]), "role": user["role"]})
    user["id"] = str(user["_id"])
    del user["_id"]
    user.pop("password_hash", None)

    biz_out = clean_doc(business) if business else None
    outlet = None
    if user.get("outlet_id"):
        o = await db.outlets.find_one({"_id": ObjectId(user["outlet_id"])})
        outlet = clean_doc(o) if o else None
    await audit_log(user, "login", "user", user["id"])
    return {"access_token": token, "token_type": "bearer", "user": user, "business": biz_out, "outlet": outlet}


@router.post("/auth/register-business")
async def register_business(payload: RegisterBusinessRequest):
    db = get_db()
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    biz_doc = {
        "business_name": payload.business_name,
        "business_type": payload.business_type,
        "owner_name": payload.owner_name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "plan": payload.plan.value,
        "subscription_status": "pending",
        "outlet_limit": PLAN_LIMITS[payload.plan.value],
        "plan_price": PLAN_PRICES[payload.plan.value],
        "currency": "INR",
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    biz_res = await db.businesses.insert_one(biz_doc)
    biz_id = str(biz_res.inserted_id)

    user_doc = {
        "name": payload.owner_name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": "business_admin",
        "system_role": "business_admin",
        "business_id": biz_id,
        "outlet_id": None,
        "active": True,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    await db.users.insert_one(user_doc)

    # default reward config
    await db.reward_configs.insert_one({
        "business_id": biz_id,
        "points_per_currency": 1.0,
        "currency_per_point": 1.0,
        "min_redeem_points": 100,
        "expiry_days": 365,
    })
    return {"success": True, "message": "Registration submitted. Awaiting platform admin approval."}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    db = get_db()
    if user.get("business_id"):
        await migrate_business_users(db, user["business_id"])
    user = await enrich_user_context(user)
    business = None
    if user.get("business_id"):
        b = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
        business = clean_doc(b) if b else None
    outlet = None
    if user.get("outlet_id"):
        o = await db.outlets.find_one({"_id": ObjectId(user["outlet_id"])})
        outlet = clean_doc(o) if o else None
    permissions = user.get("permissions") or await get_user_permissions(user)
    return {
        "user": user,
        "business": business,
        "outlet": outlet,
        "permissions": permissions,
        "role": user.get("business_role"),
        "reports_to": user.get("reports_to"),
    }


# ============ PLATFORM ADMIN: BUSINESSES ============
@router.get("/platform/businesses")
async def platform_list_businesses(
    status: Optional[str] = None,
    user: dict = Depends(require_roles("platform_admin")),
):
    db = get_db()
    f = {}
    if status:
        f["subscription_status"] = status
    docs = await db.businesses.find(f).sort("created_at", -1).to_list(1000)
    result = []
    for d in docs:
        d = clean_doc(d)
        outlets_count = await db.outlets.count_documents({"business_id": d["id"]})
        users_count = await db.users.count_documents({"business_id": d["id"]})
        d["outlets_count"] = outlets_count
        d["users_count"] = users_count
        result.append(d)
    return result


@router.post("/platform/businesses/{biz_id}/action")
async def platform_business_action(
    biz_id: str,
    payload: SubscriptionActionRequest,
    user: dict = Depends(require_roles("platform_admin")),
):
    db = get_db()
    biz = await db.businesses.find_one({"_id": ObjectId(biz_id)})
    if not biz:
        raise HTTPException(404, "Business not found")
    update = {"updated_at": utcnow_iso()}
    action = payload.action
    if action == "approve":
        update["subscription_status"] = "approved"
        update["approved_at"] = utcnow_iso()
        owner = await db.users.find_one({"business_id": biz_id, "role": "business_admin"})
        if owner:
            await import_role_template(db, biz_id, "retail", str(owner["_id"]))
            await seed_default_workflows(db, biz_id)
            await migrate_business_users(db, biz_id)
    elif action == "reject":
        update["subscription_status"] = "rejected"
    elif action == "suspend":
        update["subscription_status"] = "suspended"
    elif action == "activate":
        update["subscription_status"] = "approved"
    if payload.plan:
        update["plan"] = payload.plan.value
        update["outlet_limit"] = PLAN_LIMITS[payload.plan.value]
        update["plan_price"] = PLAN_PRICES[payload.plan.value]
    if payload.outlet_limit:
        update["outlet_limit"] = payload.outlet_limit
    await db.businesses.update_one({"_id": ObjectId(biz_id)}, {"$set": update})
    await audit_log(user, f"business_{action}", "business", biz_id, {"note": payload.note})
    await db.notifications.insert_one({
        "business_id": biz_id,
        "type": f"subscription_{action}",
        "message": f"Your subscription is {update.get('subscription_status', action)}",
        "read": False,
        "created_at": utcnow_iso(),
    })
    return {"success": True}


@router.get("/platform/stats")
async def platform_stats(user: dict = Depends(require_roles("platform_admin"))):
    db = get_db()
    total_bizs = await db.businesses.count_documents({})
    active = await db.businesses.count_documents({"subscription_status": "approved"})
    pending = await db.businesses.count_documents({"subscription_status": "pending"})
    suspended = await db.businesses.count_documents({"subscription_status": "suspended"})
    rejected = await db.businesses.count_documents({"subscription_status": "rejected"})
    total_outlets = await db.outlets.count_documents({})
    total_customers = await db.customers.count_documents({})
    total_bills = await db.bills.count_documents({})

    # Total revenue
    bills = await db.bills.find({}, {"total": 1}).to_list(100000)
    total_revenue = sum((b.get("total") or 0) for b in bills)

    # Monthly growth - bills in last 30 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_bizs = await db.businesses.count_documents({"created_at": {"$gte": cutoff}})

    # Plan distribution
    plans = {}
    for tier in ["starter", "growth", "enterprise"]:
        plans[tier] = await db.businesses.count_documents({"plan": tier, "subscription_status": "approved"})

    # Top businesses by revenue
    pipeline = [
        {"$group": {"_id": "$business_id", "revenue": {"$sum": "$total"}, "bills": {"$sum": 1}}},
        {"$sort": {"revenue": -1}},
        {"$limit": 5},
    ]
    top = await db.bills.aggregate(pipeline).to_list(5)
    top_businesses = []
    for t in top:
        if not t["_id"]:
            continue
        b = await db.businesses.find_one({"_id": ObjectId(t["_id"])})
        if b:
            top_businesses.append({
                "id": str(b["_id"]),
                "business_name": b["business_name"],
                "revenue": t["revenue"],
                "bills": t["bills"],
            })

    # Recent registrations
    recent = await db.businesses.find().sort("created_at", -1).limit(5).to_list(5)
    recent = [clean_doc(r) for r in recent]

    # Top business categories
    pipeline = [
        {"$group": {"_id": "$business_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    cats = await db.businesses.aggregate(pipeline).to_list(5)
    top_categories = [{"category": c["_id"], "count": c["count"]} for c in cats]

    return {
        "total_businesses": total_bizs,
        "active_businesses": active,
        "pending_approvals": pending,
        "suspended_businesses": suspended,
        "rejected_businesses": rejected,
        "total_outlets": total_outlets,
        "total_customers": total_customers,
        "total_bills": total_bills,
        "total_revenue": total_revenue,
        "monthly_new_businesses": new_bizs,
        "plan_distribution": plans,
        "top_businesses": top_businesses,
        "top_categories": top_categories,
        "recent_registrations": recent,
    }


# ============ BUSINESS ============
@router.get("/business/me")
async def business_me(user: dict = Depends(get_business_scope)):
    db = get_db()
    biz = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
    return clean_doc(biz)


@router.put("/business/me")
async def business_update_me(
    payload: BusinessUpdate,
    user: dict = Depends(require_permission_or_roles("settings.manage", "business_admin")),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    await db.businesses.update_one({"_id": ObjectId(user["business_id"])}, {"$set": update})
    await audit_log(user, "update", "business", user["business_id"])
    return {"success": True}


# ============ OUTLETS ============
def _outlet_list_filter(
    user: dict,
    active_only: bool = False,
    exclude_warehouse: bool = False,
) -> dict:
    f = _scope_filter(user)
    if user.get("role") == "outlet_manager":
        f["_id"] = ObjectId(user["outlet_id"]) if user.get("outlet_id") else None
    if active_only:
        f["active"] = {"$ne": False}
    if exclude_warehouse:
        f["is_warehouse"] = {"$ne": True}
    return f


@router.get("/outlets")
async def list_outlets(
    active_only: bool = False,
    exclude_warehouse: bool = False,
    with_stats: bool = False,
    user: dict = Depends(get_business_scope),
):
    db = get_db()
    f = _outlet_list_filter(user, active_only, exclude_warehouse)
    docs = await db.outlets.find(f).to_list(1000)
    docs.sort(key=lambda d: (not d.get("is_warehouse"), d.get("name", "")))
    results = []
    for d in docs:
        row = clean_doc(d)
        row.setdefault("is_warehouse", False)
        row.setdefault("active", True)
        if with_stats and user.get("role") == "business_admin":
            row.update(await compute_outlet_stats_30d(db, user["business_id"], row["id"]))
        results.append(row)
    return results


@router.post("/outlets/ensure-warehouse")
async def ensure_warehouse(
    user: dict = Depends(require_permission_or_roles("outlets.manage", "business_admin")),
):
    """Create a central warehouse outlet if the business does not have one yet."""
    db = get_db()
    existing = await get_business_warehouse(db, user["business_id"])
    if existing:
        return clean_doc(existing)
    biz = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
    doc = {
        "name": "Central Warehouse",
        "address": biz.get("address") or "Main storage facility",
        "phone": biz.get("phone") or "",
        "manager_id": None,
        "business_id": user["business_id"],
        "is_warehouse": True,
        "active": True,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.outlets.insert_one(doc)
    await audit_log(user, "create", "outlet", str(res.inserted_id), {"is_warehouse": True})
    return clean_doc({**doc, "_id": res.inserted_id})


@router.post("/outlets")
async def create_outlet(
    payload: OutletCreate,
    user: dict = Depends(require_permission_or_roles("outlets.manage", "business_admin")),
):
    db = get_db()
    biz = await db.businesses.find_one({"_id": ObjectId(user["business_id"])})
    if biz.get("subscription_status") != "approved":
        raise HTTPException(403, "Subscription not approved")
    is_warehouse = payload.is_warehouse
    if is_warehouse:
        existing_wh = await get_business_warehouse(db, user["business_id"])
        if existing_wh:
            raise HTTPException(400, "A central warehouse already exists for this business")
    if not is_warehouse:
        current = await db.outlets.count_documents({
            "business_id": user["business_id"],
            "is_warehouse": {"$ne": True},
        })
        if current >= biz.get("outlet_limit", 1):
            raise HTTPException(400, f"Outlet limit reached ({biz['outlet_limit']}). Upgrade plan.")
    doc = payload.model_dump()
    doc["business_id"] = user["business_id"]
    doc["active"] = True
    doc["created_at"] = utcnow_iso()
    doc["updated_at"] = utcnow_iso()
    res = await db.outlets.insert_one(doc)
    await audit_log(user, "create", "outlet", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/outlets/{outlet_id}")
async def update_outlet(
    outlet_id: str,
    payload: OutletUpdate,
    user: dict = Depends(require_permission_or_roles("outlets.manage", "business_admin")),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    await db.outlets.update_one(
        {"_id": ObjectId(outlet_id), "business_id": user["business_id"]},
        {"$set": update},
    )
    await audit_log(user, "update", "outlet", outlet_id)
    return {"success": True}


@router.delete("/outlets/{outlet_id}")
async def delete_outlet(
    outlet_id: str,
    user: dict = Depends(require_permission_or_roles("outlets.manage", "business_admin")),
):
    db = get_db()
    await db.outlets.delete_one({"_id": ObjectId(outlet_id), "business_id": user["business_id"]})
    await audit_log(user, "delete", "outlet", outlet_id)
    return {"success": True}


# ============ USERS / STAFF ============
@router.get("/users")
async def list_users(user: dict = Depends(require_permission_or_roles("employees.view", "business_admin", "platform_admin"))):
    db = get_db()
    f = _scope_filter(user)
    docs = await db.users.find(f, {"password_hash": 0}).to_list(1000)
    return [clean_doc(d) for d in docs]


@router.post("/users")
async def create_user(
    payload: UserCreate,
    user: dict = Depends(require_roles("business_admin")),
):
    """Legacy staff create — owner direct hire with role slug."""
    db = get_db()
    await migrate_business_users(db, user["business_id"])
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(400, "Email already exists")
    if payload.role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(403, "Cannot create platform admin")
    role_id = None
    role_doc = await db.business_roles.find_one({
        "business_id": user["business_id"],
        "slug": payload.role.value,
    })
    if role_doc:
        role_id = str(role_doc["_id"])
    doc = {
        "name": payload.name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": payload.role.value,
        "role_id": role_id,
        "business_id": user["business_id"],
        "outlet_id": payload.outlet_id,
        "outlet_ids": [payload.outlet_id] if payload.outlet_id else [],
        "reports_to_user_id": user["id"],
        "hired_by": user["id"],
        "employee_status": "active",
        "active": True,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }
    res = await db.users.insert_one(doc)
    await audit_log(user, "create", "user", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.put("/users/{uid}")
async def update_user(
    uid: str,
    payload: UserUpdate,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    update = {k: (v.value if hasattr(v, "value") else v) for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = utcnow_iso()
    await db.users.update_one(
        {"_id": ObjectId(uid), "business_id": user["business_id"]},
        {"$set": update},
    )
    await audit_log(user, "update", "user", uid)
    return {"success": True}


@router.delete("/users/{uid}")
async def delete_user(
    uid: str,
    user: dict = Depends(require_roles("business_admin")),
):
    db = get_db()
    await db.users.delete_one({"_id": ObjectId(uid), "business_id": user["business_id"]})
    await audit_log(user, "delete", "user", uid)
    return {"success": True}
