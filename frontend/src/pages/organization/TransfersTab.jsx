import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/hooks/usePermission";

export default function TransfersTab() {
  const canTransfer = usePermission("employees.transfer");
  const [employees, setEmployees] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    user_id: "", to_outlet_ids: [], to_role_id: "", reason: "", temporary_until: "",
  });

  const load = async () => {
    const [e, o, r, t] = await Promise.all([
      api.get("/org/employees"),
      api.get("/outlets"),
      api.get("/org/roles"),
      api.get("/org/transfer-requests"),
    ]);
    setEmployees(e.data);
    setOutlets(o.data);
    setRoles(r.data);
    setTransfers(t.data);
  };

  useEffect(() => { load(); }, []);

  const toggleOutlet = (id) => {
    setForm((f) => ({
      ...f,
      to_outlet_ids: f.to_outlet_ids.includes(id)
        ? f.to_outlet_ids.filter((x) => x !== id)
        : [...f.to_outlet_ids, id],
    }));
  };

  const submit = async () => {
    try {
      await api.post("/org/transfer-requests", {
        ...form,
        to_role_id: form.to_role_id || null,
        temporary_until: form.temporary_until || null,
      });
      toast.success("Transfer request submitted");
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="Move employees between outlets or roles"
        actions={canTransfer && (
          <Button onClick={() => setShowDialog(true)}><Plus size={14} className="mr-1" />Request transfer</Button>
        )}
      />
      {transfers.length === 0 ? (
        <EmptyState title="No transfer requests" />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Employee</th>
                <th className="text-left p-4">Target outlets</th>
                <th className="text-left p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const emp = employees.find((e) => e.id === t.user_id);
                return (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="p-4">{emp?.name || t.user_id}</td>
                    <td className="p-4 text-muted-foreground">
                      {t.to_outlet_ids?.map((id) => outlets.find((o) => o.id === id)?.name).filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="p-4"><Badge variant={t.status === "approved" ? "success" : t.status === "rejected" ? "destructive" : "warning"}>{t.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request transfer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target outlets</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {outlets.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1">
                    <Checkbox checked={form.to_outlet_ids.includes(o.id)} onCheckedChange={() => toggleOutlet(o.id)} />
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>New role (optional)</Label>
              <Select value={form.to_role_id || "none"} onValueChange={(v) => setForm({ ...form, to_role_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keep current role</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Temporary until (optional)</Label>
              <Input type="date" value={form.temporary_until} onChange={(e) => setForm({ ...form, temporary_until: e.target.value })} />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
