import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Store, Package, Users, ShoppingCart, FileText,
  TrendingUp, Settings, LogOut, Moon, Sun, ChevronLeft, ChevronRight,
  Truck, Receipt, Award, Wallet, Building2, ScrollText, Boxes, Tag,
  ShieldCheck, Bell, Menu, X, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const platformNav = [
  { to: "/platform", label: "Overview", icon: LayoutDashboard },
  { to: "/platform/businesses", label: "Businesses", icon: Building2 },
  { to: "/platform/approvals", label: "Approvals", icon: ShieldCheck },
];

const businessNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS Billing", icon: ShoppingCart, highlight: true },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/bills", label: "Bills & Invoices", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/purchase-orders", label: "Purchase Orders", icon: FileText },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/rewards", label: "Loyalty Rewards", icon: Award },
  { to: "/taxes", label: "Tax Setup", icon: Tag },
  { to: "/outlets", label: "Outlets", icon: Store },
  { to: "/staff", label: "Staff & Roles", icon: Users },
  { to: "/reports", label: "Reports", icon: TrendingUp },
  { to: "/audit", label: "Audit Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

const outletNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS Billing", icon: ShoppingCart, highlight: true },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/reports", label: "Reports", icon: TrendingUp },
];

const cashierNav = [
  { to: "/pos", label: "POS Billing", icon: ShoppingCart, highlight: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/bills", label: "My Bills", icon: Receipt },
];

export default function AppLayout({ children }) {
  const { user, business, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav =
    user?.role === "platform_admin" ? platformNav :
    user?.role === "business_admin" ? businessNav :
    user?.role === "outlet_manager" ? outletNav : cashierNav;

  const initials = (user?.name || "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const Sidebar = (
    <aside
      data-testid="app-sidebar"
      className={cn(
        "flex-shrink-0 border-r border-border bg-card flex flex-col transition-all duration-300",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div className={cn("h-16 flex items-center border-b border-border", collapsed ? "justify-center" : "px-6")}>
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-display font-bold">
            R
          </div>
          {!collapsed && (
            <div className="font-display font-bold text-lg">
              RetailFlow<span className="text-primary">.</span>
            </div>
          )}
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {nav.map((item) => {
          const active = location.pathname === item.to ||
            (item.to !== "/dashboard" && item.to !== "/platform" && location.pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                item.highlight && !active && "text-primary",
                collapsed && "justify-center px-0",
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-collapse-btn"
          className="hidden md:flex items-center justify-center w-full p-2 rounded-lg hover:bg-secondary text-muted-foreground"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">{Sidebar}</div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 z-50 md:hidden">{Sidebar}</div>
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card/70 backdrop-blur-md flex items-center justify-between px-4 md:px-6 z-10">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 hover:bg-secondary rounded-lg"
              onClick={() => setMobileOpen(true)}
              data-testid="mobile-menu-btn"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <div className="font-display font-semibold">
                {business?.business_name || (user?.role === "platform_admin" ? "Platform Console" : "RetailFlow AI")}
              </div>
              <div className="text-xs text-muted-foreground capitalize">
                {user?.role?.replace("_", " ")}
                {business?.subscription_status && business.subscription_status !== "approved" && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-warning/10 text-warning border border-warning/20">
                    {business.subscription_status}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              data-testid="theme-toggle"
              className="p-2 hover:bg-secondary rounded-lg text-muted-foreground"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu" className="flex items-center gap-2 hover:bg-secondary px-2 py-1.5 rounded-lg">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {initials}
                  </div>
                  <div className="hidden md:block text-sm text-left">
                    <div className="font-medium leading-tight">{user?.name}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user?.role !== "platform_admin" && (
                  <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
                    <Settings size={14} className="mr-2" /> Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                  <LogOut size={14} className="mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
