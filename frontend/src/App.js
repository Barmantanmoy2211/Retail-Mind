import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import { ROUTE_PERMISSIONS } from "@/lib/permissions";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PendingApproval from "@/pages/PendingApproval";
import BusinessDashboard from "@/pages/BusinessDashboard";
import PlatformDashboard from "@/pages/PlatformDashboard";
import PlatformBusinesses from "@/pages/PlatformBusinesses";
import PlatformAdmins from "@/pages/PlatformAdmins";
import POS from "@/pages/POS";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import Bills from "@/pages/Bills";
import Outlets from "@/pages/Outlets";
import Organization from "@/pages/organization/Organization";
import Inventory from "@/pages/Inventory";
import Suppliers from "@/pages/Suppliers";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Expenses from "@/pages/Expenses";
import Rewards from "@/pages/Rewards";
import Taxes from "@/pages/Taxes";
import Reports from "@/pages/Reports";
import HealthScore from "@/pages/HealthScore";
import AuditLogs from "@/pages/AuditLogs";
import Settings from "@/pages/Settings";

import "@/App.css";

const LEGACY_ROLE_ROUTES = {
  "/dashboard": ["business_admin", "outlet_manager"],
  "/pos": ["business_admin", "outlet_manager", "cashier"],
  "/products": ["business_admin", "outlet_manager", "cashier"],
  "/customers": ["business_admin", "outlet_manager", "cashier"],
  "/bills": ["business_admin", "outlet_manager", "cashier"],
  "/inventory": ["business_admin", "outlet_manager"],
  "/suppliers": ["business_admin", "outlet_manager"],
  "/purchase-orders": ["business_admin", "outlet_manager"],
  "/expenses": ["business_admin", "outlet_manager"],
  "/outlets": ["business_admin"],
  "/organization": ["business_admin", "outlet_manager"],
  "/staff": ["business_admin"],
  "/rewards": ["business_admin"],
  "/taxes": ["business_admin"],
  "/reports": ["business_admin", "outlet_manager"],
  "/health-score": ["business_admin", "outlet_manager"],
  "/audit": ["business_admin"],
  "/settings": ["business_admin"],
};

function ProtectedRoute({ children, roles, path }) {
  const { user, business, loading, canAny } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "platform_admin" && business?.subscription_status === "pending") {
    return <Navigate to="/pending-approval" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    const perms = path ? ROUTE_PERMISSIONS[path] : null;
    if (perms && canAny(...perms)) {
      return <AppLayout>{children}</AppLayout>;
    }
    const legacy = path ? LEGACY_ROLE_ROUTES[path] : null;
    if (legacy && legacy.includes(user.role)) {
      return <AppLayout>{children}</AppLayout>;
    }
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function HomeRedirect() {
  const { user, business, loading, canAny } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Landing />;
  if (user.role === "platform_admin") return <Navigate to="/platform" replace />;
  if (business?.subscription_status === "pending") return <Navigate to="/pending-approval" replace />;
  if (user.role === "cashier" || canAny("bills.create")) return <Navigate to="/pos" replace />;
  if (canAny("reports.view") || user.role === "business_admin" || user.role === "outlet_manager") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/pos" replace />;
}

function PR({ path, roles, children }) {
  return <ProtectedRoute roles={roles} path={path}>{children}</ProtectedRoute>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/pending-approval" element={<PendingApproval />} />

            <Route path="/platform" element={<PR path="/platform" roles={["platform_admin"]}><PlatformDashboard /></PR>} />
            <Route path="/platform/businesses" element={<PR path="/platform/businesses" roles={["platform_admin"]}><PlatformBusinesses /></PR>} />
            <Route path="/platform/approvals" element={<PR path="/platform/approvals" roles={["platform_admin"]}><PlatformBusinesses /></PR>} />
            <Route path="/platform/admins" element={<PR path="/platform/admins" roles={["platform_admin"]}><PlatformAdmins /></PR>} />

            <Route path="/dashboard" element={<PR path="/dashboard" roles={["business_admin", "outlet_manager"]}><BusinessDashboard /></PR>} />
            <Route path="/pos" element={<PR path="/pos" roles={["business_admin", "outlet_manager", "cashier"]}><POS /></PR>} />
            <Route path="/products" element={<PR path="/products" roles={["business_admin", "outlet_manager", "cashier"]}><Products /></PR>} />
            <Route path="/customers" element={<PR path="/customers" roles={["business_admin", "outlet_manager", "cashier"]}><Customers /></PR>} />
            <Route path="/bills" element={<PR path="/bills" roles={["business_admin", "outlet_manager", "cashier"]}><Bills /></PR>} />
            <Route path="/inventory" element={<PR path="/inventory" roles={["business_admin", "outlet_manager"]}><Inventory /></PR>} />
            <Route path="/suppliers" element={<PR path="/suppliers" roles={["business_admin", "outlet_manager"]}><Suppliers /></PR>} />
            <Route path="/purchase-orders" element={<PR path="/purchase-orders" roles={["business_admin", "outlet_manager"]}><PurchaseOrders /></PR>} />
            <Route path="/expenses" element={<PR path="/expenses" roles={["business_admin", "outlet_manager"]}><Expenses /></PR>} />
            <Route path="/outlets" element={<PR path="/outlets" roles={["business_admin"]}><Outlets /></PR>} />
            <Route path="/organization" element={<PR path="/organization" roles={["business_admin", "outlet_manager"]}><Organization /></PR>} />
            <Route path="/staff" element={<Navigate to="/organization" replace />} />
            <Route path="/rewards" element={<PR path="/rewards" roles={["business_admin"]}><Rewards /></PR>} />
            <Route path="/taxes" element={<PR path="/taxes" roles={["business_admin"]}><Taxes /></PR>} />
            <Route path="/reports" element={<PR path="/reports" roles={["business_admin", "outlet_manager"]}><Reports /></PR>} />
            <Route path="/health-score" element={<PR path="/health-score" roles={["business_admin", "outlet_manager"]}><HealthScore /></PR>} />
            <Route path="/audit" element={<PR path="/audit" roles={["business_admin"]}><AuditLogs /></PR>} />
            <Route path="/settings" element={<PR path="/settings" roles={["business_admin"]}><Settings /></PR>} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
