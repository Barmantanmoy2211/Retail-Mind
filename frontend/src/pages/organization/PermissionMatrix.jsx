import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader } from "@/components/SharedUI";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function PermissionMatrix() {
  const [catalog, setCatalog] = useState({});
  const [matrix, setMatrix] = useState([]);

  const load = async () => {
    const { data } = await api.get("/org/permission-matrix");
    setCatalog(data.catalog || {});
    setMatrix(data.matrix || []);
  };

  useEffect(() => { load(); }, []);

  const allPerms = Object.values(catalog).flat();

  const toggle = async (roleId, permKey, current) => {
    const role = matrix.find((m) => m.role_id === roleId);
    if (!role) return;
    const next = current
      ? role.permissions.filter((p) => p !== permKey)
      : [...role.permissions, permKey];
    try {
      await api.put(`/org/permission-matrix/${roleId}`, { permissions: next });
      setMatrix((m) => m.map((r) => (r.role_id === roleId ? { ...r, permissions: next } : r)));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Permission matrix" description="Roles × permissions grid" />
      <div className="card-modern overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left p-3 sticky left-0 bg-secondary/30">Permission</th>
              {matrix.map((r) => (
                <th key={r.role_id} className="p-3 text-center font-medium min-w-[100px]">{r.role_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPerms.map((p) => (
              <tr key={p.key} className="border-b border-border/50">
                <td className="p-3 sticky left-0 bg-card text-muted-foreground">{p.label}</td>
                {matrix.map((r) => {
                  const checked = r.permissions?.includes(p.key);
                  return (
                    <td key={r.role_id} className="p-3 text-center">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(r.role_id, p.key, checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
