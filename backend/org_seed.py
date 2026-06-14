"""Default org templates, workflows, and migration helpers."""
import re
from bson import ObjectId
from db import get_db, utcnow_iso
from permissions import ALL_PERMISSION_KEYS

RETAIL_TEMPLATE = {
    "name": "Retail",
    "roles": [
        {
            "name": "Outlet Manager",
            "slug": "outlet_manager",
            "description": "Manages a single outlet",
            "scope": "outlet",
            "permissions": [
                "employees.create", "employees.edit", "employees.view", "approvals.view", "approvals.act",
                "bills.create", "products.create", "products.edit", "inventory.manage",
                "customers.view", "expenses.create", "expenses.approve", "reports.view",
            ],
            "can_create_employees": True,
            "parent_slug": None,
        },
        {
            "name": "Cashier",
            "slug": "cashier",
            "description": "POS billing and customer lookup",
            "scope": "outlet",
            "permissions": ["bills.create", "customers.view", "expenses.create"],
            "can_create_employees": False,
            "parent_slug": "outlet_manager",
        },
        {
            "name": "Biller",
            "slug": "biller",
            "description": "Dedicated billing staff",
            "scope": "outlet",
            "permissions": ["bills.create", "customers.view"],
            "can_create_employees": False,
            "parent_slug": "outlet_manager",
        },
    ],
}

RESTAURANT_TEMPLATE = {
    "name": "Restaurant",
    "roles": [
        {"name": "Operations Manager", "slug": "operations_manager", "scope": "all_outlets",
         "permissions": ["employees.view", "reports.view", "expenses.approve", "approvals.act"],
         "can_create_employees": True, "parent_slug": None},
        {"name": "Restaurant Manager", "slug": "restaurant_manager", "scope": "outlet",
         "permissions": ["employees.create", "bills.create", "inventory.manage", "expenses.create", "reports.view"],
         "can_create_employees": True, "parent_slug": "operations_manager"},
        {"name": "Captain", "slug": "captain", "scope": "outlet",
         "permissions": ["bills.create", "customers.view"], "can_create_employees": False, "parent_slug": "restaurant_manager"},
        {"name": "Waiter", "slug": "waiter", "scope": "outlet",
         "permissions": ["bills.create", "customers.view"], "can_create_employees": False, "parent_slug": "captain"},
    ],
}

PHARMACY_TEMPLATE = {
    "name": "Pharmacy",
    "roles": [
        {"name": "Store Manager", "slug": "store_manager", "scope": "outlet",
         "permissions": ["employees.create", "inventory.manage", "products.create", "expenses.approve", "reports.view"],
         "can_create_employees": True, "parent_slug": None},
        {"name": "Pharmacist", "slug": "pharmacist", "scope": "outlet",
         "permissions": ["bills.create", "inventory.manage", "customers.view"], "can_create_employees": False, "parent_slug": "store_manager"},
        {"name": "Cashier", "slug": "cashier", "scope": "outlet",
         "permissions": ["bills.create", "customers.view"], "can_create_employees": False, "parent_slug": "store_manager"},
    ],
}

TEMPLATES = {
    "retail": RETAIL_TEMPLATE,
    "restaurant": RESTAURANT_TEMPLATE,
    "pharmacy": PHARMACY_TEMPLATE,
}


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return s or "role"


async def seed_default_workflows(db, business_id: str):
    defaults = [
        {
            "name": "Employee Hiring",
            "trigger_type": "hiring",
            "approval_levels": [{"type": "system_role", "system_role": "business_admin"}],
        },
        {
            "name": "Role Creation",
            "trigger_type": "role_create",
            "approval_levels": [{"type": "system_role", "system_role": "business_admin"}],
        },
        {
            "name": "Expense Approval",
            "trigger_type": "expense",
            "approval_levels": [
                {"type": "role", "role_id": None, "role_slug": "outlet_manager"},
                {"type": "system_role", "system_role": "business_admin"},
            ],
        },
        {
            "name": "Employee Transfer",
            "trigger_type": "transfer",
            "approval_levels": [{"type": "system_role", "system_role": "business_admin"}],
        },
    ]
    for wf in defaults:
        existing = await db.approval_workflows.find_one({
            "business_id": business_id, "trigger_type": wf["trigger_type"], "is_active": True,
        })
        if existing:
            continue
        levels = []
        for lv in wf["approval_levels"]:
            if lv.get("role_slug"):
                role = await db.business_roles.find_one({
                    "business_id": business_id, "slug": lv["role_slug"],
                })
                if role:
                    levels.append({"type": "role", "role_id": str(role["_id"])})
            else:
                levels.append({k: v for k, v in lv.items() if k != "role_slug"})
        if wf["trigger_type"] == "expense" and not any(l.get("type") == "role" for l in levels):
            levels = [{"type": "system_role", "system_role": "business_admin"}]
        doc = {
            "business_id": business_id,
            "name": wf["name"],
            "trigger_type": wf["trigger_type"],
            "approval_levels": levels,
            "is_active": True,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        }
        await db.approval_workflows.insert_one(doc)


async def import_role_template(db, business_id: str, template_key: str, created_by: str) -> dict:
    tpl = TEMPLATES.get(template_key)
    if not tpl:
        raise ValueError(f"Unknown template: {template_key}")
    slug_to_id = {}
    created = []
    for rdef in tpl["roles"]:
        slug = rdef.get("slug") or _slugify(rdef["name"])
        existing = await db.business_roles.find_one({"business_id": business_id, "slug": slug})
        if existing:
            slug_to_id[slug] = str(existing["_id"])
            continue
        parent_id = None
        if rdef.get("parent_slug"):
            parent_id = slug_to_id.get(rdef["parent_slug"])
        level = 1 if not parent_id else 2
        doc = {
            "business_id": business_id,
            "name": rdef["name"],
            "slug": slug,
            "description": rdef.get("description", ""),
            "parent_role_id": parent_id,
            "scope": rdef.get("scope", "outlet"),
            "outlet_ids": [],
            "permissions": rdef.get("permissions", []),
            "can_create_employees": rdef.get("can_create_employees", False),
            "can_create_roles": False,
            "is_active": True,
            "level": level,
            "created_by": created_by,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        }
        res = await db.business_roles.insert_one(doc)
        slug_to_id[slug] = str(res.inserted_id)
        created.append(slug)
    await seed_default_workflows(db, business_id)
    return {"imported": created, "template": template_key}


async def migrate_business_users(db, business_id: str):
    """Link legacy users to business_roles by slug."""
    roles = await db.business_roles.find({"business_id": business_id}).to_list(100)
    if not roles:
        owner = await db.users.find_one({"business_id": business_id, "role": "business_admin"})
        if owner:
            await import_role_template(db, business_id, "retail", str(owner["_id"]))
            roles = await db.business_roles.find({"business_id": business_id}).to_list(100)
    slug_map = {r["slug"]: str(r["_id"]) for r in roles}
    owner = await db.users.find_one({"business_id": business_id, "role": "business_admin"})
    owner_id = str(owner["_id"]) if owner else None

    async for u in db.users.find({"business_id": business_id}):
        updates = {}
        if u.get("role") == "business_admin":
            updates["system_role"] = "business_admin"
        elif u.get("role") in slug_map and not u.get("role_id"):
            updates["role_id"] = slug_map[u["role"]]
            if not u.get("reports_to_user_id") and owner_id and str(u["_id"]) != owner_id:
                updates["reports_to_user_id"] = owner_id
            if u.get("outlet_id") and not u.get("outlet_ids"):
                updates["outlet_ids"] = [u["outlet_id"]]
            if not u.get("employee_status"):
                updates["employee_status"] = "active"
        if updates:
            updates["updated_at"] = utcnow_iso()
            await db.users.update_one({"_id": u["_id"]}, {"$set": updates})
