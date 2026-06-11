import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { KpiCard, PageHeader, Badge } from "@/components/SharedUI";
import {
  TrendingUp, ShoppingBag, Wallet, Users, Package, Boxes,
  AlertTriangle, Award, Receipt, ArrowUp,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";

const COLORS = ["#0055FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function BusinessDashboard() {
  const { user, business, outlet } = useAuth();
  const isAdmin = user?.role === "business_admin";
  const isOutletScoped = ["outlet_manager", "cashier"].includes(user?.role);
  const [outlets, setOutlets] = useState([]);
  const [outletFilter, setOutletFilter] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const selectedOutletName = isOutletScoped
    ? outlet?.name
    : outlets.find((o) => o.id === outletFilter)?.name;

  useEffect(() => {
    setLoading(true);
    const params = activeOutletId ? `?outlet_id=${activeOutletId}` : "";
    api.get(`/dashboard/business${params}`).then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, [activeOutletId]);

  if (loading) return <div className="text-muted-foreground">Loading dashboard…</div>;
  if (!data) return <div>Failed to load.</div>;

  const currency = business?.currency || "INR";
  const trend = data.daily_trend.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  }));

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0]}.`}
        description={
          selectedOutletName
            ? `Here's the pulse of ${selectedOutletName} today.`
            : "Here's the pulse of your business across all outlets."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && outlets.length > 0 && (
              <Select value={outletFilter} onValueChange={setOutletFilter}>
                <SelectTrigger className="w-48 h-10" data-testid="dash-outlet-filter">
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
            <Link to="/pos">
              <Button data-testid="dash-pos-cta">
                <Receipt size={14} className="mr-2" /> New Bill
              </Button>
            </Link>
          </div>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Today's Sales" value={formatCurrency(data.today_sales, currency)} sub={`${data.today_orders} orders today`} icon={ShoppingBag} testId="kpi-today-sales" />
        <KpiCard label="Monthly Sales" value={formatCurrency(data.monthly_sales, currency)} sub="Last 30 days" icon={TrendingUp} testId="kpi-monthly-sales" />
        <KpiCard label="Net Profit (M)" value={formatCurrency(data.monthly_profit, currency)} sub="After tax & expenses" icon={ArrowUp} testId="kpi-net-profit" />
        <KpiCard label="Inventory Value" value={formatCurrency(data.inventory_value, currency)} sub={`${data.total_products} products`} icon={Boxes} testId="kpi-inventory-value" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={formatCurrency(data.total_revenue, currency)} sub={`${data.total_orders} total orders`} icon={Wallet} testId="kpi-total-revenue" />
        <KpiCard label="Tax Collected" value={formatCurrency(data.tax_collected, currency)} sub={`${formatCurrency(data.monthly_tax, currency)} this month`} icon={Receipt} testId="kpi-tax" />
        <KpiCard label="Customers" value={data.total_customers} sub={`${data.reward_points_issued} points issued`} icon={Users} testId="kpi-customers" />
        <KpiCard label="Low Stock Alerts" value={data.low_stock_count} sub="Products need restock" icon={AlertTriangle} accent="warning" testId="kpi-low-stock" />
      </div>

      {/* Sales trend + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-modern p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="uppercase-label">Sales trend</div>
              <h3 className="font-display font-semibold text-lg mt-1">Last 30 days</h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v) => formatCurrency(v, currency)}
              />
              <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-6">
          <div className="uppercase-label mb-1">Top products</div>
          <h3 className="font-display font-semibold text-lg mb-4">Last 30 days</h3>
          <div className="space-y-3">
            {data.top_products.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
            {data.top_products.map((p, i) => (
              <div key={p.product_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.quantity} sold</div>
                  </div>
                </div>
                <div className="font-mono text-sm font-medium">{formatCurrency(p.revenue, currency)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Outlet comparison + Recent bills */}
      <div className={`grid grid-cols-1 ${isOutletScoped || outletFilter !== "all" ? "" : "lg:grid-cols-3"} gap-4`}>
        {!isOutletScoped && outletFilter === "all" && (
          <div className="card-modern p-6 lg:col-span-1">
            <div className="uppercase-label mb-1">Outlet comparison</div>
            <h3 className="font-display font-semibold text-lg mb-4">Monthly sales</h3>
            {data.outlet_comparison.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create an outlet to compare.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.outlet_comparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="outlet_name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        <div className={`card-modern p-6 ${isOutletScoped || outletFilter !== "all" ? "" : "lg:col-span-2"}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="uppercase-label">Recent bills</div>
              <h3 className="font-display font-semibold text-lg mt-1">Latest transactions</h3>
            </div>
            <Link to="/bills" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="text-left py-2.5">Bill #</th>
                  <th className="text-left py-2.5">Customer</th>
                  <th className="text-left py-2.5">When</th>
                  <th className="text-left py-2.5">Method</th>
                  <th className="text-right py-2.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_bills.map((b) => (
                  <tr key={b.id} className="border-b border-border/50">
                    <td className="py-3 font-mono text-xs">{b.bill_no}</td>
                    <td className="py-3">{b.customer_name}</td>
                    <td className="py-3 text-muted-foreground text-xs">{formatDate(b.created_at)}</td>
                    <td className="py-3"><Badge variant="outline">{b.payment_method}</Badge></td>
                    <td className="py-3 text-right font-mono font-medium">{formatCurrency(b.total, currency)}</td>
                  </tr>
                ))}
                {data.recent_bills.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No bills yet. Start with a sale.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
