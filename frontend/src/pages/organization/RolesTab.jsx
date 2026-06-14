import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import RoleForm from "./RoleForm";
import { usePermission } from "@/hooks/usePermission";

export default function RolesTab() {
  const canCreate = usePermission("roles.create");
  const canEdit = usePermission("roles.edit");
  const [roles, setRoles] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const [r, o, t] = await Promise.all([
      api.get("/org/roles"),
      api.get("/outlets"),
      api.get("/org/templates").catch(() => ({ data: [] })),
    ]);
    setRoles(r.data);
    setOutlets(o.data);
    setTemplates(t.data || []);
  };

  useEffect(() => { load(); }, []);

  const save = async (form) => {
    try {
      const payload = { ...form, parent_role_id: form.parent_role_id || null };
      if (editing) {
        await api.put(`/org/roles/${editing.id}`, payload);
        toast.success("Role updated");
      } else {
        await api.post("/org/roles", payload);
        toast.success("Role created");
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.delete(`/org/roles/${role.id}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const importTemplate = async (key) => {
    try {
      await api.post(`/org/templates/${key}/import`);
      toast.success("Template imported");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description={`${roles.length} custom roles`}
        actions={
          canCreate && (
            <div className="flex gap-2">
              {templates.map((t) => (
                <Button key={t.key} variant="outline" size="sm" onClick={() => importTemplate(t.key)}>
                  <Download size={14} className="mr-1" />{t.name}
                </Button>
              ))}
              <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                <Plus size={14} className="mr-1" />New role
              </Button>
            </div>
          )
        }
      />
      {roles.length === 0 ? (
        <EmptyState title="No roles yet" description="Import a template or create a custom role." />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Scope</th>
                <th className="text-left p-4">Permissions</th>
                <th className="text-left p-4">Can hire</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                  <td className="p-4 font-medium">{r.name}</td>
                  <td className="p-4"><Badge variant="outline">{r.scope?.replace("_", " ")}</Badge></td>
                  <td className="p-4 text-muted-foreground">{r.permissions?.length || 0}</td>
                  <td className="p-4">{r.can_create_employees ? "Yes" : "—"}</td>
                  <td className="p-4 text-right">
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setShowForm(true); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit role" : "Create role"}</DialogTitle>
          </DialogHeader>
          <RoleForm
            role={editing}
            roles={roles}
            outlets={outlets}
            onSave={save}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
