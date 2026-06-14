import React, { useEffect, useState } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil, Trash2, Download, Store } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";

const empty = {
  name: "", sku: "", barcode: "", category: "", cost_price: "", selling_price: "",
  tax_percent: "", reward_points: "0", min_stock: "10", unit: "pcs", image_url: "",
  outlet_ids: [], supplier_ids: [], initial_stock: "0",
};

export default function Products() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const isAdmin = user?.role === "business_admin";
  const isOutletManager = user?.role === "outlet_manager";
  const userOutletId = user?.outlet_id;

  const [items, setItems] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [q, setQ] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showOutletDialog, setShowOutletDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [form, setForm] = useState(empty);
  const [assignForm, setAssignForm] = useState({ outlet_ids: [], initial_stock: "0" });

  const load = async () => {
    const query = q ? `?search=${q}` : "";
    const [p, o, s] = await Promise.all([
      api.get(`/products${query}`),
      api.get("/outlets"),
      api.get("/suppliers"),
    ]);
    setItems(p.data);
    setOutlets(o.data);
    setSuppliers(s.data);
  };
  useEffect(() => { load(); }, [q]);

  const canEdit = ["business_admin", "outlet_manager"].includes(user?.role);
  const stockFor = (p) => {
    if (isOutletManager && userOutletId) return p.outlet_stock ?? p.stock_by_outlet?.[userOutletId] ?? 0;
    return p.total_stock ?? 0;
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      ...empty,
      outlet_ids: isAdmin ? outlets.map((o) => o.id) : [],
    });
    setShowDialog(true);
  };

  const openEdit = async (p) => {
    setEditing(p);
    setForm({
      name: p.name || "", sku: p.sku || "", barcode: p.barcode || "",
      category: p.category || "", cost_price: p.computed_cost_price || p.cost_price || "",
      selling_price: p.selling_price || "", tax_percent: p.tax_percent || "",
      reward_points: p.reward_points || 0, min_stock: p.min_stock || 0, unit: p.unit || "pcs",
      image_url: p.image_url || "", outlet_ids: p.outlet_ids || [],
      supplier_ids: p.supplier_ids || [], initial_stock: "0",
    });
    setCostBreakdown(null);
    if (isAdmin) {
      try {
        const { data } = await api.get(`/products/${p.id}/cost-breakdown`);
        setCostBreakdown(data);
        if (data.average_cost) setForm((f) => ({ ...f, cost_price: data.average_cost }));
      } catch { /* ignore */ }
    }
    setShowDialog(true);
  };

  const openAssign = (p) => {
    setAssigning(p);
    setAssignForm({
      outlet_ids: p.outlet_ids?.length ? p.outlet_ids : outlets.map((o) => o.id),
      initial_stock: "0",
    });
    setShowOutletDialog(true);
  };

  const toggleOutlet = (ids, setIds, id) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const toggleSupplier = (id) => {
    setForm((f) => ({
      ...f,
      supplier_ids: f.supplier_ids.includes(id)
        ? f.supplier_ids.filter((x) => x !== id)
        : [...f.supplier_ids, id],
    }));
  };

  const selectAllOutlets = (setIds) => setIds(outlets.map((o) => o.id));

  const save = async () => {
    try {
      const payload = {
        ...form,
        cost_price: Number(form.cost_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        tax_percent: Number(form.tax_percent) || 0,
        reward_points: Number(form.reward_points) || 0,
        min_stock: Number(form.min_stock) || 0,
        initial_stock: Number(form.initial_stock) || 0,
        outlet_ids: isAdmin ? form.outlet_ids : undefined,
        supplier_ids: isAdmin ? form.supplier_ids : undefined,
      };
      if (isAdmin && (!form.supplier_ids || form.supplier_ids.length < 1)) {
        toast.error("Select at least one supplier");
        return;
      }
      if (editing) {
        await api.put(`/products/${editing.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/products", payload);
        toast.success(isOutletManager ? "Product added to your outlet" : "Product created");
      }
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const saveAssign = async () => {
    try {
      await api.put(`/products/${assigning.id}/outlets`, {
        outlet_ids: assignForm.outlet_ids,
        initial_stock: Number(assignForm.initial_stock) || 0,
      });
      toast.success("Outlets and stock updated");
      setShowOutletDialog(false);
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

  const outletLabel = (p) => {
    if (p.all_outlets || !(p.outlet_ids?.length)) return "All outlets";
    if (p.outlet_names?.length) return p.outlet_names.join(", ");
    return (p.outlet_ids || [])
      .map((id) => outlets.find((o) => o.id === id)?.name || id)
      .join(", ");
  };

  const canEditProduct = (p) => {
    if (isAdmin) return true;
    if (isOutletManager && userOutletId) {
      return (p.outlet_ids || []).includes(userOutletId) || p.outlet_id === userOutletId;
    }
    return false;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Products"
        description={
          isOutletManager
            ? "Add products for your outlet — available immediately in POS and inventory."
            : `${items.length} products in your catalog. Assign outlets and stock as needed.`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => {
              const token = localStorage.getItem("token");
              const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
              const res = await fetch(`${backendUrl}/api/exports/products.xlsx`, {
                headers: { Authorization: `Bearer ${token}` },
              });
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
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Outlets</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Price</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Stock</th>
                {canEdit && <th className="p-4"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
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
                        <div className="text-xs text-muted-foreground font-mono">SKU: {p.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground">{p.category || "—"}</td>
                  <td className="p-4 text-xs text-muted-foreground max-w-[160px]">{outletLabel(p)}</td>
                  <td className="p-4 text-right font-mono font-medium">{formatCurrency(p.selling_price, currency)}</td>
                  <td className="p-4 text-right">
                    <Badge variant={stockFor(p) <= p.min_stock ? "destructive" : "outline"}>{stockFor(p)}</Badge>
                  </td>
                  {canEdit && (
                    <td className="p-4 text-right">
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => openAssign(p)} title="Assign outlets & stock" data-testid={`assign-${p.id}`}>
                          <Store size={14} />
                        </Button>
                      )}
                      {canEditProduct(p) && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}><Pencil size={14} /></Button>
                      )}
                      {isAdmin && (
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "New"} Product</DialogTitle>
          </DialogHeader>
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
            {isAdmin && (
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <Label>Suppliers * (at least one)</Label>
                </div>
                <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3 max-h-32 overflow-y-auto">
                  {suppliers.length === 0 ? (
                    <p className="text-sm text-muted-foreground col-span-2">Add suppliers first under Suppliers menu.</p>
                  ) : suppliers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.supplier_ids.includes(s.id)}
                        onCheckedChange={() => toggleSupplier(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Cost Price {costBreakdown?.cost_source === "po_average" ? "(avg from POs)" : "*"}</Label>
              <Input
                type="number"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                readOnly={!!costBreakdown?.supplier_prices?.length}
                data-testid="prod-cost"
              />
              {costBreakdown?.supplier_prices?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Avg of supplier PO prices: {costBreakdown.supplier_prices.map((s) => `${s.supplier_name} ₹${s.unit_cost}`).join(" · ")}
                </p>
              )}
              {!costBreakdown?.supplier_prices?.length && isAdmin && (
                <p className="text-xs text-muted-foreground mt-1">Updates automatically when purchase orders are received.</p>
              )}
            </div>
            <div><Label>Selling Price *</Label><Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} data-testid="prod-price" /></div>
            <div><Label>Tax %</Label><Input type="number" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} data-testid="prod-tax" /></div>
            <div><Label>Reward Points</Label><Input type="number" value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value })} /></div>
            <div><Label>Min Stock Level</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
            {!editing && (
              <div><Label>Initial Stock</Label><Input type="number" value={form.initial_stock} onChange={(e) => setForm({ ...form, initial_stock: e.target.value })} /></div>
            )}
            {isAdmin && (
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <Label>Assign to outlets</Label>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => selectAllOutlets((ids) => setForm({ ...form, outlet_ids: ids }))}>Select all</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3">
                  {outlets.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.outlet_ids.includes(o.id)}
                        onCheckedChange={() => toggleOutlet(form.outlet_ids, (ids) => setForm({ ...form, outlet_ids: ids }), o.id)}
                      />
                      {o.name}
                    </label>
                  ))}
                </div>
                {editing && (
                  <p className="text-xs text-muted-foreground mt-1">Set initial stock above to add stock to newly selected outlets.</p>
                )}
              </div>
            )}
            {isOutletManager && (
              <div className="col-span-2 text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                This product will be available immediately at your outlet. The business owner can later assign it to other outlets.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="prod-save">{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOutletDialog} onOpenChange={setShowOutletDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign outlets & stock</DialogTitle>
          </DialogHeader>
          {assigning && (
            <p className="text-sm text-muted-foreground mb-2">{assigning.name}</p>
          )}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Available at outlets</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => selectAllOutlets((ids) => setAssignForm({ ...assignForm, outlet_ids: ids }))}>Select all</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                {outlets.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={assignForm.outlet_ids.includes(o.id)}
                      onCheckedChange={() => toggleOutlet(assignForm.outlet_ids, (ids) => setAssignForm({ ...assignForm, outlet_ids: ids }), o.id)}
                    />
                    {o.name}
                    {assigning?.stock_by_outlet?.[o.id] != null && (
                      <span className="text-xs text-muted-foreground ml-auto">Stock: {assigning.stock_by_outlet[o.id]}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Stock to add (new outlets only)</Label>
              <Input type="number" value={assignForm.initial_stock} onChange={(e) => setAssignForm({ ...assignForm, initial_stock: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOutletDialog(false)}>Cancel</Button>
            <Button onClick={saveAssign} data-testid="prod-assign-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
