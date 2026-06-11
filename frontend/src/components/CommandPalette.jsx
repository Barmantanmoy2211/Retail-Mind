import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandShortcut, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Receipt, Boxes, Truck,
  FileText, Wallet, Award, Tag, Store, TrendingUp, ScrollText, Settings,
  Sparkles, Moon, Sun, LogOut, Building2, ShieldCheck,
} from "lucide-react";

const PLATFORM_ITEMS = [
  { label: "Platform Overview", to: "/platform", icon: LayoutDashboard },
  { label: "Businesses", to: "/platform/businesses", icon: Building2 },
  { label: "Approvals", to: "/platform/approvals", icon: ShieldCheck },
];

const BUSINESS_ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { label: "New Bill (POS)", to: "/pos", icon: ShoppingCart, shortcut: "G B" },
  { label: "Products", to: "/products", icon: Package, shortcut: "G P" },
  { label: "Inventory", to: "/inventory", icon: Boxes },
  { label: "Customers", to: "/customers", icon: Users, shortcut: "G C" },
  { label: "Bills", to: "/bills", icon: Receipt },
  { label: "Suppliers", to: "/suppliers", icon: Truck },
  { label: "Purchase Orders", to: "/purchase-orders", icon: FileText },
  { label: "Expenses", to: "/expenses", icon: Wallet },
  { label: "Loyalty Rewards", to: "/rewards", icon: Award },
  { label: "Tax Setup", to: "/taxes", icon: Tag },
  { label: "Outlets", to: "/outlets", icon: Store },
  { label: "Staff & Roles", to: "/staff", icon: Users },
  { label: "Reports", to: "/reports", icon: TrendingUp, shortcut: "G R" },
  { label: "Health Score", to: "/health-score", icon: Sparkles },
  { label: "Audit Logs", to: "/audit", icon: ScrollText },
  { label: "Settings", to: "/settings", icon: Settings },
];

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const items = useMemo(() => {
    if (user?.role === "platform_admin") return PLATFORM_ITEMS;
    if (user?.role === "cashier") return BUSINESS_ITEMS.filter((i) => ["/pos", "/customers", "/bills"].includes(i.to));
    if (user?.role === "outlet_manager") return BUSINESS_ITEMS.filter((i) => !["/outlets", "/staff", "/rewards", "/taxes", "/audit", "/settings"].includes(i.to));
    return BUSINESS_ITEMS;
  }, [user]);

  const go = (to) => {
    onOpenChange(false);
    navigate(to);
  };

  // Make as Dialog-style (use cmdk's Command which is fine inside Dialog from shadcn)
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl z-50 px-4">
        <div className="card-modern overflow-hidden shadow-2xl" data-testid="cmd-palette">
          <Command className="rounded-lg">
            <CommandInput placeholder="Type a command or search..." data-testid="cmd-input" />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Navigate">
                {items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <CommandItem
                      key={it.to}
                      onSelect={() => go(it.to)}
                      data-testid={`cmd-nav-${it.to.replace(/\//g, "-")}`}
                    >
                      <Icon size={14} className="mr-2" />
                      {it.label}
                      {it.shortcut && <CommandShortcut>{it.shortcut}</CommandShortcut>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => { toggle(); onOpenChange(false); }} data-testid="cmd-theme">
                  {theme === "dark" ? <Sun size={14} className="mr-2" /> : <Moon size={14} className="mr-2" />}
                  Toggle theme ({theme === "dark" ? "Light" : "Dark"})
                </CommandItem>
                <CommandItem onSelect={() => { onOpenChange(false); logout(); }} data-testid="cmd-logout">
                  <LogOut size={14} className="mr-2" />
                  Log out
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>
    </>
  );
}
