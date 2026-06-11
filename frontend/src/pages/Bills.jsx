import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Eye, Download } from "lucide-react";

export default function Bills() {
  const { business } = useAuth();
  const currency = business?.currency || "INR";
  const [bills, setBills] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/bills?days=30").then((r) => setBills(r.data));
  }, []);

  const filtered = bills.filter(b => !q || b.bill_no?.toLowerCase().includes(q.toLowerCase()) || b.customer_name?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Bills & Invoices" description={`${bills.length} bills in last 30 days.`}
        actions={
          <Button variant="outline" onClick={async () => {
            const token = localStorage.getItem("token");
            const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/exports/bills.xlsx?days=30`, { headers: { Authorization: `Bearer ${token}` } });
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `bills-${Date.now()}.xlsx`;
            a.click();
          }} data-testid="bills-export"><Download size={14} className="mr-1.5" />Excel</Button>
        }
      />

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by bill # or customer..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" data-testid="bills-search" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No bills yet" description="Head to POS Billing to create your first sale." />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Bill #</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Customer</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Date</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Items</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Payment</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Total</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer" onClick={() => setSelected(b)} data-testid={`bill-row-${b.id}`}>
                  <td className="p-4 font-mono">{b.bill_no}</td>
                  <td className="p-4">{b.customer_name}</td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(b.created_at)}</td>
                  <td className="p-4">{b.items?.length || 0}</td>
                  <td className="p-4"><Badge variant="outline">{b.payment_method}</Badge></td>
                  <td className="p-4 text-right font-mono font-medium">{formatCurrency(b.total, currency)}</td>
                  <td className="p-4"><Eye size={14} className="text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.bill_no}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{selected.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(selected.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cashier</span><span>{selected.cashier_name}</span></div>
              <div className="border-t border-border my-2" />
              {selected.items?.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span className="line-clamp-1">{it.product_name} × {it.quantity}</span>
                  <span className="font-mono">{formatCurrency(it.line_total, currency)}</span>
                </div>
              ))}
              <div className="border-t border-border my-2" />
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(selected.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span className="font-mono">{formatCurrency(selected.tax_total, currency)}</span></div>
              {selected.redeem_value > 0 && <div className="flex justify-between"><span>Points redeemed</span><span className="font-mono">-{formatCurrency(selected.redeem_value, currency)}</span></div>}
              <div className="flex justify-between text-lg font-display font-bold pt-2 border-t border-border">
                <span>Total</span><span className="font-mono">{formatCurrency(selected.total, currency)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
