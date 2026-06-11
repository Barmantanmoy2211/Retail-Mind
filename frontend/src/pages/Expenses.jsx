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
import { Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = {
  staff: ["salary", "bonus", "incentive"],
  operations: ["electricity", "water", "internet", "rent"],
  inventory: ["stock_purchase", "raw_materials"],
  marketing: ["ads", "promotions"],
  misc: ["repairs", "maintenance"],
};

export default function Expenses() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const [items, setItems] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ category: "operations", subcategory: "rent", amount: "", description: "", outlet_id: "" });

  const isOutletManager = user?.role === "outlet_manager";

  const load = async () => {
    const f = filter === "all" ? "" : `?status=${filter}`;
    const [e, o] = await Promise.all([api.get(`/expenses${f}`), api.get("/outlets")]);
    setItems(e.data);
    setOutlets(o.data);
    if (isOutletManager && user?.outlet_id) {
      setForm((prev) => ({ ...prev, outlet_id: user.outlet_id }));
    }
  };
  useEffect(() => { load(); }, [filter]);

  const save = async () => {
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount) });
      toast.success(isOutletManager ? "Expense submitted for approval" : "Expense added");
      setShowDialog(false);
      setForm({
        category: "operations", subcategory: "rent", amount: "", description: "",
        outlet_id: isOutletManager ? user?.outlet_id : "",
      });
      load();
    } catch (e) {
      toast.error("Failed");
    }
  };

  const act = async (id, action) => {
    await api.put(`/expenses/${id}/action`, { action });
    toast.success(`${action}d`);
    load();
  };

  const statusColor = { pending: "warning", approved: "success", rejected: "destructive" };
  const total = items.filter(i => i.status === "approved").reduce((a, b) => a + (b.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Expenses"
        description={
          isOutletManager
            ? "Expenses for your outlet — pending items need business owner approval."
            : `${formatCurrency(total, currency)} approved expenses`
        }
        actions={<Button onClick={() => setShowDialog(true)} data-testid="exp-new"><Plus size={14} className="mr-1.5" />Add Expense</Button>}
      />

      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="md:w-48 h-10" data-testid="exp-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      {items.length === 0 ? <EmptyState title="No expenses" /> : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Category</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Description</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Outlet</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Amount</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">When</th>
                {user?.role === "business_admin" && <th className="p-4"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(e => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="p-4 capitalize"><Badge variant="outline">{e.category}</Badge> <span className="text-xs text-muted-foreground ml-1">{e.subcategory}</span></td>
                  <td className="p-4">{e.description}</td>
                  <td className="p-4 text-muted-foreground">{e.outlet_name || "—"}</td>
                  <td className="p-4 text-right font-mono">{formatCurrency(e.amount, currency)}</td>
                  <td className="p-4"><Badge variant={statusColor[e.status]}>{e.status}</Badge></td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(e.created_at)}</td>
                  {user?.role === "business_admin" && (
                    <td className="p-4 text-right">
                      {e.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => act(e.id, "approve")} data-testid={`exp-approve-${e.id}`}><Check size={12} /></Button>
                          <Button size="sm" variant="outline" onClick={() => act(e.id, "reject")} data-testid={`exp-reject-${e.id}`}><X size={12} /></Button>
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
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: CATEGORIES[v][0] })}>
                  <SelectTrigger data-testid="exp-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(CATEGORIES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory</Label>
                <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES[form.category]?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Outlet</Label>
              {isOutletManager ? (
                <Input value={outlets.find((o) => o.id === form.outlet_id)?.name || "Your outlet"} disabled />
              ) : (
                <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                  <SelectTrigger data-testid="exp-outlet"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="exp-amt" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="exp-desc" /></div>
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
