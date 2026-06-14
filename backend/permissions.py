"""Permission catalog and authorization helpers."""
from typing import Optional
from fastapi import Depends, HTTPException
from bson import ObjectId
from db import get_db
from auth_utils import get_current_user

PERMISSION_CATALOG = {
    "organization": [
        {"key": "roles.create", "label": "Create Roles"},
        {"key": "roles.edit", "label": "Edit Roles"},
        {"key": "roles.view", "label": "View Roles"},
        {"key": "employees.create", "label": "Create Employees"},
        {"key": "employees.edit", "label": "Edit Employees"},
        {"key": "employees.view", "label": "View Employees"},
        {"key": "employees.transfer", "label": "Transfer Employees"},
        {"key": "approvals.view", "label": "View Approvals"},
        {"key": "approvals.act", "label": "Act on Approvals"},
    ],
    "operations": [
        {"key": "bills.create", "label": "Create Bills"},
        {"key": "products.create", "label": "Create Products"},
        {"key": "products.edit", "label": "Edit Products"},
        {"key": "inventory.manage", "label": "Manage Inventory"},
        {"key": "customers.view", "label": "View Customers"},
    ],
    "finance": [
        {"key": "expenses.create", "label": "Create Expenses"},
        {"key": "expenses.approve", "label": "Approve Expenses"},
        {"key": "reports.view", "label": "View Reports"},
        {"key": "reports.export", "label": "Export Reports"},
    ],
    "admin": [
        {"key": "outlets.manage", "label": "Manage Outlets"},
        {"key": "settings.manage", "label": "Manage Settings"},
        {"key": "audit.view", "label": "View Audit Logs"},
        {"key": "workflows.manage", "label": "Manage Workflows"},
    ],
}

ALL_PERMISSION_KEYS = [
    p["key"] for group in PERMISSION_CATALOG.values() for p in group
]

LEGACY_ROLE_PERMISSIONS = {
    "outlet_manager": [
        "employees.create", "employees.edit", "employees.view", "approvals.view", "approvals.act",
        "bills.create", "products.create", "products.edit", "inventory.manage",
        "customers.view", "expenses.create", "expenses.approve", "reports.view",
    ],
    "cashier": [
        "bills.create", "customers.view", "expenses.create",
    ],
}


def is_platform_admin(user: dict) -> bool:
    return user.get("role") == "platform_admin"


def is_business_owner(user: dict) -> bool:
    return user.get("role") == "business_admin" or user.get("system_role") == "business_admin"


async def get_business_role(db, user: dict) -> Optional[dict]:
    if not user.get("role_id"):
        return None
    try:
        return await db.business_roles.find_one({"_id": ObjectId(user["role_id"])})
    except Exception:
        return None


async def get_user_permissions(user: dict) -> list[str]:
    if is_platform_admin(user) or is_business_owner(user):
        return ["*"]
    db = get_db()
    role = await get_business_role(db, user)
    if role and role.get("permissions"):
        return list(role["permissions"])
    legacy = user.get("role")
    if legacy in LEGACY_ROLE_PERMISSIONS:
        return LEGACY_ROLE_PERMISSIONS[legacy]
    return []


def has_permission(user: dict, permissions: list[str], key: str) -> bool:
    if "*" in permissions or is_platform_admin(user) or is_business_owner(user):
        return True
    return key in permissions


async def enrich_user_context(user: dict) -> dict:
    """Attach permissions and business role to user dict."""
    db = get_db()
    perms = await get_user_permissions(user)
    user = dict(user)
    user["permissions"] = perms
    if user.get("role_id"):
        role = await get_business_role(db, user)
        if role:
            user["business_role"] = {
                "id": str(role["_id"]),
                "name": role.get("name"),
                "slug": role.get("slug"),
                "scope": role.get("scope"),
                "can_create_employees": role.get("can_create_employees", False),
            }
    if user.get("reports_to_user_id"):
        mgr = await db.users.find_one({"_id": ObjectId(user["reports_to_user_id"])})
        if mgr:
            user["reports_to"] = {"id": str(mgr["_id"]), "name": mgr.get("name")}
    return user


def require_permission(permission: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        perms = await get_user_permissions(user)
        if not has_permission(user, perms, permission):
            raise HTTPException(status_code=403, detail=f"Requires permission: {permission}")
        user = await enrich_user_context(user)
        return user
    return dep


def require_any_permission(*permissions: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        user_perms = await get_user_permissions(user)
        if is_platform_admin(user) or is_business_owner(user):
            return await enrich_user_context(user)
        if not any(p in user_perms for p in permissions):
            raise HTTPException(status_code=403, detail=f"Requires one of: {permissions}")
        return await enrich_user_context(user)
    return dep


async def can_create_employee_for_role(actor: dict, target_role_id: str) -> bool:
    if is_business_owner(actor):
        return True
    perms = await get_user_permissions(actor)
    if not has_permission(actor, perms, "employees.create"):
        return False
    db = get_db()
    actor_role = await get_business_role(db, actor)
    if not actor_role or not actor_role.get("can_create_employees"):
        return False
    target = await db.business_roles.find_one({"_id": ObjectId(target_role_id)})
    if not target or not target.get("is_active", True):
        return False
    if target.get("parent_role_id") == str(actor_role["_id"]):
        return True
    return str(actor_role["_id"]) == target.get("parent_role_id")
