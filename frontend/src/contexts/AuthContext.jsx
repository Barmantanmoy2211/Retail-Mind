import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

const LEGACY_ROLE_PERMISSIONS = {
  outlet_manager: [
    "employees.create", "employees.view", "approvals.view", "approvals.act",
    "bills.create", "products.create", "products.edit", "inventory.manage",
    "customers.view", "expenses.create", "expenses.approve", "reports.view",
  ],
  cashier: ["bills.create", "customers.view", "expenses.create"],
  business_admin: ["*"],
  platform_admin: ["*"],
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [outlet, setOutlet] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [businessRole, setBusinessRole] = useState(null);
  const [reportsTo, setReportsTo] = useState(null);
  const [loading, setLoading] = useState(true);

  const resolvePermissions = (data) => {
    if (data.permissions?.length) return data.permissions;
    const role = data.user?.role;
    return LEGACY_ROLE_PERMISSIONS[role] || [];
  };

  const can = (perm) => {
    if (!permissions.length && user?.role) {
      const legacy = LEGACY_ROLE_PERMISSIONS[user.role] || [];
      if (legacy.includes("*") || legacy.includes(perm)) return true;
    }
    return permissions.includes("*") || permissions.includes(perm);
  };

  const canAny = (...perms) => perms.some((p) => can(p));

  const loadMe = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setBusiness(data.business);
      setOutlet(data.outlet);
      setPermissions(resolvePermissions(data));
      setBusinessRole(data.role || data.user?.business_role || null);
      setReportsTo(data.reports_to || data.user?.reports_to || null);
    } catch (e) {
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) loadMe();
    else setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.access_token);
    setUser(data.user);
    setBusiness(data.business);
    setOutlet(data.outlet || null);
    await loadMe();
    return data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setBusiness(null);
    setOutlet(null);
    setPermissions([]);
    setBusinessRole(null);
    setReportsTo(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{
      user, business, outlet, permissions, businessRole, reportsTo,
      loading, login, logout, refresh: loadMe, can, canAny,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
