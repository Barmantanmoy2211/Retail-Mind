import React, { useEffect, useState, useCallback } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role_id: "",
  outlet_ids: [],
  reports_to_user_id: "",
  date_of_joining: new Date().toISOString().slice(0, 10),
  base_salary: "",
};

export default function EmployeesTab() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const canCreate = user?.role === "business_admin";
  const canEdit = usePermission("employees.edit") || canCreate;
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [computedSalary, setComputedSalary] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);

  const load = async () => {
    const [e, r, o] = await Promise.all([
      api.get("/org/employees"),
      api.get("/org/roles"),
      api.get("/outlets"),
    ]);
    setEmployees(e.data.filter((x) => x.id !== user?.id && x.role !== "business_admin"));
    setRoles(r.data);
    setOutlets(o.data);
  };

  useEffect(() => { load(); }, []);

  const fetchSalary = useCallback(async (employeeId) => {
    if (!employeeId) {
      setComputedSalary(null);
      return;
    }
    setSalaryLoading(true);
    try {
      const { data } = await api.get(`/org/employees/${employeeId}/salary`);
      setComputedSalary(data);
    } catch {
      setComputedSalary(null);
    } finally {
      setSalaryLoading(false);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setComputedSalary(null);
    setShowDialog(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      phone: emp.phone || "",
      password: "",
      role_id: emp.role_id || "",
      outlet_ids: emp.outlet_ids?.length ? emp.outlet_ids : (emp.outlet_id ? [emp.outlet_id] : []),
      reports_to_user_id: emp.reports_to_user_id || "",
      date_of_joining: emp.date_of_joining || "",
      base_salary: emp.base_salary ?? "",
    });
    setComputedSalary({ salary: emp.salary, source: emp.salary_source, month: emp.salary_month });
    setShowDialog(true);
    fetchSalary(emp.id);
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        outlet_ids: form.outlet_ids,
        base_salary: form.base_salary !== "" ? Number(form.base_salary) : null,
      };
      if (editing) {
        const update = { ...payload };
        if (!update.password) delete update.password;
        await api.put(`/org/employees/${editing.id}`, update);
        toast.success("Employee updated");
      } else {
        await api.post("/org/employees/direct", {
          ...payload,
          password: form.password,
        });
        toast.success("Employee added");
      }
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const salaryLabel = (source) => {
    if (source === "recurring_salary") return "Synced to Expenses as recurring staff salary";
    if (source === "employee_expenses") return "From linked staff expenses";
    if (source === "outlet_pool") return "Split from outlet staff expenses";
    if (source === "base_salary") return "Set base salary to sync recurring expense";
    return "Set base salary in Organization to create monthly expense";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={`${employees.length} team members`}
        actions={canCreate && (
          <Button onClick={openCreate}><Plus size={14} className="mr-1" />Add employee</Button>
        )}
      />
      {employees.length === 0 ? (
        <EmptyState title="No employees" />
      ) : (
        <div className="card-modern overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Joined</th>
                <th className="text-left p-4">Salary (monthly)</th>
                <th className="text-left p-4">Reports to</th>
                <th className="text-left p-4">Status</th>
                {canEdit && <th className="p-4 w-16" />}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                  <td className="p-4 font-medium">{e.name}</td>
                  <td className="p-4 text-muted-foreground">{e.email}</td>
                  <td className="p-4"><Badge variant="primary">{e.role_name || e.role}</Badge></td>
                  <td className="p-4 text-muted-foreground">{e.date_of_joining ? formatDate(e.date_of_joining) : "—"}</td>
                  <td className="p-4 font-medium">{formatCurrency(e.salary, currency)}</td>
                  <td className="p-4 text-muted-foreground">{e.reports_to_name || "—"}</td>
                  <td className="p-4">
                    <Badge variant={e.active ? "success" : "destructive"}>{e.employee_status || (e.active ? "active" : "inactive")}</Badge>
                  </td>
                  {canEdit && (
                    <td className="p-4">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(e)} title="Edit employee">
                        <Pencil size={14} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee (direct)"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} /></div>
            <div>
              <Label>{editing ? "New password (leave blank to keep)" : "Password"}</Label>
              <Input type="password" value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} />
            </div>
            <div>
              <Label>Date of joining</Label>
              <Input type="date" value={form.date_of_joining} onChange={(ev) => setForm({ ...form, date_of_joining: ev.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outlet</Label>
              <Select value={form.outlet_ids[0] || ""} onValueChange={(v) => setForm({ ...form, outlet_ids: v ? [v] : [] })}>
                <SelectTrigger><SelectValue placeholder="Select outlet" /></SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Base salary (monthly — syncs to Expenses)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 25000"
                value={form.base_salary}
                onChange={(ev) => setForm({ ...form, base_salary: ev.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Creates a recurring staff/salary expense for the current month.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="mb-0">Computed monthly salary</Label>
                {editing && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => fetchSalary(editing.id)} disabled={salaryLoading}>
                    <RefreshCw size={12} className={salaryLoading ? "animate-spin" : ""} />
                  </Button>
                )}
              </div>
              <p className="text-lg font-semibold mt-1">
                {salaryLoading ? "…" : formatCurrency(computedSalary?.salary ?? 0, currency)}
              </p>
              {computedSalary?.source && (
                <p className="text-xs text-muted-foreground mt-1">{salaryLabel(computedSalary.source)}</p>
              )}
              {computedSalary?.month && (
                <p className="text-xs text-muted-foreground">Month: {computedSalary.month}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
