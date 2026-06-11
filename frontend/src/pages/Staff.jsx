import React, { useEffect, useState } from "react";
import api from "@/lib/api";
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
import { Plus, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Staff() {
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "cashier", outlet_id: "" });

  const load = async () => {
    const [u, o] = await Promise.all([api.get("/users"), api.get("/outlets")]);
    setUsers(u.data);
    setOutlets(o.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/users", { ...form, outlet_id: form.outlet_id || null });
      toast.success("Staff member added");
      setShowDialog(false);
      setForm({ name: "", email: "", phone: "", password: "", role: "cashier", outlet_id: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.name}?`)) return;
    await api.delete(`/users/${u.id}`);
    load();
  };

  const roleBadge = { business_admin: "primary", outlet_manager: "success", cashier: "outline" };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Staff & Roles"
        description={`${users.length} team members.`}
        actions={<Button onClick={() => setShowDialog(true)} data-testid="staff-new"><Plus size={14} className="mr-1.5" />Add Staff</Button>}
      />

      {users.length === 0 ? (
        <EmptyState title="No staff added" />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Name</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Email</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Role</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Outlet</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const outlet = outlets.find(o => o.id === u.outlet_id);
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="p-4 font-medium">{u.name}</td>
                    <td className="p-4 text-muted-foreground">{u.email}</td>
                    <td className="p-4"><Badge variant={roleBadge[u.role]}>{u.role.replace("_", " ")}</Badge></td>
                    <td className="p-4 text-muted-foreground">{outlet?.name || "—"}</td>
                    <td className="p-4"><Badge variant={u.active ? "success" : "destructive"}>{u.active ? "Active" : "Disabled"}</Badge></td>
                    <td className="p-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(u)} data-testid={`del-user-${u.id}`}><Trash2 size={14} className="text-destructive" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New staff member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="staff-name" /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="staff-email" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Password *</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="staff-pwd" /></div>
            <div>
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outlet_manager">Outlet Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role !== "business_admin" && (
              <div>
                <Label>Assigned Outlet</Label>
                <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="staff-save">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
