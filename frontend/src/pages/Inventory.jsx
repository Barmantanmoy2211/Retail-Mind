import React, { useEffect, useState } from "react";
import api, { formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, MoveRight, Settings2 } from "lucide-react";
import { toast } from "sonner";

export default function Inventory() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [low, setLow] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [show, setShow] = useState(null); // 'stock_in' | 'stock_out' | 'transfer' | 'adjustment'
  const [form, setForm] = useState({ product_id: "", outlet_id: "", quantity: "", to_outlet_id: "", note: "" });

  const load = async () => {
    const [t, l, p, o] = await Promise.all([
      api.get("/inventory/transactions"),
      api.get("/inventory/low-stock"),
      api.get("/products"),
      api.get("/outlets"),
    ]);
    setTxns(t.data);
    setLow(l.data);
    setProducts(p.data);
    setOutlets(o.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/inventory/transactions", {
        type: show,
        product_id: form.product_id,
        outlet_id: form.outlet_id,
        quantity: Number(form.quantity),
        to_outlet_id: form.to_outlet_id || null,
        note: form.note,
      });
      toast.success("Done");
      setShow(null);
      setForm({ product_id: "", outlet_id: "", quantity: "", to_outlet_id: "", note: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const typeBadge = { stock_in: "success", stock_out: "warning", sale: "primary", transfer: "primary", adjustment: "outline" };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Inventory"
        description={`${low.length} low-stock alerts.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShow("stock_in")} data-testid="inv-in"><ArrowDownToLine size={14} className="mr-1.5" />Stock In</Button>
            <Button variant="outline" onClick={() => setShow("stock_out")} data-testid="inv-out"><ArrowUpFromLine size={14} className="mr-1.5" />Stock Out</Button>
            <Button variant="outline" onClick={() => setShow("transfer")} data-testid="inv-transfer"><MoveRight size={14} className="mr-1.5" />Transfer</Button>
            <Button variant="outline" onClick={() => setShow("adjustment")} data-testid="inv-adjust"><Settings2 size={14} className="mr-1.5" />Adjust</Button>
          </div>
        }
      />

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions" data-testid="tab-txns">Transactions</TabsTrigger>
          <TabsTrigger value="low" data-testid="tab-low">Low Stock <Badge variant="destructive" className="ml-2">{low.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          {txns.length === 0 ? <EmptyState title="No transactions yet" /> : (
            <div className="card-modern overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30">
                  <tr className="border-b border-border">
                    <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Type</th>
                    <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Product</th>
                    <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Qty</th>
                    <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">When</th>
                    <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="p-4"><Badge variant={typeBadge[t.type] || "outline"}>{t.type?.replace("_", " ")}</Badge></td>
                      <td className="p-4">{t.product_name}</td>
                      <td className="p-4 text-right font-mono">{t.quantity > 0 ? "+" : ""}{t.quantity}</td>
                      <td className="p-4 text-xs text-muted-foreground">{formatDate(t.created_at)}</td>
                      <td className="p-4 text-xs text-muted-foreground">{t.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="low" className="mt-4">
          {low.length === 0 ? <EmptyState title="No low stock items" description="Everything's healthy ✨" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {low.map((a, i) => (
                <div key={i} className="card-modern p-4 border-warning/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-warning" />
                    <div className="text-xs uppercase tracking-wider text-warning font-semibold">Low Stock</div>
                  </div>
                  <div className="font-medium">{a.product_name}</div>
                  <div className="text-sm text-muted-foreground">{a.outlet_name}</div>
                  <div className="mt-3 flex justify-between text-sm">
                    <span>Current: <span className="font-mono font-bold text-warning">{a.stock}</span></span>
                    <span className="text-muted-foreground">Min: {a.min_stock}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!show} onOpenChange={() => setShow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">{show?.replace("_", " ")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger data-testid="inv-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{show === "transfer" ? "From Outlet" : "Outlet"}</Label>
              <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                <SelectTrigger data-testid="inv-outlet"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {show === "transfer" && (
              <div>
                <Label>To Outlet</Label>
                <Select value={form.to_outlet_id} onValueChange={(v) => setForm({ ...form, to_outlet_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {outlets.filter(o => o.id !== form.outlet_id).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Quantity {show === "adjustment" && "(use +/- numbers)"}</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="inv-qty" />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow(null)}>Cancel</Button>
            <Button onClick={submit} data-testid="inv-submit">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
