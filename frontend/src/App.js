import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";

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
import Staff from "@/pages/Staff";
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

function ProtectedRoute({ children, roles }) {
  const { user, business, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "platform_admin" && business?.subscription_status === "pending") {
    return <Navigate to="/pending-approval" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function HomeRedirect() {
  const { user, business, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Landing />;
  if (user.role === "platform_admin") return <Navigate to="/platform" replace />;
  if (business?.subscription_status === "pending") return <Navigate to="/pending-approval" replace />;
  if (user.role === "cashier") return <Navigate to="/pos" replace />;
  return <Navigate to="/dashboard" replace />;
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

            {/* Platform Admin */}
            <Route path="/platform" element={<ProtectedRoute roles={["platform_admin"]}><PlatformDashboard /></ProtectedRoute>} />
            <Route path="/platform/businesses" element={<ProtectedRoute roles={["platform_admin"]}><PlatformBusinesses /></ProtectedRoute>} />
            <Route path="/platform/approvals" element={<ProtectedRoute roles={["platform_admin"]}><PlatformBusinesses /></ProtectedRoute>} />
            <Route path="/platform/admins" element={<ProtectedRoute roles={["platform_admin"]}><PlatformAdmins /></ProtectedRoute>} />

            {/* Business / Outlet / Cashier */}
            <Route path="/dashboard" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><BusinessDashboard /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute roles={["business_admin", "outlet_manager", "cashier"]}><POS /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute roles={["business_admin", "outlet_manager", "cashier"]}><Products /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute roles={["business_admin", "outlet_manager", "cashier"]}><Customers /></ProtectedRoute>} />
            <Route path="/bills" element={<ProtectedRoute roles={["business_admin", "outlet_manager", "cashier"]}><Bills /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><Inventory /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><Suppliers /></ProtectedRoute>} />
            <Route path="/purchase-orders" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><PurchaseOrders /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><Expenses /></ProtectedRoute>} />
            <Route path="/outlets" element={<ProtectedRoute roles={["business_admin"]}><Outlets /></ProtectedRoute>} />
            <Route path="/staff" element={<ProtectedRoute roles={["business_admin"]}><Staff /></ProtectedRoute>} />
            <Route path="/rewards" element={<ProtectedRoute roles={["business_admin"]}><Rewards /></ProtectedRoute>} />
            <Route path="/taxes" element={<ProtectedRoute roles={["business_admin"]}><Taxes /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><Reports /></ProtectedRoute>} />
            <Route path="/health-score" element={<ProtectedRoute roles={["business_admin", "outlet_manager"]}><HealthScore /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute roles={["business_admin"]}><AuditLogs /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={["business_admin"]}><Settings /></ProtectedRoute>} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
