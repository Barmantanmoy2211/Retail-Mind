import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Plus, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = {
  staff: ["salary", "bonus", "incentive"],
  operations: ["electricity", "water", "internet", "rent"],
  inventory: ["stock_purchase", "raw_materials"],
  marketing: ["ads", "promotions"],
  misc: ["repairs", "maintenance"],
};

export default function Expenses() {
  const { user, business, canAny } = useAuth();
  const currency = business?.currency || "INR";
  const [items, setItems] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    category: "operations",
    subcategory: "rent",
    amount: "",
    description: "",
    outlet_id: "",
    employee_id: "",
  });

  const isOwner = user?.role === "business_admin";
  const isScopedUser = !isOwner && (user?.role === "outlet_manager" || user?.role === "cashier" || canAny("expenses.create"));
  const canApprove = isOwner || canAny("expenses.approve", "approvals.act");

  const load = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (outletFilter !== "all") params.set("outlet_id", outletFilter);
    const qs = params.toString() ? `?${params}` : "";

    const [e, o, emp] = await Promise.all([
      api.get(`/expenses${qs}`),
      api.get("/outlets"),
      api.get("/org/employees").catch(() => ({ data: [] })),
    ]);
    setItems(e.data);
    setOutlets(o.data);
    setEmployees(emp.data || []);
    if (isScopedUser && user?.outlet_id) {
      setForm((prev) => ({ ...prev, outlet_id: user.outlet_id }));
    }
  };

  useEffect(() => { load(); }, [statusFilter, categoryFilter, outletFilter]);

  const save = async () => {
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        employee_id: form.category === "staff" && form.employee_id ? form.employee_id : null,
      };
      await api.post("/expenses", payload);
      toast.success(isScopedUser && !isOwner ? "Expense submitted for approval" : "Expense added");
      setShowDialog(false);
      setForm({
        category: "operations",
        subcategory: "rent",
        amount: "",
        description: "",
        outlet_id: isScopedUser ? user?.outlet_id : "",
        employee_id: "",
      });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const act = async (id, action) => {
    try {
      await api.put(`/expenses/${id}/action`, { action });
      toast.success(`${action}d`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const statusColor = { pending: "warning", approved: "success", rejected: "destructive" };
  const approvedTotal = items.filter((i) => i.status === "approved").reduce((a, b) => a + (b.amount || 0), 0);
  const salaryTotal = items.filter((i) => i.is_recurring || i.source === "salary_sync").reduce((a, b) => a + (b.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Expenses"
        description={
          isScopedUser && !isOwner
            ? "Expenses for your outlet — salary entries sync from Organization."
            : `${formatCurrency(approvedTotal, currency)} approved · ${formatCurrency(salaryTotal, currency)} staff salaries`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw size={14} className="mr-1" />Refresh
            </Button>
            <Button onClick={() => setShowDialog(true)} data-testid="exp-new">
              <Plus size={14} className="mr-1.5" />Add Expense
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-10" data-testid="exp-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-10">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.keys(CATEGORIES).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isOwner && outlets.length > 1 && (
          <Select value={outletFilter} onValueChange={setOutletFilter}>
            <SelectTrigger className="w-48 h-10">
              <SelectValue placeholder="Outlet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outlets</SelectItem>
              {outlets.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No expenses"
          description="Staff salaries with a base salary set in Organization → Employees appear here automatically each month."
        />
      ) : (
        <div className="card-modern overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Category</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Description</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Employee</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Outlet</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Amount</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">When</th>
                {canApprove && <th className="p-4" />}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="p-4 capitalize">
                    <Badge variant="outline">{e.category}</Badge>
                    <span className="text-xs text-muted-foreground ml-1">{e.subcategory}</span>
                    {(e.is_recurring || e.source === "salary_sync") && (
                      <Badge variant="primary" className="ml-2 text-[10px]">Recurring</Badge>
                    )}
                  </td>
                  <td className="p-4">{e.description}</td>
                  <td className="p-4 text-muted-foreground">{e.employee_name || "—"}</td>
                  <td className="p-4 text-muted-foreground">{e.outlet_name || "—"}</td>
                  <td className="p-4 text-right font-mono">{formatCurrency(e.amount, currency)}</td>
                  <td className="p-4"><Badge variant={statusColor[e.status]}>{e.status}</Badge></td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {e.salary_month ? `${e.salary_month} (monthly)` : formatDate(e.created_at)}
                  </td>
                  {canApprove && (
                    <td className="p-4 text-right">
                      {e.status === "pending" && e.source !== "salary_sync" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => act(e.id, "approve")} data-testid={`exp-approve-${e.id}`}>
                            <Check size={12} />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => act(e.id, "reject")} data-testid={`exp-reject-${e.id}`}>
                            <X size={12} />
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({
                    ...form,
                    category: v,
                    subcategory: CATEGORIES[v][0],
                    employee_id: v === "staff" ? form.employee_id : "",
                  })}
                >
                  <SelectTrigger data-testid="exp-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(CATEGORIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory</Label>
                <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES[form.category]?.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.category === "staff" && (
              <div>
                <Label>Employee (optional)</Label>
                <Select value={form.employee_id || "none"} onValueChange={(v) => setForm({ ...form, employee_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Link to employee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employees.filter((emp) => emp.role !== "business_admin").map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Outlet</Label>
              {isScopedUser && !isOwner ? (
                <Input value={outlets.find((o) => o.id === form.outlet_id)?.name || "Your outlet"} disabled />
              ) : (
                <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                  <SelectTrigger data-testid="exp-outlet"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(ev) => setForm({ ...form, amount: ev.target.value })} data-testid="exp-amt" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} data-testid="exp-desc" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="exp-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
