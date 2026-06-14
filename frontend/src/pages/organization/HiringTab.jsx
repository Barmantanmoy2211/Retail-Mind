import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/hooks/usePermission";

export default function HiringTab() {
  const canCreate = usePermission("employees.create");
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    requested_role_id: "",
    outlet_id: "",
    reason: "",
    candidate: { name: "", email: "", phone: "", password: "" },
  });

  const load = async () => {
    const [h, r, o] = await Promise.all([
      api.get("/org/hiring-requests"),
      api.get("/org/roles"),
      api.get("/outlets"),
    ]);
    setRequests(h.data);
    setRoles(r.data);
    setOutlets(o.data);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/org/hiring-requests", form);
      toast.success("Hiring request submitted");
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const statusVariant = { pending: "warning", approved: "success", rejected: "destructive" };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hiring requests"
        description="Submit and track employee hiring approvals"
        actions={canCreate && (
          <Button onClick={() => setShowDialog(true)}><Plus size={14} className="mr-1" />New request</Button>
        )}
      />
      {requests.length === 0 ? (
        <EmptyState title="No hiring requests" />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Candidate</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Level</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-4 font-medium">{r.candidate?.name}</td>
                  <td className="p-4 text-muted-foreground">{r.candidate?.email}</td>
                  <td className="p-4"><Badge variant={statusVariant[r.status] || "outline"}>{r.status}</Badge></td>
                  <td className="p-4 text-muted-foreground">Step { (r.current_level || 0) + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit hiring request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Candidate name</Label><Input value={form.candidate.name} onChange={(e) => setForm({ ...form, candidate: { ...form.candidate, name: e.target.value } })} /></div>
            <div><Label>Email</Label><Input value={form.candidate.email} onChange={(e) => setForm({ ...form, candidate: { ...form.candidate, email: e.target.value } })} /></div>
            <div><Label>Temporary password</Label><Input type="password" value={form.candidate.password} onChange={(e) => setForm({ ...form, candidate: { ...form.candidate, password: e.target.value } })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.requested_role_id} onValueChange={(v) => setForm({ ...form, requested_role_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outlet</Label>
              <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select outlet" /></SelectTrigger>
                <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
