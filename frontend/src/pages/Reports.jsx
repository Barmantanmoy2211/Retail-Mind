import React, { useEffect, useState } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, KpiCard } from "@/components/SharedUI";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Phase2Banner } from "@/components/SharedUI";
import { TrendingUp, Wallet, Receipt, Boxes, Download } from "lucide-react";
import HealthScoreView from "@/pages/HealthScore";

const COLORS = ["#0055FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function Reports() {
  const { user, business, outlet } = useAuth();
  const currency = business?.currency || "INR";
  const isAdmin = user?.role === "business_admin";
  const isOutletScoped = ["outlet_manager", "cashier"].includes(user?.role);
  const [outlets, setOutlets] = useState([]);
  const [outletFilter, setOutletFilter] = useState("all");
  const [period, setPeriod] = useState("monthly");
  const [pl, setPL] = useState(null);
  const [tax, setTax] = useState(null);
  const [inv, setInv] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      api.get("/outlets").then((r) => setOutlets(r.data));
    }
  }, [isAdmin]);

  const activeOutletId = isOutletScoped
    ? user?.outlet_id
    : outletFilter !== "all"
      ? outletFilter
      : null;

  const outletQ = activeOutletId ? `&outlet_id=${activeOutletId}` : "";
  const outletQuery = activeOutletId ? `?outlet_id=${activeOutletId}` : "";

  const selectedOutletName = isOutletScoped
    ? outlet?.name
    : outlets.find((o) => o.id === outletFilter)?.name;

  useEffect(() => {
    const days = period === "yearly" ? 365 : period === "quarterly" ? 90 : period === "weekly" ? 7 : period === "daily" ? 1 : 30;
    api.get(`/reports/profit-loss?period=${period}${outletQ}`).then((r) => setPL(r.data));
    api.get(`/reports/tax?days=${days}${outletQ}`).then((r) => setTax(r.data));
    api.get(`/reports/inventory${outletQuery}`).then((r) => setInv(r.data));
  }, [period, outletQ, outletQuery]);

  const exportCSV = (rows, name) => {
    if (!rows || rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${Date.now()}.csv`;
    a.click();
  };

  const exportXlsx = async (endpoint, name) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${Date.now()}.xlsx`;
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Reports & Analytics"
        description={
          selectedOutletName
            ? `Metrics for ${selectedOutletName}.`
            : "Deep dive into your business metrics across all outlets."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && outlets.length > 0 && (
              <Select value={outletFilter} onValueChange={setOutletFilter}>
                <SelectTrigger className="w-48 h-10" data-testid="rep-outlet-filter">
                  <SelectValue placeholder="All outlets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outlets</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44 h-10" data-testid="rep-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Last 1 day</SelectItem>
                <SelectItem value="weekly">Last 7 days</SelectItem>
                <SelectItem value="monthly">Last 30 days</SelectItem>
                <SelectItem value="quarterly">Last 90 days</SelectItem>
                <SelectItem value="yearly">Last 365 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Tabs defaultValue="pl">
        <TabsList>
          <TabsTrigger value="pl" data-testid="tab-pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="tax" data-testid="tab-tax">Tax Report</TabsTrigger>
          <TabsTrigger value="inv" data-testid="tab-inv">Inventory</TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">Health Score</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="mt-6 space-y-6">
          {pl && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Revenue" value={formatCurrency(pl.revenue, currency)} sub={`${pl.orders} orders`} icon={TrendingUp} testId="rep-revenue" />
                <KpiCard label="COGS" value={formatCurrency(pl.cogs, currency)} sub="Cost of goods" icon={Boxes} testId="rep-cogs" />
                <KpiCard label="Gross Profit" value={formatCurrency(pl.gross_profit, currency)} icon={Wallet} accent="success" testId="rep-gross" />
                <KpiCard label="Net Profit" value={formatCurrency(pl.net_profit, currency)} sub="After tax & expenses" icon={TrendingUp} accent="success" testId="rep-net" />
              </div>
              <div className="card-modern p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-semibold text-lg">Expense breakdown</h3>
                  <Button variant="outline" size="sm" onClick={() => exportCSV(Object.entries(pl.expense_by_category).map(([k, v]) => ({ category: k, amount: v })), "expenses")}>
                    <Download size={14} className="mr-1.5" />Export
                  </Button>
                </div>
                {Object.keys(pl.expense_by_category || {}).length === 0 ? <p className="text-sm text-muted-foreground">No expenses in this period.</p> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={Object.entries(pl.expense_by_category).map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                        {Object.keys(pl.expense_by_category).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v, currency)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="tax" className="mt-6 space-y-6">
          {tax && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label="Total Sales" value={formatCurrency(tax.total_sales, currency)} icon={TrendingUp} testId="tax-sales" />
                <KpiCard label="Tax Collected" value={formatCurrency(tax.total_tax, currency)} icon={Receipt} accent="warning" testId="tax-collected" />
                <KpiCard label="Net Revenue" value={formatCurrency(tax.net_revenue, currency)} sub="Sales - Tax" icon={Wallet} testId="tax-net" />
              </div>
              <div className="card-modern p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-semibold text-lg">Daily tax trend</h3>
                  <Button variant="outline" size="sm" onClick={() => exportCSV(tax.daily, "tax-daily")}><Download size={14} className="mr-1.5" />Export</Button>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={tax.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="tax" stroke="hsl(var(--warning))" fill="hsl(var(--warning))" fillOpacity={0.2} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card-modern p-6">
                  <h3 className="font-display font-semibold mb-4">By rate</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="text-left py-2">Rate</th><th className="text-right py-2">Sales</th><th className="text-right py-2">Tax</th></tr></thead>
                    <tbody>
                      {tax.by_rate.map((r, i) => <tr key={i} className="border-b border-border/50"><td className="py-2">{r.rate}%</td><td className="text-right font-mono">{formatCurrency(r.sales, currency)}</td><td className="text-right font-mono">{formatCurrency(r.tax, currency)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                {!activeOutletId && (
                  <div className="card-modern p-6">
                    <h3 className="font-display font-semibold mb-4">By outlet</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="text-left py-2">Outlet</th><th className="text-right py-2">Sales</th><th className="text-right py-2">Tax</th></tr></thead>
                      <tbody>
                        {tax.by_outlet.map((r, i) => <tr key={i} className="border-b border-border/50"><td className="py-2">{r.outlet_name || "—"}</td><td className="text-right font-mono">{formatCurrency(r.sales, currency)}</td><td className="text-right font-mono">{formatCurrency(r.tax, currency)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="inv" className="mt-6 space-y-6">
          {inv && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label="Inventory Value" value={formatCurrency(inv.total_inventory_value, currency)} icon={Boxes} testId="inv-value" />
                <KpiCard label="Fast Moving" value={inv.fast_moving.length} sub="Top sellers" icon={TrendingUp} accent="success" testId="inv-fast" />
                <KpiCard label="Dead Stock" value={inv.dead_stock.length} sub="No sales 90d" icon={Boxes} accent="destructive" testId="inv-dead" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProductList title="Fast Moving" items={inv.fast_moving} sub="sold last 90 days" currency={currency} />
                <ProductList title="Slow Moving" items={inv.slow_moving} sub="sold last 90 days" currency={currency} />
              </div>
              <ProductList title="Dead Stock" items={inv.dead_stock} sub="zero sales" currency={currency} />
            </>
          )}
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <HealthScoreView embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductList({ title, items, sub, currency }) {
  return (
    <div className="card-modern p-6">
      <h3 className="font-display font-semibold mb-3">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {items.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-secondary/30">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">Stock: {p.stock} · {p.sold_90d} {sub}</div>
              </div>
              <span className="font-mono text-xs">{formatCurrency(p.value, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
