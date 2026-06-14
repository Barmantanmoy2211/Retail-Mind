import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { PERMISSION_GROUPS } from "@/lib/permissions";

export default function RoleForm({ role, roles, outlets, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    parent_role_id: "",
    scope: "outlet",
    outlet_ids: [],
    permissions: [],
    can_create_employees: false,
    is_active: true,
  });

  useEffect(() => {
    if (role) {
      setForm({
        name: role.name || "",
        description: role.description || "",
        parent_role_id: role.parent_role_id || "",
        scope: role.scope || "outlet",
        outlet_ids: role.outlet_ids || [],
        permissions: role.permissions || [],
        can_create_employees: role.can_create_employees || false,
        is_active: role.is_active !== false,
      });
    }
  }, [role]);

  const togglePerm = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const toggleOutlet = (id) => {
    setForm((f) => ({
      ...f,
      outlet_ids: f.outlet_ids.includes(id)
        ? f.outlet_ids.filter((o) => o !== id)
        : [...f.outlet_ids, id],
    }));
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Role name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Parent role</Label>
          <Select value={form.parent_role_id || "none"} onValueChange={(v) => setForm({ ...form, parent_role_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (top level)</SelectItem>
              {roles.filter((r) => r.id !== role?.id).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Scope</Label>
          <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="outlet">Single outlet</SelectItem>
              <SelectItem value="multi_outlet">Multiple outlets</SelectItem>
              <SelectItem value="all_outlets">All outlets</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Checkbox
            id="can_hire"
            checked={form.can_create_employees}
            onCheckedChange={(c) => setForm({ ...form, can_create_employees: !!c })}
          />
          <Label htmlFor="can_hire">Can submit hiring requests</Label>
        </div>
      </div>
      {form.scope === "multi_outlet" && (
        <div>
          <Label>Assigned outlets</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {outlets.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5">
                <Checkbox checked={form.outlet_ids.includes(o.id)} onCheckedChange={() => toggleOutlet(o.id)} />
                {o.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <Label className="mb-2 block">Permissions</Label>
        {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
          <div key={group} className="mb-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
            <div className="grid grid-cols-2 gap-2">
              {perms.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.permissions.includes(p.key)} onCheckedChange={() => togglePerm(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save role</Button>
      </div>
    </div>
  );
}
