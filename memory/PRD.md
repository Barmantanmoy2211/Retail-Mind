# RetailFlow AI - Product Requirements Doc

## Original Problem Statement
Build a Multi-Tenant SaaS platform (RetailFlow AI) for billing, inventory, CRM, rewards, expenses, taxes, suppliers, and analytics. Target: any business (grocery, restaurant, footwear, clothing, electronics, pharmacy, hardware, wholesale, service, custom). Multi-outlet support, role-based dashboards (Platform Admin, Business Admin, Outlet Manager, Cashier), subscription plans with manual approval (no payment gateway in MVP), audit logs, notifications, glassmorphism premium UI inspired by Stripe/Linear/Notion/Vercel.

## Architecture
- **Frontend**: React 19, Tailwind, ShadCN UI, Recharts, React Router v7, sonner toast.
- **Backend**: FastAPI + Motor (async MongoDB driver), JWT auth, bcrypt passwords.
- **Database**: MongoDB (local dev). User-provided Atlas URL stored as `ATLAS_MONGO_URL` in `/app/backend/.env` — to be enabled once Atlas IP `0.0.0.0/0` is whitelisted (SSL handshake currently fails).
- **Theme**: Light + Dark mode, "Swiss & High-Contrast" archetype, Electric-Blue accent, Cabinet Grotesk + Manrope typography.

## User Personas
- **Platform Admin** (SaaS owner): manages all businesses, approves subscriptions, sees platform-wide analytics.
- **Business Admin** (business owner): manages everything within their tenant.
- **Outlet Manager**: scoped to their outlet — billing, inventory, expenses, customers.
- **Cashier**: POS billing + customer lookup only.

## Demo Credentials (in `/app/memory/test_credentials.md`)
- Platform Admin: `admin@retailflow.ai` / `Admin@123`
- Business Owner: `owner@bharatmart.com` / `Owner@123`
- Outlet Manager: `manager@bharatmart.com` / `Manager@123`
- Cashier: `cashier@bharatmart.com` / `Cashier@123`

## What's been implemented (Feb 2026)

### Backend (`/app/backend/`)
- `routes_core.py` — auth (register-business, login, me), platform admin (businesses CRUD, approve/reject, stats), outlets CRUD, users/staff CRUD.
- `routes_business.py` — categories, products, inventory transactions (stock in/out/transfer/adjustment), low-stock alerts, customers (with detail/history), bills (POS with tax + rewards + redemption), suppliers, purchase orders (received→stock auto-update + expense), expenses with approval workflow, reward configs, tax configs, audit logs, notifications.
- `routes_dashboard.py` — business dashboard (12+ KPIs, daily trend, outlet comparison, top products, recent bills), reports (profit-loss, tax, inventory fast/slow/dead, sales).
- `auth_utils.py` — JWT, bcrypt, RBAC dependencies (`require_roles`, `get_business_scope` for tenant isolation).
- `seed.py` — seeds Platform Admin + "Bharat Mart" demo business with 3 outlets, 4 users, 20 products, 8 customers, 306 bills across 30 days, 1 pending business "FreshMart Pharmacy".

### Frontend (`/app/frontend/src/pages/`)
- **Public**: Landing (bento features + 3 pricing tiers), Login (with demo quick-fill), Register Business (plan + business + owner form), PendingApproval.
- **Platform Admin**: PlatformDashboard (8 KPIs, pending approvals table inline approve/reject, plan distribution pie, top businesses, category bar), PlatformBusinesses (search, filter, suspend/activate/change-plan).
- **Business**: BusinessDashboard (KPI strip, sales area chart, top products, outlet comparison bar, recent bills), POS (left product grid with category filter, right cart with customer picker, redeem points, payment method, invoice modal), Products CRUD, Customers list+detail with bill/reward history, Bills list+detail modal, Inventory (transactions + low-stock tabs with stock_in/out/transfer/adjustment dialogs), Outlets, Staff & Roles, Suppliers, Purchase Orders (with mark-received → auto stock + expense), Expenses (approval workflow), Rewards (config editor), Taxes (CGST/SGST/IGST), Reports (P&L + Tax + Inventory tabs with CSV export + Health Score Phase 2 banner), AuditLogs (timeline), Settings (profile + subscription + integrations Phase 2 banners).

### Test results
- Backend pytest: 32/32 passing (auth, RBAC, tenant isolation, platform admin flow, products/customers/bills CRUD, inventory, PO→expense, expense approval, dashboard, reports).
- Frontend: login routing for 3 roles verified, business owner dashboard KPIs/charts working, POS cart add+totals working, platform admin approval UI working.

## P0 (deferred) Backlog
- AWS S3 file uploads (Phase 2 banner placeholder shown)
- PDF Invoice generation (Phase 2 banner)
- WhatsApp Cloud API integration (Phase 2 banner)
- AI Outlet Health Score (Phase 2 banner in Reports → Health Score tab)
- MongoDB Atlas switch (waiting on IP whitelisting `0.0.0.0/0`)

## P1 Backlog
- Excel export (CSV available)
- Global command palette / keyboard shortcuts
- Notification center popup
- Stock availability check before POS sale (currently allows negative stock)
- Bill counter race-condition (rare)

## Next Tasks
1. Once user whitelists Atlas IP, swap `MONGO_URL` to Atlas value and re-seed.
2. Implement Phase 2 integrations as user requests.
3. Add image uploads for products (S3 / object storage).
4. Real-time notifications (WebSocket / SSE).
