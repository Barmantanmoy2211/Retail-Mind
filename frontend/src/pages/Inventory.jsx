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
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, MoveRight, Settings2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

export default function Inventory() {
  const { user } = useAuth();
  const isOwner = user?.role === "business_admin";
  const userOutletId = user?.outlet_id;
  const [txns, setTxns] = useState([]);
  const [low, setLow] = useState([]);
  const [summary, setSummary] = useState({ products: [], outlets: [], totals_by_outlet: {}, grand_total: 0 });
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filterOutlet, setFilterOutlet] = useState("");
  const [show, setShow] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const [form, setForm] = useState({
    product_id: "", outlet_id: "", quantity: "", to_outlet_id: "", note: "",
    supplier_id: "", cost_price: "",
  });
  const [requestItems, setRequestItems] = useState([]);
  const [requestItem, setRequestItem] = useState({ product_id: "", quantity: 1 });
  const [requestNote, setRequestNote] = useState("");

  const load = async () => {
    const outletQ = filterOutlet ? `?outlet_id=${filterOutlet}` : "";
    const productQ = filterOutlet && !isOwner
      ? `?outlet_id=${filterOutlet}&approved_only=true`
      : userOutletId && !isOwner
        ? `?outlet_id=${userOutletId}&approved_only=true`
        : "?approved_only=true";
    const summaryQ = filterOutlet ? `?outlet_id=${filterOutlet}` : "";
    const requests = [
      api.get(`/inventory/transactions${outletQ}`),
      api.get(`/inventory/low-stock${outletQ}`),
      api.get(`/products${productQ}`),
      api.get("/outlets?active_only=true"),
      api.get(`/inventory/summary${summaryQ}`),
    ];
    if (isOwner) requests.push(api.get("/suppliers"));
    const results = await Promise.all(requests);
    const [t, l, p, o, s, sup] = results;
    setTxns(t.data);
    setLow(l.data);
    setProducts(p.data);
    setOutlets(o.data);
    setSummary(s.data);
    if (sup) setSuppliers(sup.data);
    if (!form.outlet_id) {
      const defaultOutlet = userOutletId || o.data[0]?.id || "";
      setForm((f) => ({ ...f, outlet_id: defaultOutlet }));
    }
  };
  useEffect(() => { load(); }, [filterOutlet]);

  const onProductPick = (productId) => {
    const pr = products.find((x) => x.id === productId);
    setForm({
      ...form,
      product_id: productId,
      cost_price: pr?.cost_price != null ? String(pr.cost_price) : "",
      supplier_id: pr?.supplier_ids?.[0] || form.supplier_id || "",
    });
  };

  const submit = async () => {
    try {
      const payload = {
        type: show,
        product_id: form.product_id,
        outlet_id: form.outlet_id,
        quantity: Number(form.quantity),
        to_outlet_id: form.to_outlet_id || null,
        note: form.note,
      };
      if (show === "stock_in" && isOwner) {
        payload.supplier_id = form.supplier_id;
        payload.cost_price = Number(form.cost_price || 0);
      }
      const res = await api.post("/inventory/transactions", payload);
      if (res.data?.purchase_order_id) {
        toast.success("Stock added — purchase order created & approved");
      } else {
        toast.success("Done");
      }
      setShow(null);
      setForm({
        product_id: "", outlet_id: userOutletId || form.outlet_id || "", quantity: "",
        to_outlet_id: "", note: "", supplier_id: "", cost_price: "",
      });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const outletDisplayName = (o) => (o.is_warehouse ? `${o.name} (Warehouse)` : o.name);

  const buildRequestItems = () => {
    const items = [...requestItems];
    if (requestItem.product_id) {
      const qty = Number(requestItem.quantity) || 1;
      const idx = items.findIndex((i) => i.product_id === requestItem.product_id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], quantity: items[idx].quantity + qty };
      } else {
        items.push({ product_id: requestItem.product_id, quantity: qty });
      }
    }
    return items;
  };

  const addRequestItem = () => {
    if (!requestItem.product_id) return;
    const qty = Number(requestItem.quantity) || 1;
    const idx = requestItems.findIndex((i) => i.product_id === requestItem.product_id);
    if (idx >= 0) {
      const next = [...requestItems];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
      setRequestItems(next);
    } else {
      setRequestItems([...requestItems, { product_id: requestItem.product_id, quantity: qty }]);
    }
    setRequestItem({ product_id: "", quantity: 1 });
    toast.success("Product added to request");
  };

  const submitStockRequest = async () => {
    const items = buildRequestItems();
    if (items.length === 0) {
      toast.error("Add at least one product to the request");
      return;
    }
    try {
      const res = await api.post("/purchase-orders/stock-request", { items, note: requestNote });
      toast.success(`Stock request sent (${res.data?.item_count || items.length} products)`);
      setShowRequest(false);
      setRequestItems([]);
      setRequestItem({ product_id: "", quantity: 1 });
      setRequestNote("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const typeBadge = { stock_in: "success", stock_out: "warning", sale: "primary", transfer: "primary", adjustment: "outline" };
  const outletLabel = isOwner
    ? (filterOutlet ? outlets.find((o) => o.id === filterOutlet)?.name : "All outlets")
    : outlets.find((o) => o.id === userOutletId)?.name || "Your outlet";

  return (
    <div className="space-y-6 animate-fade-up">
      {isOwner && outlets.length > 1 && (
        <Select value={filterOutlet || "all"} onValueChange={(v) => setFilterOutlet(v === "all" ? "" : v)}>
          <SelectTrigger className="md:w-56 h-10" data-testid="inv-filter-outlet">
            <SelectValue placeholder="All outlets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outlets</SelectItem>
            {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{outletDisplayName(o)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <PageHeader
        title="Inventory"
        description={
          isOwner
            ? `${summary.grand_total || 0} total units · ${outletLabel} · ${low.length} low-stock alerts`
            : `${summary.grand_total || 0} units at ${outletLabel} · ${low.length} low-stock alerts`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {!isOwner && (
              <Button onClick={() => setShowRequest(true)} data-testid="inv-request">
                <PackagePlus size={14} className="mr-1.5" />Request Stock
              </Button>
            )}
            {isOwner && (
              <>
                <Button variant="outline" onClick={() => setShow("stock_in")} data-testid="inv-in">
                  <ArrowDownToLine size={14} className="mr-1.5" />Stock In
                </Button>
                <Button variant="outline" onClick={() => setShow("transfer")} data-testid="inv-transfer">
                  <MoveRight size={14} className="mr-1.5" />Transfer
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setShow("stock_out")} data-testid="inv-out">
              <ArrowUpFromLine size={14} className="mr-1.5" />Stock Out
            </Button>
            <Button variant="outline" onClick={() => setShow("adjustment")} data-testid="inv-adjust">
              <Settings2 size={14} className="mr-1.5" />Adjust
            </Button>
          </div>
        }
      />

      {isOwner && summary.outlets?.length > 1 && !filterOutlet && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summary.outlets.map((o) => (
            <div key={o.id} className="card-modern p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{o.name}</div>
              <div className="text-2xl font-bold mt-1">{summary.totals_by_outlet?.[o.id] || 0}</div>
              <div className="text-xs text-muted-foreground">total units</div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock" data-testid="tab-stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-txns">Transactions</TabsTrigger>
          <TabsTrigger value="low" data-testid="tab-low">
            Low Stock <Badge variant="destructive" className="ml-2">{low.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          {summary.products?.length === 0 ? (
            <EmptyState title="No stock data" />
          ) : (
            <div className="card-modern overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-secondary/30">
                  <tr className="border-b border-border">
                    <th className="text-left p-4">Product</th>
                    {summary.outlets?.map((o) => (
                      <th key={o.id} className="text-right p-4">{o.name}</th>
                    ))}
                    {isOwner && summary.outlets?.length > 1 && (
                      <th className="text-right p-4 font-semibold">Total</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {summary.products.map((row) => (
                    <tr key={row.product_id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="p-4 font-medium">{row.product_name}</td>
                      {summary.outlets?.map((o) => {
                        const qty = row.outlet_stocks?.[o.id] || 0;
                        const low = qty <= (row.min_stock || 0);
                        return (
                          <td key={o.id} className={`p-4 text-right font-mono ${low ? "text-warning font-bold" : ""}`}>
                            {qty}
                          </td>
                        );
                      })}
                      {isOwner && summary.outlets?.length > 1 && (
                        <td className="p-4 text-right font-mono font-semibold">{row.total_stock}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          {txns.length === 0 ? <EmptyState title="No transactions yet" /> : (
            <div className="card-modern overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30">
                  <tr className="border-b border-border">
                    <th className="text-left p-4">Type</th>
                    <th className="text-left p-4">Product</th>
                    <th className="text-right p-4">Qty</th>
                    <th className="text-left p-4">When</th>
                    <th className="text-left p-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
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
          {low.length === 0 ? <EmptyState title="No low stock items" description="Everything's healthy" /> : (
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

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Request stock from business owner</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Creates a purchase request. Owner will approve, assign supplier, and deliver stock to your outlet (or another outlet).</p>
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-2">
              <Select value={requestItem.product_id} onValueChange={(v) => setRequestItem({ ...requestItem, product_id: v })}>
                <SelectTrigger className="col-span-8"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" className="col-span-3" min="1" value={requestItem.quantity} onChange={(e) => setRequestItem({ ...requestItem, quantity: e.target.value })} />
              <Button type="button" size="sm" className="col-span-1" onClick={addRequestItem} title="Add to list"><PackagePlus size={14} /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Click + to add each product, or submit — the selected product will be included automatically.</p>
            {requestItems.map((it, i) => {
              const p = products.find((x) => x.id === it.product_id);
              return (
                <div key={i} className="flex justify-between text-sm p-2 border rounded">
                  <span>{p?.name} × {it.quantity}</span>
                  <button type="button" onClick={() => setRequestItems(requestItems.filter((_, idx) => idx !== i))}>×</button>
                </div>
              );
            })}
            <div><Label>Note</Label><Input value={requestNote} onChange={(e) => setRequestNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button onClick={submitStockRequest} disabled={requestItems.length === 0 && !requestItem.product_id}>
              Submit request ({buildRequestItems().length} product{buildRequestItems().length !== 1 ? "s" : ""})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!show} onOpenChange={() => setShow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">{show?.replace("_", " ")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product</Label>
              <Select value={form.product_id} onValueChange={onProductPick}>
                <SelectTrigger data-testid="inv-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {show === "stock_in" && isOwner && (
              <>
                <div>
                  <Label>Supplier</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger data-testid="inv-supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Creates an auto-approved purchase order in Purchase Orders.</p>
                </div>
                <div>
                  <Label>Unit cost</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    data-testid="inv-cost"
                  />
                </div>
              </>
            )}
            <div>
              <Label>{show === "transfer" ? "From Outlet" : "Outlet"}</Label>
              <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })} disabled={!isOwner && !!userOutletId}>
                <SelectTrigger data-testid="inv-outlet"><SelectValue /></SelectTrigger>
                <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{outletDisplayName(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {show === "transfer" && isOwner && (
              <div>
                <Label>To Outlet</Label>
                <Select value={form.to_outlet_id} onValueChange={(v) => setForm({ ...form, to_outlet_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {outlets.filter((o) => o.id !== form.outlet_id).map((o) => <SelectItem key={o.id} value={o.id}>{outletDisplayName(o)}</SelectItem>)}
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
            <Button
              onClick={submit}
              data-testid="inv-submit"
              disabled={show === "stock_in" && isOwner && (!form.supplier_id || !form.cost_price)}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
