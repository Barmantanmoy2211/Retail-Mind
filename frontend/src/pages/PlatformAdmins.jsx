import React, { useEffect, useState } from "react";
import api, { formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, ShieldCheck, Trash2, Power, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function PlatformAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  const load = async () => {
    const { data } = await api.get("/platform/admins");
    setAdmins(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Name, email and password are required");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (form.phone) payload.phone = form.phone;
      await api.post("/platform/admins", payload);
      toast.success("Platform admin created");
      setShowDialog(false);
      setForm({ name: "", email: "", phone: "", password: "" });
      load();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to create admin");
    }
  };

  const toggle = async (a) => {
    try {
      await api.put(`/platform/admins/${a.id}/toggle`);
      toast.success(a.active ? "Admin disabled" : "Admin enabled");
      load();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed");
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Remove platform admin ${a.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/platform/admins/${a.id}`);
      toast.success("Admin removed");
      load();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed");
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Platform Admins"
        description={`${admins.length} admin${admins.length !== 1 ? "s" : ""} with full platform access.`}
        actions={<Button onClick={() => setShowDialog(true)} data-testid="pa-new"><Plus size={14} className="mr-1.5" />Add Admin</Button>}
      />

      <div className="card-modern p-4 bg-warning/5 border-warning/30">
        <div className="flex items-start gap-3 text-sm">
          <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold">Platform admins have unrestricted access</span> to every business,
            approval queue, and revenue data on RetailFlow. Only invite people you fully trust.
          </div>
        </div>
      </div>

      {admins.length === 0 ? <EmptyState title="No platform admins" /> : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Admin</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Email</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Created</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === user?.id;
                return (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/20" data-testid={`pa-row-${a.id}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                          <ShieldCheck size={14} />
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {a.name}
                            {isSelf && <Badge variant="primary">You</Badge>}
                          </div>
                          {a.phone && <div className="text-xs text-muted-foreground">{a.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{a.email}</td>
                    <td className="p-4"><Badge variant={a.active ? "success" : "destructive"}>{a.active ? "Active" : "Disabled"}</Badge></td>
                    <td className="p-4 text-xs text-muted-foreground">{formatDate(a.created_at)}</td>
                    <td className="p-4 text-right">
                      {!isSelf && (
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => toggle(a)} data-testid={`pa-toggle-${a.id}`} title={a.active ? "Disable" : "Enable"}>
                            <Power size={14} className={a.active ? "" : "text-success"} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(a)} data-testid={`pa-del-${a.id}`}>
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        </div>
                      )}
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
          <DialogHeader><DialogTitle>Invite Platform Admin</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="pa-form-name" placeholder="Full name" /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="pa-form-email" placeholder="admin@yourdomain.com" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" /></div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="pa-form-password" minLength={6} />
              <p className="text-xs text-muted-foreground mt-1">Min 6 characters. Share securely — they should change it on first login.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="pa-form-save">Create Admin</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
