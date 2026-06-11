import React, { useEffect, useState } from "react";
import api, { formatCurrency, formatDate } from "@/lib/api";
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
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

export default function PurchaseOrders() {
  const { business } = useAuth();
  const currency = business?.currency || "INR";
  const [pos, setPos] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", outlet_id: "", items: [], note: "" });
  const [itemForm, setItemForm] = useState({ product_id: "", quantity: 1, cost_price: 0 });

  const load = async () => {
    const [p, s, pr, o] = await Promise.all([
      api.get("/purchase-orders"),
      api.get("/suppliers"),
      api.get("/products"),
      api.get("/outlets"),
    ]);
    setPos(p.data); setSuppliers(s.data); setProducts(pr.data); setOutlets(o.data);
  };
  useEffect(() => { load(); }, []);

  const addItem = () => {
    if (!itemForm.product_id) return;
    setForm({ ...form, items: [...form.items, itemForm] });
    setItemForm({ product_id: "", quantity: 1, cost_price: 0 });
  };

  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

  const submit = async () => {
    try {
      await api.post("/purchase-orders", {
        ...form,
        items: form.items.map(i => ({ ...i, quantity: Number(i.quantity), cost_price: Number(i.cost_price) })),
      });
      toast.success("Purchase order created");
      setShowDialog(false);
      setForm({ supplier_id: "", outlet_id: "", items: [], note: "" });
      load();
    } catch (e) {
      toast.error("Failed");
    }
  };

  const markReceived = async (po) => {
    if (!window.confirm("Mark as received? Stock will be updated and an expense recorded.")) return;
    await api.put(`/purchase-orders/${po.id}`, { status: "received" });
    toast.success("Received - stock updated");
    load();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Purchase Orders"
        description={`${pos.length} orders.`}
        actions={<Button onClick={() => setShowDialog(true)} data-testid="po-new"><Plus size={14} className="mr-1.5" />New PO</Button>}
      />

      {pos.length === 0 ? <EmptyState title="No purchase orders" /> : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Supplier</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Items</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Total</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Status</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">When</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {pos.map(p => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="p-4 font-medium">{p.supplier_name}</td>
                  <td className="p-4">{p.items?.length || 0}</td>
                  <td className="p-4 text-right font-mono">{formatCurrency(p.total, currency)}</td>
                  <td className="p-4"><Badge variant={p.status === "received" ? "success" : "warning"}>{p.status}</Badge></td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(p.created_at)}</td>
                  <td className="p-4 text-right">
                    {p.status === "pending" && <Button size="sm" onClick={() => markReceived(p)} data-testid={`po-receive-${p.id}`}><Check size={14} className="mr-1" />Receive</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger data-testid="po-supplier"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outlet (deliver to)</Label>
              <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                <SelectTrigger data-testid="po-outlet"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-2">
            <div className="uppercase-label mb-2">Items</div>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <Select value={itemForm.product_id} onValueChange={(v) => {
                const p = products.find(x => x.id === v);
                setItemForm({ ...itemForm, product_id: v, cost_price: p?.cost_price || 0 });
              }}>
                <SelectTrigger className="col-span-6" data-testid="po-item-product"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Qty" className="col-span-2" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} data-testid="po-item-qty" />
              <Input type="number" placeholder="Cost" className="col-span-3" value={itemForm.cost_price} onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })} />
              <Button size="sm" onClick={addItem} className="col-span-1" data-testid="po-add-item"><Plus size={14} /></Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {form.items.map((it, i) => {
                const p = products.find(x => x.id === it.product_id);
                return (
                  <div key={i} className="flex items-center justify-between text-sm p-2 border border-border rounded">
                    <span>{p?.name} × {it.quantity}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatCurrency(it.quantity * it.cost_price, currency)}</span>
                      <button onClick={() => removeItem(i)}><Trash2 size={12} className="text-destructive" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.supplier_id || !form.outlet_id || form.items.length === 0} data-testid="po-save">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
