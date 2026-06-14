import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

const TRIGGERS = [
  { value: "hiring", label: "Employee hiring" },
  { value: "role_create", label: "Role creation" },
  { value: "expense", label: "Expense approval" },
  { value: "transfer", label: "Employee transfer" },
];

export default function WorkflowDesigner() {
  const [workflows, setWorkflows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [w, r] = await Promise.all([api.get("/org/workflows"), api.get("/org/roles")]);
    setWorkflows(w.data);
    setRoles(r.data);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (wf) => {
    setEditing({
      ...wf,
      approval_levels: wf.approval_levels?.length ? [...wf.approval_levels] : [{ type: "system_role", system_role: "business_admin" }],
    });
  };

  const addLevel = () => {
    setEditing((e) => ({
      ...e,
      approval_levels: [...(e.approval_levels || []), { type: "role", role_id: roles[0]?.id || "" }],
    }));
  };

  const updateLevel = (idx, field, value) => {
    setEditing((e) => {
      const levels = [...e.approval_levels];
      levels[idx] = { ...levels[idx], [field]: value };
      if (field === "type" && value === "system_role") {
        levels[idx] = { type: "system_role", system_role: "business_admin" };
      }
      return { ...e, approval_levels: levels };
    });
  };

  const removeLevel = (idx) => {
    setEditing((e) => ({
      ...e,
      approval_levels: e.approval_levels.filter((_, i) => i !== idx),
    }));
  };

  const save = async () => {
    try {
      await api.put(`/org/workflows/${editing.id}`, {
        name: editing.name,
        approval_levels: editing.approval_levels,
        is_active: editing.is_active !== false,
      });
      toast.success("Workflow saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Workflow designer" description="Configure multi-step approval chains" />
      {workflows.length === 0 ? (
        <EmptyState title="No workflows" description="Import a role template to seed default workflows." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <div key={wf.id} className="card-modern p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold">{wf.name}</div>
                  <Badge variant="outline" className="mt-1">{wf.trigger_type}</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => startEdit(wf)}>Edit</Button>
              </div>
              <ol className="text-sm text-muted-foreground space-y-1">
                {(wf.approval_levels || []).map((lv, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-secondary text-xs flex items-center justify-center">{i + 1}</span>
                    {lv.type === "system_role" ? "Business Owner" : roles.find((r) => r.id === lv.role_id)?.name || "Role"}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="card-modern p-6 border-2 border-primary/20">
          <h3 className="font-semibold mb-4">Edit: {editing.name}</h3>
          <div className="mb-4">
            <Label>Name</Label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <Label className="mb-2 block">Approval steps (in order)</Label>
          <div className="space-y-2 mb-4">
            {editing.approval_levels?.map((lv, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
                <GripVertical size={14} className="text-muted-foreground" />
                <span className="text-xs w-6">{i + 1}.</span>
                <Select value={lv.type} onValueChange={(v) => updateLevel(i, "type", v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="system_role">Business Owner</SelectItem>
                  </SelectContent>
                </Select>
                {lv.type === "role" && (
                  <Select value={lv.role_id || ""} onValueChange={(v) => updateLevel(i, "role_id", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" size="sm" onClick={() => removeLevel(i)}><Trash2 size={14} /></Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addLevel}><Plus size={14} className="mr-1" />Add step</Button>
            <Button onClick={save}>Save workflow</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
