import React, { useEffect, useState } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil, Trash2, Package, Download } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";

const empty = {
  name: "", sku: "", barcode: "", category: "", cost_price: "", selling_price: "",
  tax_percent: "", reward_points: "0", min_stock: "10", unit: "pcs", image_url: "",
};

export default function Products() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);

  const load = async () => {
    const { data } = await api.get(`/products${q ? `?search=${q}` : ""}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [q]);

  const canEdit = ["business_admin", "outlet_manager"].includes(user?.role);

  const openNew = () => { setEditing(null); setForm(empty); setShowDialog(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || "", sku: p.sku || "", barcode: p.barcode || "",
      category: p.category || "", cost_price: p.cost_price || "",
      selling_price: p.selling_price || "", tax_percent: p.tax_percent || "",
      reward_points: p.reward_points || 0, min_stock: p.min_stock || 0, unit: p.unit || "pcs",
      image_url: p.image_url || "",
    });
    setShowDialog(true);
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        cost_price: Number(form.cost_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        tax_percent: Number(form.tax_percent) || 0,
        reward_points: Number(form.reward_points) || 0,
        min_stock: Number(form.min_stock) || 0,
      };
      if (editing) await api.put(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success(editing ? "Product updated" : "Product created");
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    await api.delete(`/products/${p.id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Products"
        description={`${items.length} products in your catalog.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => {
              const token = localStorage.getItem("token");
              const url = `${process.env.REACT_APP_BACKEND_URL}/api/exports/products.xlsx`;
              const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
              const blob = await res.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `products-${Date.now()}.xlsx`;
              a.click();
            }} data-testid="prod-export"><Download size={14} className="mr-1.5" />Excel</Button>
            {canEdit && <Button onClick={openNew} data-testid="prod-new-btn"><Plus size={14} className="mr-1.5" />Add Product</Button>}
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, SKU or barcode..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" data-testid="prod-search" />
      </div>

      {items.length === 0 ? (
        <EmptyState title="No products yet" description="Build your catalog by adding the items you sell." />
      ) : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Product</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Category</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Cost</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Price</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Tax</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Stock</th>
                {canEdit && <th className="p-4"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20" data-testid={`prod-row-${p.id}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-9 h-9 rounded-md object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center font-display font-bold">
                          {p.name[0]}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">SKU: {p.sku} · {p.barcode || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground">{p.category || "—"}</td>
                  <td className="p-4 text-right font-mono text-muted-foreground">{formatCurrency(p.cost_price, currency)}</td>
                  <td className="p-4 text-right font-mono font-medium">{formatCurrency(p.selling_price, currency)}</td>
                  <td className="p-4 text-right">{p.tax_percent}%</td>
                  <td className="p-4 text-right">
                    <Badge variant={p.total_stock <= p.min_stock ? "destructive" : "outline"}>{p.total_stock}</Badge>
                  </td>
                  {canEdit && (
                    <td className="p-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}><Pencil size={14} /></Button>
                      {user.role === "business_admin" && (
                        <Button variant="ghost" size="sm" onClick={() => remove(p)} data-testid={`del-${p.id}`}><Trash2 size={14} className="text-destructive" /></Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Product</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Image</Label>
              <div className="mt-1.5"><ImageUpload value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} folder="products" /></div>
            </div>
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="prod-name" /></div>
            <div><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} data-testid="prod-sku" /></div>
            <div><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} data-testid="prod-barcode" /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="prod-cat" /></div>
            <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Cost Price *</Label><Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} data-testid="prod-cost" /></div>
            <div><Label>Selling Price *</Label><Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} data-testid="prod-price" /></div>
            <div><Label>Tax %</Label><Input type="number" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} data-testid="prod-tax" /></div>
            <div><Label>Reward Points</Label><Input type="number" value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value })} /></div>
            <div className="col-span-2"><Label>Min Stock Level</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="prod-save">{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
