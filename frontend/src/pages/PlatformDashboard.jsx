import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { KpiCard, PageHeader, Badge } from "@/components/SharedUI";
import {
  Building2, Users, Receipt, TrendingUp, AlertCircle, CheckCircle2,
  Pause, XCircle, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const COLORS = ["#0055FF", "#10B981", "#F59E0B"];

export default function PlatformDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);

  const load = async () => {
    const [s, p] = await Promise.all([
      api.get("/platform/stats"),
      api.get("/platform/businesses?status=pending"),
    ]);
    setStats(s.data);
    setPending(p.data);
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    try {
      await api.post(`/platform/businesses/${id}/action`, { action });
      toast.success(`Subscription ${action}d`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action failed");
    }
  };

  if (!stats) return <div className="text-muted-foreground">Loading…</div>;

  const planData = Object.entries(stats.plan_distribution || {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title="Platform Console"
        description="Every business, every metric, in one place."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Businesses" value={stats.total_businesses} sub={`${stats.monthly_new_businesses} new this month`} icon={Building2} testId="platform-kpi-businesses" />
        <KpiCard label="Active" value={stats.active_businesses} icon={CheckCircle2} accent="success" testId="platform-kpi-active" />
        <KpiCard label="Pending Approval" value={stats.pending_approvals} icon={AlertCircle} accent="warning" testId="platform-kpi-pending" />
        <KpiCard label="Total Revenue" value={formatCurrency(stats.total_revenue)} sub={`${stats.total_bills} bills processed`} icon={TrendingUp} testId="platform-kpi-revenue" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Outlets" value={stats.total_outlets} icon={Building2} testId="platform-kpi-outlets" />
        <KpiCard label="Customers" value={stats.total_customers} icon={Users} testId="platform-kpi-customers" />
        <KpiCard label="Suspended" value={stats.suspended_businesses} icon={Pause} accent="destructive" testId="platform-kpi-suspended" />
        <KpiCard label="Rejected" value={stats.rejected_businesses} icon={XCircle} accent="destructive" testId="platform-kpi-rejected" />
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="card-modern p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="uppercase-label">Action needed</div>
              <h3 className="font-display font-semibold text-lg mt-1">Pending Approvals ({pending.length})</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="text-left py-2.5">Business</th>
                  <th className="text-left py-2.5">Type</th>
                  <th className="text-left py-2.5">Owner</th>
                  <th className="text-left py-2.5">Plan</th>
                  <th className="text-left py-2.5">Registered</th>
                  <th className="text-right py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((b) => (
                  <tr key={b.id} className="border-b border-border/50">
                    <td className="py-3 font-medium">{b.business_name}</td>
                    <td className="py-3 text-muted-foreground">{b.business_type}</td>
                    <td className="py-3">{b.owner_name}<br /><span className="text-xs text-muted-foreground">{b.email}</span></td>
                    <td className="py-3 capitalize"><Badge variant="primary">{b.plan}</Badge></td>
                    <td className="py-3 text-xs text-muted-foreground">{formatDate(b.created_at)}</td>
                    <td className="py-3 text-right space-x-2">
                      <Button size="sm" onClick={() => act(b.id, "approve")} data-testid={`approve-${b.id}`}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => act(b.id, "reject")} data-testid={`reject-${b.id}`}>Reject</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plan distribution + top businesses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-modern p-6">
          <div className="uppercase-label mb-1">Plan distribution</div>
          <h3 className="font-display font-semibold text-lg mb-4">Active subscriptions</h3>
          {planData.length > 0 && planData.some(p => p.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No approved subscriptions yet.</p>}
        </div>

        <div className="card-modern p-6 lg:col-span-2">
          <div className="uppercase-label mb-1">Top businesses</div>
          <h3 className="font-display font-semibold text-lg mb-4">By revenue processed</h3>
          {stats.top_businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills processed yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.top_businesses.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</div>
                    <div>
                      <div className="font-medium">{b.business_name}</div>
                      <div className="text-xs text-muted-foreground">{b.bills} bills</div>
                    </div>
                  </div>
                  <div className="font-mono font-semibold">{formatCurrency(b.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top categories + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-modern p-6">
          <div className="uppercase-label mb-1">Business categories</div>
          <h3 className="font-display font-semibold text-lg mb-4">Top types</h3>
          {stats.top_categories.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.top_categories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="category" dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-modern p-6">
          <div className="uppercase-label mb-1">Recent registrations</div>
          <h3 className="font-display font-semibold text-lg mb-4">Newest businesses</h3>
          <div className="space-y-2">
            {stats.recent_registrations.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 border border-border">
                <div>
                  <div className="font-medium">{b.business_name}</div>
                  <div className="text-xs text-muted-foreground">{b.business_type} · {b.owner_name}</div>
                </div>
                <Badge variant={b.subscription_status === "approved" ? "success" : b.subscription_status === "pending" ? "warning" : "destructive"}>
                  {b.subscription_status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
