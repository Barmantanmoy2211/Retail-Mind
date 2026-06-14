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
import { Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

const statusVariant = {
  pending_approval: "warning",
  pending: "warning",
  received: "success",
  rejected: "destructive",
  cancelled: "outline",
};

export default function PurchaseOrders() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const isOwner = user?.role === "business_admin";
  const [pos, setPos] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [approvePo, setApprovePo] = useState(null);
  const [form, setForm] = useState({ supplier_id: "", outlet_id: "", items: [], note: "" });
  const [itemForm, setItemForm] = useState({ product_id: "", quantity: 1, cost_price: 0 });
  const [approveForm, setApproveForm] = useState({
    fulfillment_source: "supplier",
    supplier_id: "",
    fulfill_outlet_id: "",
    warehouse_id: "",
    shipping_charge: "",
    center_charge: "",
    items: [],
  });

  const load = async () => {
    const [p, s, pr, o] = await Promise.all([
      api.get("/purchase-orders"),
      api.get("/suppliers"),
      api.get("/products?approved_only=true"),
      api.get("/outlets?active_only=true"),
    ]);
    setPos(p.data);
    setSuppliers(s.data);
    setProducts(pr.data);
    setOutlets(o.data);
  };

  const outletLabel = (o) => (o.is_warehouse ? `${o.name} (Warehouse)` : o.name);
  const retailOutlets = outlets.filter((o) => !o.is_warehouse);
  const centralWarehouse = outlets.find((o) => o.is_warehouse) || approvePo?.warehouse;
  const defaultDeliverOutlet = () => {
    const wh = outlets.find((o) => o.is_warehouse);
    return wh?.id || outlets[0]?.id || "";
  };
  const approveGoodsTotal = approveForm.items.reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.cost_price || 0),
    0,
  );
  const approveFeesTotal = Number(approveForm.shipping_charge || 0) + Number(approveForm.center_charge || 0);
  useEffect(() => { load(); }, []);

  const addItem = () => {
    if (!itemForm.product_id) return;
    setForm({ ...form, items: [...form.items, itemForm] });
    setItemForm({ product_id: "", quantity: 1, cost_price: 0 });
  };

  const submit = async () => {
    try {
      await api.post("/purchase-orders", {
        ...form,
        items: form.items.map((i) => ({ ...i, quantity: Number(i.quantity), cost_price: Number(i.cost_price) })),
      });
      toast.success("Purchase order created");
      setShowDialog(false);
      setForm({ supplier_id: "", outlet_id: "", items: [], note: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const markReceived = async (po) => {
    if (!window.confirm("Mark as received? Stock will be updated and expense recorded.")) return;
    await api.put(`/purchase-orders/${po.id}`, { status: "received" });
    toast.success("Received — stock and expense updated");
    load();
  };

  const rejectRequest = async (po) => {
    await api.put(`/purchase-orders/${po.id}`, { status: "rejected" });
    toast.success("Request rejected");
    load();
  };

  const costForProductSupplier = (productId, supplierId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    if (p.supplier_costs?.[supplierId]) return p.supplier_costs[supplierId];
    return p.cost_price || p.computed_cost_price || 0;
  };

  const openApprove = async (po) => {
    const defaultSupplier = suppliers[0]?.id || "";
    setApprovePo(po);
    try {
      const { data: full } = await api.get(`/purchase-orders/${po.id}`);
      const poItems = full.items?.length ? full.items : po.items || [];
      const destId = full.requested_outlet_id || full.outlet_id || po.requested_outlet_id || retailOutlets[0]?.id || "";
      setApproveForm({
        fulfillment_source: "supplier",
        supplier_id: defaultSupplier,
        fulfill_outlet_id: destId,
        warehouse_id: full.warehouse?.id || outlets.find((o) => o.is_warehouse)?.id || "",
        shipping_charge: "",
        center_charge: "",
        items: poItems.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          cost_price: costForProductSupplier(it.product_id, defaultSupplier),
          warehouse_stock: it.warehouse_stock,
        })),
      });
      setApprovePo(full);
    } catch {
      setApproveForm({
        fulfillment_source: "supplier",
        supplier_id: defaultSupplier,
        fulfill_outlet_id: po.requested_outlet_id || po.outlet_id || retailOutlets[0]?.id || "",
        warehouse_id: outlets.find((o) => o.is_warehouse)?.id || "",
        shipping_charge: "",
        center_charge: "",
        items: (po.items || []).map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          cost_price: costForProductSupplier(it.product_id, defaultSupplier),
          warehouse_stock: it.warehouse_stock,
        })),
      });
    }
  };

  const onApproveSupplierChange = (supplierId) => {
    setApproveForm((f) => ({
      ...f,
      supplier_id: supplierId,
      items: f.items.map((it) => ({
        ...it,
        cost_price: costForProductSupplier(it.product_id, supplierId),
      })),
    }));
  };

  const submitApprove = async () => {
    try {
      await api.put(`/purchase-orders/${approvePo.id}/approve`, {
        fulfillment_source: approveForm.fulfillment_source,
        supplier_id: approveForm.fulfillment_source === "supplier" ? approveForm.supplier_id : null,
        fulfill_outlet_id: approveForm.fulfill_outlet_id,
        warehouse_id: approveForm.fulfillment_source === "warehouse"
          ? (approveForm.warehouse_id || centralWarehouse?.id)
          : null,
        shipping_charge: Number(approveForm.shipping_charge || 0),
        center_charge: Number(approveForm.center_charge || 0),
        items: approveForm.items.map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
          cost_price: Number(i.cost_price),
        })),
      });
      toast.success(
        approveForm.fulfillment_source === "warehouse"
          ? "Approved — stock transferred from warehouse; outlet charged, warehouse fees recorded"
          : "Approved — stock assigned and expense recorded",
      );
      setApprovePo(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const updateApproveItem = (idx, field, value) => {
    const items = [...approveForm.items];
    items[idx] = { ...items[idx], [field]: value };
    setApproveForm({ ...approveForm, items });
  };

  const pendingRequests = pos.filter((p) => p.status === "pending_approval");

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={isOwner ? "Purchase Orders & Stock Requests" : "Stock Requests"}
        description={
          isOwner
            ? `${pendingRequests.length} pending approval · ${pos.length} total`
            : `${pos.length} requests — awaiting owner approval`
        }
        actions={isOwner && (
          <Button onClick={() => { setForm({ supplier_id: "", outlet_id: defaultDeliverOutlet(), items: [], note: "" }); setShowDialog(true); }} data-testid="po-new">
            <Plus size={14} className="mr-1.5" />New supplier PO
          </Button>
        )}
      />

      {isOwner && pendingRequests.length > 0 && (
        <div className="card-modern p-4 border-warning/30 bg-warning/5">
          <div className="font-semibold text-warning mb-2">{pendingRequests.length} outlet stock request(s) need approval</div>
          <p className="text-sm text-muted-foreground">Assign supplier, set costs, and choose which outlet receives the stock.</p>
        </div>
      )}

      {pos.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description={isOwner ? "Create a supplier PO or wait for outlet stock requests." : "Use Inventory → Request Stock to ask the owner for stock."}
        />
      ) : (
        <div className="card-modern overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">From / Supplier</th>
                <th className="text-left p-4">Outlet</th>
                <th className="text-left p-4">Items</th>
                <th className="text-right p-4">Total</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">When</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="p-4">
                    <Badge variant={p.po_type === "stock_request" ? "primary" : p.po_type === "stock_in" ? "success" : "outline"}>
                      {p.po_type === "stock_request" ? "Stock request" : p.po_type === "stock_in" ? "Stock In" : "Supplier PO"}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">
                      {p.fulfillment_source === "warehouse"
                        ? (p.warehouse_name || "Central Warehouse")
                        : p.po_type === "stock_request"
                          ? p.requested_by_name
                          : p.po_type === "stock_in"
                            ? "Owner stock-in"
                            : p.supplier_name}
                    </div>
                    {p.po_type === "stock_request" && p.status === "pending_approval" && (
                      <div className="text-xs text-muted-foreground">Requested by outlet manager</div>
                    )}
                    {p.fulfillment_source === "warehouse" && p.status === "received" && (
                      <div className="text-xs text-muted-foreground">Fulfilled from warehouse</div>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {p.fulfill_outlet_name || p.requested_outlet_name || p.outlet_name || "—"}
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{p.items?.length || 0}</div>
                    {p.items?.length > 0 && (
                      <div className="text-xs text-muted-foreground max-w-[200px] truncate" title={p.items.map((i) => i.product_name).join(", ")}>
                        {p.items.map((i) => i.product_name).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right font-mono">{formatCurrency(p.total, currency)}</td>
                  <td className="p-4">
                    <Badge variant={statusVariant[p.status] || "outline"}>{p.status?.replace("_", " ")}</Badge>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(p.created_at)}</td>
                  <td className="p-4 text-right whitespace-nowrap">
                    {isOwner && p.status === "pending_approval" && (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" onClick={() => openApprove(p)}><Check size={14} className="mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => rejectRequest(p)}><X size={14} /></Button>
                      </div>
                    )}
                    {isOwner && p.status === "pending" && p.po_type === "direct" && (
                      <Button size="sm" onClick={() => markReceived(p)} data-testid={`po-receive-${p.id}`}>
                        <Check size={14} className="mr-1" />Receive
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Owner: direct supplier PO */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New supplier purchase order</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Buy from supplier — cost posts to Expenses when you mark received.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger data-testid="po-supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deliver to outlet / warehouse</Label>
              <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                <SelectTrigger data-testid="po-outlet"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{outletLabel(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t border-border pt-3 mt-2">
            <div className="uppercase-label mb-2">Items</div>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <Select value={itemForm.product_id} onValueChange={(v) => {
                const pr = products.find((x) => x.id === v);
                setItemForm({ ...itemForm, product_id: v, cost_price: pr?.cost_price || 0 });
              }}>
                <SelectTrigger className="col-span-6"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>{products.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Qty" className="col-span-2" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
              <Input type="number" placeholder="Cost" className="col-span-3" value={itemForm.cost_price} onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })} />
              <Button size="sm" onClick={addItem} className="col-span-1"><Plus size={14} /></Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {form.items.map((it, i) => {
                const pr = products.find((x) => x.id === it.product_id);
                return (
                  <div key={i} className="flex items-center justify-between text-sm p-2 border border-border rounded">
                    <span>{pr?.name} × {it.quantity}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatCurrency(it.quantity * it.cost_price, currency)}</span>
                      <button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })}><Trash2 size={12} className="text-destructive" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.supplier_id || !form.outlet_id || form.items.length === 0}>Create PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner: approve stock request */}
      <Dialog open={!!approvePo} onOpenChange={() => setApprovePo(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Approve stock request</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            From: <strong>{approvePo?.requested_by_name}</strong> · Outlet: <strong>{approvePo?.requested_outlet_name}</strong>
          </p>
          <div className="flex gap-2 p-1 bg-secondary/50 rounded-lg w-fit">
            <Button
              type="button"
              size="sm"
              variant={approveForm.fulfillment_source === "supplier" ? "default" : "ghost"}
              onClick={() => setApproveForm({ ...approveForm, fulfillment_source: "supplier" })}
            >
              Buy from supplier
            </Button>
            <Button
              type="button"
              size="sm"
              variant={approveForm.fulfillment_source === "warehouse" ? "default" : "ghost"}
              disabled={!centralWarehouse}
              onClick={() => setApproveForm({
                ...approveForm,
                fulfillment_source: "warehouse",
                items: approveForm.items.map((it) => {
                  const pr = products.find((p) => p.id === it.product_id);
                  return { ...it, cost_price: pr?.cost_price ?? it.cost_price };
                }),
              })}
            >
              From central warehouse
            </Button>
          </div>
          {!centralWarehouse && (
            <p className="text-xs text-warning">Set up a central warehouse under Outlets to fulfill from existing stock.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {approveForm.fulfillment_source === "supplier" ? (
              <div>
                <Label>Supplier</Label>
                <Select value={approveForm.supplier_id} onValueChange={onApproveSupplierChange}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Source warehouse</Label>
                <Select
                  value={approveForm.warehouse_id || centralWarehouse?.id || ""}
                  onValueChange={(v) => setApproveForm({ ...approveForm, warehouse_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Central warehouse" /></SelectTrigger>
                  <SelectContent>
                    {outlets.filter((o) => o.is_warehouse).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{outletLabel(o)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Stock is deducted from warehouse inventory</p>
              </div>
            )}
            <div>
              <Label>Deliver to retail outlet</Label>
              <Select value={approveForm.fulfill_outlet_id} onValueChange={(v) => setApproveForm({ ...approveForm, fulfill_outlet_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{retailOutlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Inventory & goods expense posts to this outlet</p>
            </div>
          </div>

          {approveForm.fulfillment_source === "warehouse" && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-secondary/20">
              <div>
                <Label>Shipping charge</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={approveForm.shipping_charge}
                  onChange={(e) => setApproveForm({ ...approveForm, shipping_charge: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Center warehouse charge</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={approveForm.center_charge}
                  onChange={(e) => setApproveForm({ ...approveForm, center_charge: e.target.value })}
                  placeholder="0"
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Fees are charged to the outlet as expense and recorded as revenue (profit) for {centralWarehouse?.name || "the warehouse"}.
              </p>
            </div>
          )}

          <div className="space-y-2 mt-4">
            <Label>
              Items — edit quantities &amp; transfer cost
              {approveForm.fulfillment_source === "warehouse" ? " (warehouse stock shown)" : " (posts to Expenses)"}
            </Label>
            {approveForm.items.map((it, i) => {
              const pr = products.find((p) => p.id === it.product_id);
              const lowStock = approveForm.fulfillment_source === "warehouse"
                && it.warehouse_stock != null
                && Number(it.quantity) > Number(it.warehouse_stock);
              return (
                <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 border rounded ${lowStock ? "border-destructive/50 bg-destructive/5" : ""}`}>
                  <div className="col-span-5 text-sm">
                    <div>{it.product_name || pr?.name || it.product_id}</div>
                    {approveForm.fulfillment_source === "warehouse" && it.warehouse_stock != null && (
                      <div className={`text-xs ${lowStock ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        Warehouse: {it.warehouse_stock} available
                      </div>
                    )}
                  </div>
                  <Input type="number" className="col-span-2" value={it.quantity} onChange={(e) => updateApproveItem(i, "quantity", e.target.value)} />
                  <Input type="number" className="col-span-3" placeholder="Cost/unit" value={it.cost_price} onChange={(e) => updateApproveItem(i, "cost_price", e.target.value)} />
                  <span className="col-span-2 text-right font-mono text-sm">{formatCurrency(it.quantity * it.cost_price, currency)}</span>
                </div>
              );
            })}
            <div className="text-right space-y-1 text-sm">
              <div>Goods: <span className="font-mono font-semibold">{formatCurrency(approveGoodsTotal, currency)}</span></div>
              {approveForm.fulfillment_source === "warehouse" && approveFeesTotal > 0 && (
                <div className="text-muted-foreground">
                  + Fees (outlet expense / warehouse revenue): <span className="font-mono">{formatCurrency(approveFeesTotal, currency)}</span>
                </div>
              )}
              <div className="font-semibold">
                Outlet total: {formatCurrency(approveGoodsTotal + (approveForm.fulfillment_source === "warehouse" ? approveFeesTotal : 0), currency)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovePo(null)}>Cancel</Button>
            <Button
              onClick={submitApprove}
              disabled={
                !approveForm.fulfill_outlet_id
                || (approveForm.fulfillment_source === "supplier" && !approveForm.supplier_id)
                || (approveForm.fulfillment_source === "warehouse" && !approveForm.warehouse_id && !centralWarehouse?.id)
              }
            >
              Approve & assign stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
