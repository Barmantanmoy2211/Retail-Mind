"""Sync employee salaries as recurring monthly staff expenses."""
from bson import ObjectId
from db import get_db, utcnow_iso


def _current_salary_month() -> str:
    return utcnow_iso()[:7]  # YYYY-MM


async def get_user_accessible_outlet_ids(db, user: dict) -> list[str]:
    """Outlets visible to user per org role scope and assignments."""
    from permissions import is_business_owner

    business_id = user.get("business_id")
    if not business_id:
        return []

    if is_business_owner(user) or user.get("role") == "business_admin":
        outlets = await db.outlets.find({"business_id": business_id}).to_list(200)
        return [str(o["_id"]) for o in outlets]

    if user.get("role_id"):
        role = await db.business_roles.find_one({"_id": ObjectId(user["role_id"])})
        if role:
            scope = role.get("scope", "outlet")
            if scope == "all_outlets":
                outlets = await db.outlets.find({"business_id": business_id}).to_list(200)
                return [str(o["_id"]) for o in outlets]
            if scope == "multi_outlet" and role.get("outlet_ids"):
                return list(role["outlet_ids"])

    if user.get("outlet_ids"):
        return list(user["outlet_ids"])
    if user.get("outlet_id"):
        return [user["outlet_id"]]
    return []


async def build_expense_scope_filter(db, user: dict, outlet_id: str | None = None) -> dict:
    """Mongo filter for expenses scoped by org hierarchy."""
    from fastapi import HTTPException
    from permissions import is_business_owner

    f: dict = {"business_id": user["business_id"]}
    accessible = await get_user_accessible_outlet_ids(db, user)

    if is_business_owner(user) or user.get("role") == "business_admin":
        if outlet_id:
            f["outlet_id"] = outlet_id
        return f

    if not accessible:
        f["outlet_id"] = "__none__"
        return f

    if outlet_id:
        if outlet_id not in accessible:
            raise HTTPException(403, "Not allowed for this outlet")
        f["outlet_id"] = outlet_id
    elif len(accessible) == 1:
        f["outlet_id"] = accessible[0]
    else:
        f["outlet_id"] = {"$in": accessible}
    return f


async def sync_salary_expenses(db, business_id: str) -> int:
    """
    Upsert approved recurring staff/salary expense rows for each active employee
    with a base_salary set for the current month.
    """
    salary_month = _current_salary_month()
    month_start = f"{salary_month}-01"
    synced = 0

    cursor = db.users.find({
        "business_id": business_id,
        "active": True,
        "role": {"$nin": ["business_admin", "platform_admin"]},
        "base_salary": {"$gt": 0},
    })

    async for emp in cursor:
        amount = float(emp.get("base_salary") or 0)
        if amount <= 0:
            continue

        outlet_id = emp.get("outlet_id") or (
            emp.get("outlet_ids", [None])[0] if emp.get("outlet_ids") else None
        )
        if not outlet_id:
            continue

        employee_id = str(emp["_id"])
        existing = await db.expenses.find_one({
            "business_id": business_id,
            "employee_id": employee_id,
            "salary_month": salary_month,
            "source": "salary_sync",
        })

        doc = {
            "business_id": business_id,
            "outlet_id": outlet_id,
            "employee_id": employee_id,
            "employee_name": emp.get("name", ""),
            "category": "staff",
            "subcategory": "salary",
            "amount": amount,
            "description": f"Monthly salary — {emp.get('name', 'Employee')}",
            "expense_date": month_start,
            "status": "approved",
            "is_recurring": True,
            "recurring_type": "monthly",
            "salary_month": salary_month,
            "source": "salary_sync",
            "updated_at": utcnow_iso(),
        }

        if existing:
            await db.expenses.update_one(
                {"_id": existing["_id"]},
                {"$set": doc},
            )
        else:
            doc["created_by"] = emp.get("hired_by") or employee_id
            doc["created_at"] = utcnow_iso()
            doc["approved_at"] = utcnow_iso()
            doc["approved_by"] = emp.get("hired_by")
            await db.expenses.insert_one(doc)
        synced += 1

    return synced
