import React, { useEffect, useState } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Plus, Store, Pencil, Trash2, Warehouse, Users, TrendingUp, TrendingDown, Package } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { name: "", address: "", phone: "", manager_id: "", is_warehouse: false };

export default function Outlets() {
  const { business, refresh } = useAuth();
  const currency = business?.currency || "INR";
  const [outlets, setOutlets] = useState([]);
  const [users, setUsers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  const load = async () => {
    const [o, u] = await Promise.all([
      api.get("/outlets?with_stats=true"),
      api.get("/users"),
    ]);
    setOutlets(o.data);
    setUsers(u.data.filter((x) => x.role === "outlet_manager"));
  };
  useEffect(() => { load(); }, []);

  const retailOutlets = outlets.filter((o) => !o.is_warehouse);
  const hasWarehouse = outlets.some((o) => o.is_warehouse);
  const limit = business?.outlet_limit || 1;
  const canAdd = retailOutlets.length < limit;

  const save = async () => {
    try {
      const payload = {
        ...form,
        manager_id: form.manager_id || null,
        is_warehouse: form.is_warehouse,
      };
      if (editing) await api.put(`/outlets/${editing.id}`, payload);
      else await api.post("/outlets", payload);
      toast.success("Saved");
      setShowDialog(false);
      load();
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const ensureWarehouse = async () => {
    setSavingWarehouse(true);
    try {
      await api.post("/outlets/ensure-warehouse");
      toast.success("Central warehouse created");
      load();
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setSavingWarehouse(false);
    }
  };

  const toggleActive = async (o) => {
    try {
      await api.put(`/outlets/${o.id}`, { active: !o.active });
      toast.success(o.active ? "Outlet deactivated" : "Outlet activated");
      load();
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (o) => {
    if (!window.confirm(`Delete ${o.name}? This cannot be undone.`)) return;
    await api.delete(`/outlets/${o.id}`);
    toast.success("Deleted");
    load();
  };

  const openNew = (asWarehouse = false) => {
    setEditing(null);
    setForm({ ...emptyForm, is_warehouse: asWarehouse, name: asWarehouse ? "Central Warehouse" : "" });
    setShowDialog(true);
  };

  const openEdit = (o) => {
    setEditing(o);
    setForm({
      name: o.name,
      address: o.address || "",
      phone: o.phone || "",
      manager_id: o.manager_id || "",
      is_warehouse: !!o.is_warehouse,
    });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Outlets"
        description={`${retailOutlets.length} of ${limit} retail outlets on ${business?.plan} plan${hasWarehouse ? " · warehouse enabled" : ""}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {!hasWarehouse && (
              <Button variant="outline" onClick={ensureWarehouse} disabled={savingWarehouse} data-testid="outlet-warehouse">
                <Warehouse size={14} className="mr-1.5" />Setup Warehouse
              </Button>
            )}
            <Button disabled={!canAdd} onClick={() => openNew(false)} data-testid="outlet-new">
              <Plus size={14} className="mr-1.5" />Add Outlet
            </Button>
          </div>
        }
      />

      {!canAdd && (
        <div className="card-modern p-4 bg-warning/5 border-warning/30 text-sm">
          You&apos;ve reached your retail outlet limit ({limit}). Warehouses don&apos;t count toward the limit. Contact the platform admin to upgrade.
        </div>
      )}

      {outlets.length === 0 ? (
        <EmptyState
          title="No outlets yet"
          description="Create a retail outlet or set up a central warehouse for bulk stock purchases."
          action={
            <div className="flex gap-2 justify-center mt-4">
              <Button onClick={() => openNew(false)}>Add Outlet</Button>
              <Button variant="outline" onClick={ensureWarehouse}>Setup Warehouse</Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {outlets.map((o) => (
            <div key={o.id} className="card-modern p-6" data-testid={`outlet-card-${o.id}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${o.is_warehouse ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
                  {o.is_warehouse ? <Warehouse size={18} /> : <Store size={18} />}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(o)} data-testid={`del-outlet-${o.id}`}><Trash2 size={14} className="text-destructive" /></Button>
                </div>
              </div>

              <div className="font-display font-semibold text-lg">{o.name}</div>
              {o.is_warehouse && (
                <div className="mt-1"><Badge variant="warning">Central Warehouse</Badge></div>
              )}
              <div className="text-sm text-muted-foreground mt-1">{o.address}</div>
              {o.phone && <div className="text-xs text-muted-foreground mt-1">{o.phone}</div>}

              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div className="rounded-lg bg-secondary/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Users size={12} /> Staff
                  </div>
                  <div className="font-semibold">{o.staff_count ?? 0}</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <TrendingUp size={12} /> Revenue (30d)
                  </div>
                  <div className="font-semibold font-mono text-xs">{formatCurrency(o.revenue_30d || 0, currency)}</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    {(o.profit_30d ?? 0) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    Profit / Loss (30d)
                  </div>
                  <div className={`font-semibold font-mono text-xs ${(o.profit_30d ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(o.profit_30d || 0, currency)}
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Package size={12} /> Stock value
                  </div>
                  <div className="font-semibold font-mono text-xs">{formatCurrency(o.stock_value || 0, currency)}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={o.active !== false ? "success" : "destructive"}>
                    {o.active !== false ? "Active" : "Inactive"}
                  </Badge>
                  {o.is_warehouse && (
                    <span className="text-[10px] text-muted-foreground">PO & inventory hub</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${o.id}`} className="text-xs text-muted-foreground">
                    {o.active !== false ? "On" : "Off"}
                  </Label>
                  <Switch
                    id={`active-${o.id}`}
                    checked={o.active !== false}
                    onCheckedChange={() => toggleActive(o)}
                    data-testid={`toggle-outlet-${o.id}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "New"} {form.is_warehouse ? "Warehouse" : "Outlet"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="outlet-name" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="outlet-addr" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            {!form.is_warehouse && (
              <div>
                <Label>Manager</Label>
                <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose manager" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!editing && !hasWarehouse && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Central warehouse</Label>
                  <p className="text-xs text-muted-foreground">Receive bulk stock from suppliers; not used for POS billing.</p>
                </div>
                <Switch
                  checked={form.is_warehouse}
                  onCheckedChange={(v) => setForm({ ...form, is_warehouse: v })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="outlet-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
