import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Search, MoreVertical, Building2 } from "lucide-react";

export default function PlatformBusinesses() {
  const [businesses, setBusinesses] = useState([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [actionForm, setActionForm] = useState({ action: "approve", plan: "", outlet_limit: "" });

  const load = async () => {
    const f = filter === "all" ? "" : `?status=${filter}`;
    const { data } = await api.get(`/platform/businesses${f}`);
    setBusinesses(data);
  };
  useEffect(() => { load(); }, [filter]);

  const filtered = businesses.filter(b =>
    !q || b.business_name.toLowerCase().includes(q.toLowerCase()) || b.email.toLowerCase().includes(q.toLowerCase())
  );

  const openAction = (b, action) => {
    setSelected(b);
    setActionForm({ action, plan: b.plan, outlet_limit: b.outlet_limit });
    setShowDialog(true);
  };

  const submit = async () => {
    try {
      const payload = { action: actionForm.action };
      if (actionForm.plan) payload.plan = actionForm.plan;
      if (actionForm.outlet_limit) payload.outlet_limit = Number(actionForm.outlet_limit);
      await api.post(`/platform/businesses/${selected.id}/action`, payload);
      toast.success(`Action: ${actionForm.action} successful`);
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const statusColor = (s) => ({
    approved: "success", pending: "warning", rejected: "destructive", suspended: "destructive",
  })[s] || "default";

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Businesses" description="Manage every tenant on the platform." />

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-10"
            data-testid="biz-search"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="md:w-48 h-10" data-testid="biz-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No businesses found" description="Try changing your filters." />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Business</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Plan</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Outlets</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Users</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Registered</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/20" data-testid={`biz-row-${b.id}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <Building2 size={14} />
                      </div>
                      <div>
                        <div className="font-medium">{b.business_name}</div>
                        <div className="text-xs text-muted-foreground">{b.business_type} · {b.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 capitalize"><Badge variant="primary">{b.plan}</Badge> <span className="text-xs text-muted-foreground ml-1">{formatCurrency(b.plan_price)}</span></td>
                  <td className="p-4"><Badge variant={statusColor(b.subscription_status)}>{b.subscription_status}</Badge></td>
                  <td className="p-4">{b.outlets_count} <span className="text-xs text-muted-foreground">/ {b.outlet_limit}</span></td>
                  <td className="p-4">{b.users_count}</td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(b.created_at)}</td>
                  <td className="p-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid={`biz-actions-${b.id}`}><MoreVertical size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {b.subscription_status === "pending" && (
                          <>
                            <DropdownMenuItem onClick={() => openAction(b, "approve")}>Approve</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAction(b, "reject")}>Reject</DropdownMenuItem>
                          </>
                        )}
                        {b.subscription_status === "approved" && (
                          <>
                            <DropdownMenuItem onClick={() => openAction(b, "suspend")}>Suspend</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAction(b, "approve")}>Change Plan</DropdownMenuItem>
                          </>
                        )}
                        {b.subscription_status === "suspended" && (
                          <DropdownMenuItem onClick={() => openAction(b, "activate")}>Activate</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionForm.action} - {selected?.business_name}</DialogTitle>
          </DialogHeader>
          {(actionForm.action === "approve" || actionForm.action === "activate") && (
            <div className="space-y-4">
              <div>
                <Label>Plan</Label>
                <Select value={actionForm.plan} onValueChange={(v) => setActionForm({ ...actionForm, plan: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter (1 outlet)</SelectItem>
                    <SelectItem value="growth">Growth (5 outlets)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (unlimited)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Custom outlet limit (optional)</Label>
                <Input
                  type="number"
                  value={actionForm.outlet_limit}
                  onChange={(e) => setActionForm({ ...actionForm, outlet_limit: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="action-submit">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
