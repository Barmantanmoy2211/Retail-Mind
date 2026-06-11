import React, { useEffect, useState } from "react";
import api from "@/lib/api";
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
import { Plus, Store, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Outlets() {
  const { business, refresh } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [users, setUsers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", manager_id: "" });

  const load = async () => {
    const [o, u] = await Promise.all([api.get("/outlets"), api.get("/users")]);
    setOutlets(o.data);
    setUsers(u.data.filter(x => x.role === "outlet_manager"));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...form, manager_id: form.manager_id || null };
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

  const remove = async (o) => {
    if (!window.confirm(`Delete ${o.name}?`)) return;
    await api.delete(`/outlets/${o.id}`);
    toast.success("Deleted");
    load();
  };

  const limit = business?.outlet_limit || 1;
  const canAdd = outlets.length < limit;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Outlets"
        description={`${outlets.length} of ${limit} outlets used on ${business?.plan} plan.`}
        actions={
          <Button disabled={!canAdd} onClick={() => { setEditing(null); setForm({ name: "", address: "", phone: "", manager_id: "" }); setShowDialog(true); }} data-testid="outlet-new">
            <Plus size={14} className="mr-1.5" />Add Outlet
          </Button>
        }
      />

      {!canAdd && (
        <div className="card-modern p-4 bg-warning/5 border-warning/30 text-sm">
          You've reached your outlet limit ({limit}). Contact the platform admin to upgrade.
        </div>
      )}

      {outlets.length === 0 ? (
        <EmptyState title="No outlets yet" description="Create your first outlet to start billing." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {outlets.map(o => (
            <div key={o.id} className="card-modern p-6" data-testid={`outlet-card-${o.id}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Store size={18} />
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(o); setForm({ name: o.name, address: o.address, phone: o.phone, manager_id: o.manager_id || "" }); setShowDialog(true); }}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(o)} data-testid={`del-outlet-${o.id}`}><Trash2 size={14} className="text-destructive" /></Button>
                </div>
              </div>
              <div className="font-display font-semibold text-lg">{o.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{o.address}</div>
              <div className="text-xs text-muted-foreground mt-1">{o.phone}</div>
              <div className="mt-3 pt-3 border-t border-border">
                <Badge variant={o.active ? "success" : "destructive"}>{o.active ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Outlet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="outlet-name" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="outlet-addr" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div>
              <Label>Manager</Label>
              <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose manager" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
