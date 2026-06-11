"""Seed demo data for RetailFlow AI."""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path
import random

load_dotenv(Path(__file__).parent / ".env")

from db import get_db, utcnow_iso
from auth_utils import hash_password
from bson import ObjectId


async def seed():
    db = get_db()

    # ===== Platform Admin =====
    pa_email = "admin@retailflow.ai"
    pa = await db.users.find_one({"email": pa_email})
    if not pa:
        await db.users.insert_one({
            "name": "Platform Admin",
            "email": pa_email,
            "phone": "+91-9999999999",
            "password_hash": hash_password("Admin@123"),
            "role": "platform_admin",
            "business_id": None,
            "outlet_id": None,
            "active": True,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        })
        print(f"Created Platform Admin: {pa_email} / Admin@123")
    else:
        print(f"Platform Admin exists: {pa_email}")

    # ===== Demo Business =====
    demo_email = "owner@bharatmart.com"
    existing_biz = await db.businesses.find_one({"email": demo_email})
    if existing_biz:
        print(f"Demo business exists - skipping seed")
        print("\n=== DEMO CREDENTIALS ===")
        print("Platform Admin: admin@retailflow.ai / Admin@123")
        print("Business Owner: owner@bharatmart.com / Owner@123")
        print("Outlet Manager: manager@bharatmart.com / Manager@123")
        print("Cashier:        cashier@bharatmart.com / Cashier@123")
        return

    biz_res = await db.businesses.insert_one({
        "business_name": "Bharat Mart",
        "business_type": "Grocery Store",
        "owner_name": "Rajesh Kumar",
        "email": demo_email,
        "phone": "+91-9876543210",
        "address": "MG Road, Bangalore",
        "gst_number": "29ABCDE1234F1Z5",
        "plan": "growth",
        "subscription_status": "approved",
        "outlet_limit": 5,
        "plan_price": 2999,
        "currency": "INR",
        "approved_at": utcnow_iso(),
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    })
    biz_id = str(biz_res.inserted_id)
    print(f"Created Business: Bharat Mart (id={biz_id})")

    # Outlets
    outlets_data = [
        {"name": "Bangalore Main", "address": "MG Road, Bangalore", "phone": "+91-9111111111"},
        {"name": "Mumbai Branch", "address": "Andheri West, Mumbai", "phone": "+91-9222222222"},
        {"name": "Delhi Branch", "address": "Connaught Place, Delhi", "phone": "+91-9333333333"},
    ]
    outlet_ids = []
    for o in outlets_data:
        res = await db.outlets.insert_one({
            **o, "business_id": biz_id, "active": True,
            "created_at": utcnow_iso(), "updated_at": utcnow_iso(),
        })
        outlet_ids.append(str(res.inserted_id))
    print(f"Created {len(outlet_ids)} outlets")

    # Users (staff)
    users_to_create = [
        {"name": "Rajesh Kumar", "email": demo_email, "password": "Owner@123",
         "role": "business_admin", "outlet_id": None},
        {"name": "Priya Sharma", "email": "manager@bharatmart.com", "password": "Manager@123",
         "role": "outlet_manager", "outlet_id": outlet_ids[0]},
        {"name": "Amit Patel", "email": "cashier@bharatmart.com", "password": "Cashier@123",
         "role": "cashier", "outlet_id": outlet_ids[0]},
        {"name": "Suresh Mehta", "email": "manager.mumbai@bharatmart.com", "password": "Manager@123",
         "role": "outlet_manager", "outlet_id": outlet_ids[1]},
    ]
    for u in users_to_create:
        await db.users.insert_one({
            "name": u["name"],
            "email": u["email"],
            "phone": "+91-9000000000",
            "password_hash": hash_password(u["password"]),
            "role": u["role"],
            "business_id": biz_id,
            "outlet_id": u["outlet_id"],
            "active": True,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        })
    print(f"Created {len(users_to_create)} users")

    # Reward config
    await db.reward_configs.insert_one({
        "business_id": biz_id,
        "points_per_currency": 1.0,  # 1 pt per 100
        "currency_per_point": 1.0,
        "min_redeem_points": 100,
        "expiry_days": 365,
    })

    # Tax configs
    for t in [
        {"name": "CGST 9%", "rate": 9, "type": "CGST"},
        {"name": "SGST 9%", "rate": 9, "type": "SGST"},
        {"name": "IGST 18%", "rate": 18, "type": "IGST"},
        {"name": "CGST 2.5%", "rate": 2.5, "type": "CGST"},
        {"name": "SGST 2.5%", "rate": 2.5, "type": "SGST"},
    ]:
        await db.tax_configs.insert_one({**t, "business_id": biz_id})

    # Categories
    cats = ["Beverages", "Snacks", "Dairy", "Groceries", "Personal Care", "Household"]
    for c in cats:
        await db.categories.insert_one({
            "name": c, "business_id": biz_id, "created_at": utcnow_iso(),
        })

    # Products
    products = [
        ("Coca-Cola 1L", "Beverages", 35, 50, 5, 18),
        ("Pepsi 500ml", "Beverages", 18, 25, 3, 18),
        ("Lay's Chips", "Snacks", 12, 20, 2, 5),
        ("Kurkure 100g", "Snacks", 15, 25, 3, 5),
        ("Amul Milk 1L", "Dairy", 50, 60, 6, 5),
        ("Amul Butter 100g", "Dairy", 45, 55, 5, 5),
        ("Britannia Bread", "Groceries", 30, 40, 4, 0),
        ("Maggi Noodles", "Snacks", 10, 14, 1, 5),
        ("Tata Salt 1kg", "Groceries", 18, 25, 2, 0),
        ("Aashirvaad Atta 5kg", "Groceries", 220, 280, 28, 5),
        ("Surf Excel 1kg", "Household", 180, 230, 23, 18),
        ("Colgate Toothpaste", "Personal Care", 50, 75, 7, 18),
        ("Dettol Soap", "Personal Care", 25, 40, 4, 18),
        ("Tide Detergent", "Household", 120, 160, 16, 18),
        ("Real Juice 1L", "Beverages", 80, 110, 11, 12),
        ("Cadbury Dairy Milk", "Snacks", 45, 60, 6, 18),
        ("Parle-G Biscuits", "Snacks", 8, 10, 1, 18),
        ("Bourbon Biscuit", "Snacks", 25, 35, 3, 18),
        ("Nescafe Coffee 50g", "Beverages", 110, 145, 14, 18),
        ("Tata Tea 500g", "Beverages", 180, 240, 24, 18),
    ]
    pids = []
    for i, (name, cat, cp, sp, pts, tax) in enumerate(products):
        res = await db.products.insert_one({
            "name": name,
            "sku": f"SKU-{1000+i}",
            "barcode": f"890{1000+i:07d}",
            "category": cat,
            "cost_price": cp,
            "selling_price": sp,
            "tax_percent": tax,
            "reward_points": pts,
            "min_stock": 10,
            "unit": "pcs",
            "business_id": biz_id,
            "active": True,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        })
        pids.append(str(res.inserted_id))

    # Initial stock
    for pid in pids:
        for oid in outlet_ids:
            await db.stocks.insert_one({
                "product_id": pid,
                "outlet_id": oid,
                "business_id": biz_id,
                "quantity": random.randint(20, 200),
                "updated_at": utcnow_iso(),
            })

    # Customers
    customer_names = [
        ("Anjali Verma", "+91-9876111111"),
        ("Vikram Singh", "+91-9876222222"),
        ("Sneha Reddy", "+91-9876333333"),
        ("Rahul Joshi", "+91-9876444444"),
        ("Pooja Iyer", "+91-9876555555"),
        ("Karan Malhotra", "+91-9876666666"),
        ("Divya Nair", "+91-9876777777"),
        ("Aakash Gupta", "+91-9876888888"),
    ]
    cust_ids = []
    for n, ph in customer_names:
        res = await db.customers.insert_one({
            "name": n,
            "phone": ph,
            "email": f"{n.split()[0].lower()}@example.com",
            "business_id": biz_id,
            "reward_balance": random.randint(0, 500),
            "total_purchases": 0,
            "total_spent": 0.0,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        })
        cust_ids.append(str(res.inserted_id))

    # Suppliers
    suppliers = [
        ("Pepsi Distributors", "+91-9000111111", "29ABCDE1111F1Z5"),
        ("Amul Wholesale", "+91-9000222222", "29ABCDE2222F1Z5"),
        ("ITC Foods", "+91-9000333333", "29ABCDE3333F1Z5"),
    ]
    for n, c, gst in suppliers:
        await db.suppliers.insert_one({
            "name": n, "contact": c, "gst_number": gst,
            "business_id": biz_id, "created_at": utcnow_iso(),
        })

    # Generate bills for last 30 days
    print("Generating sample bills...")
    bill_counter = 0
    for day_offset in range(30, -1, -1):
        date = datetime.now(timezone.utc) - timedelta(days=day_offset)
        bills_today = random.randint(3, 15)
        for _ in range(bills_today):
            outlet_id = random.choice(outlet_ids)
            num_items = random.randint(1, 6)
            chosen = random.sample(pids, num_items)
            items_out = []
            subtotal = 0
            tax_total = 0
            pts_earned = 0
            for pid in chosen:
                p = await db.products.find_one({"_id": ObjectId(pid)})
                qty = random.randint(1, 5)
                line = p["selling_price"] * qty
                tax = line * p.get("tax_percent", 0) / 100
                subtotal += line
                tax_total += tax
                pts_earned += p.get("reward_points", 0) * qty
                items_out.append({
                    "product_id": pid,
                    "product_name": p["name"],
                    "sku": p.get("sku"),
                    "quantity": qty,
                    "unit_price": p["selling_price"],
                    "cost_price": p.get("cost_price", 0),
                    "tax_percent": p.get("tax_percent", 0),
                    "tax_amount": round(tax, 2),
                    "discount": 0,
                    "line_total": round(line, 2),
                })
            total = round(subtotal + tax_total, 2)
            bill_counter += 1
            cust = random.choice(cust_ids + [None, None])  # 1/3 walk-in
            cust_doc = None
            if cust:
                cust_doc = await db.customers.find_one({"_id": ObjectId(cust)})
            await db.bills.insert_one({
                "business_id": biz_id,
                "outlet_id": outlet_id,
                "customer_id": cust,
                "customer_name": cust_doc["name"] if cust_doc else "Walk-in",
                "customer_phone": cust_doc["phone"] if cust_doc else None,
                "bill_no": f"INV-{bill_counter:06d}",
                "items": items_out,
                "subtotal": round(subtotal, 2),
                "tax_total": round(tax_total, 2),
                "discount_total": 0,
                "redeem_points": 0,
                "redeem_value": 0,
                "total": total,
                "payment_method": random.choice(["cash", "upi", "card"]),
                "reward_points_earned": pts_earned,
                "cashier_name": "Amit Patel",
                "created_at": date.isoformat(),
            })
    print(f"Generated {bill_counter} bills")

    # Set bill counter
    await db.counters.update_one({"_id": f"bill_{biz_id}"}, {"$set": {"seq": bill_counter}}, upsert=True)

    # Sample expenses
    exp_data = [
        ("operations", "rent", 25000),
        ("operations", "electricity", 8500),
        ("operations", "internet", 1500),
        ("staff", "salary", 45000),
        ("marketing", "ads", 5000),
    ]
    for cat, sub, amt in exp_data:
        for oid in outlet_ids:
            await db.expenses.insert_one({
                "business_id": biz_id,
                "outlet_id": oid,
                "category": cat,
                "subcategory": sub,
                "amount": amt + random.randint(-2000, 2000),
                "description": f"{sub.title()} expense",
                "status": "approved",
                "created_by": "system",
                "approved_at": utcnow_iso(),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 25))).isoformat(),
            })

    # Pending business for platform admin demo
    await db.businesses.insert_one({
        "business_name": "FreshMart Pharmacy",
        "business_type": "Pharmacy",
        "owner_name": "Dr. Asha Rao",
        "email": "asha@freshmart.com",
        "phone": "+91-9988776655",
        "plan": "starter",
        "subscription_status": "pending",
        "outlet_limit": 1,
        "plan_price": 999,
        "currency": "INR",
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    })

    print("\n=== SEED COMPLETE ===")
    print("Platform Admin: admin@retailflow.ai / Admin@123")
    print("Business Owner: owner@bharatmart.com / Owner@123")
    print("Outlet Manager: manager@bharatmart.com / Manager@123")
    print("Cashier:        cashier@bharatmart.com / Cashier@123")


if __name__ == "__main__":
    asyncio.run(seed())
