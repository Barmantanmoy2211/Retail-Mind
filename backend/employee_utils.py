"""Employee salary computation from monthly staff expenses."""
from datetime import datetime, timezone
from bson import ObjectId
from db import get_db


def _month_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


async def compute_monthly_salary(db, employee: dict) -> dict:
    """
    Derive monthly salary from approved staff expenses for the employee's outlet.
    Uses employee-linked expenses first, then splits outlet staff/salary pool across active staff.
    """
    outlet_id = employee.get("outlet_id") or (
        employee.get("outlet_ids", [None])[0] if employee.get("outlet_ids") else None
    )
    business_id = employee.get("business_id")
    employee_id = str(employee.get("_id") or employee.get("id") or "")
    month_start = _month_start_iso()

    if not outlet_id or not business_id:
        return {
            "salary": float(employee.get("base_salary") or 0),
            "source": "manual",
            "month": month_start[:7],
        }

    salary_month = month_start[:7]
    synced = await db.expenses.find({
        "business_id": business_id,
        "employee_id": employee_id,
        "salary_month": salary_month,
        "source": "salary_sync",
        "status": "approved",
    }).to_list(10)
    if synced:
        total = sum(float(e.get("amount") or 0) for e in synced)
        return {
            "salary": round(total, 2),
            "source": "recurring_salary",
            "expense_count": len(synced),
            "month": salary_month,
        }

    name = employee.get("name", "")
    linked_filter = {
        "business_id": business_id,
        "outlet_id": outlet_id,
        "status": "approved",
        "category": "staff",
        "created_at": {"$gte": month_start},
        "$or": [
            {"employee_id": employee_id},
            *([{"description": {"$regex": name, "$options": "i"}}] if name else []),
        ],
    }
    linked = await db.expenses.find(linked_filter).to_list(500)
    if linked:
        total = sum(float(e.get("amount") or 0) for e in linked)
        return {
            "salary": round(total, 2),
            "source": "employee_expenses",
            "expense_count": len(linked),
            "month": salary_month,
        }

    pool_filter = {
        "business_id": business_id,
        "outlet_id": outlet_id,
        "status": "approved",
        "category": "staff",
        "subcategory": {"$in": ["salary", "bonus", "incentive"]},
        "created_at": {"$gte": month_start},
    }
    pool = await db.expenses.find(pool_filter).to_list(500)
    pool_total = sum(float(e.get("amount") or 0) for e in pool)

    if pool_total <= 0:
        base = float(employee.get("base_salary") or 0)
        return {
            "salary": round(base, 2),
            "source": "base_salary" if base else "none",
            "month": month_start[:7],
        }

    staff_count = await db.users.count_documents({
        "business_id": business_id,
        "active": True,
        "role": {"$nin": ["business_admin", "platform_admin"]},
        "$or": [{"outlet_id": outlet_id}, {"outlet_ids": outlet_id}],
    })
    share = round(pool_total / max(staff_count, 1), 2)
    return {
        "salary": share,
        "source": "outlet_pool",
        "pool_total": round(pool_total, 2),
        "staff_count": staff_count,
        "month": month_start[:7],
    }


async def enrich_employee(db, doc: dict) -> dict:
    """Attach role name, reports-to, and computed salary."""
    from db import clean_doc

    item = clean_doc(doc)
    if doc.get("role_id"):
        try:
            role = await db.business_roles.find_one({"_id": ObjectId(doc["role_id"])})
            if role:
                item["role_name"] = role.get("name")
        except Exception:
            pass
    if doc.get("reports_to_user_id"):
        try:
            mgr = await db.users.find_one({"_id": ObjectId(doc["reports_to_user_id"])})
            if mgr:
                item["reports_to_name"] = mgr.get("name")
        except Exception:
            pass
    salary_info = await compute_monthly_salary(db, doc)
    item["salary"] = salary_info["salary"]
    item["salary_source"] = salary_info["source"]
    item["salary_month"] = salary_info["month"]
    if not item.get("date_of_joining") and doc.get("created_at"):
        item["date_of_joining"] = doc["created_at"][:10]
    return item
