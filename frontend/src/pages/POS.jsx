import React, { useEffect, useState, useMemo } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, User, X,
  Receipt, Check, ScanBarcode,
} from "lucide-react";
import { Badge } from "@/components/SharedUI";

export default function POS() {
  const { user, business } = useAuth();
  const currency = business?.currency || "INR";
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState(user?.outlet_id || "");
  const [cart, setCart] = useState([]); // {product, quantity, discount}
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [customer, setCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [redeemPts, setRedeemPts] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastBill, setLastBill] = useState(null);

  const load = async () => {
    const [pr, ou] = await Promise.all([
      api.get("/products"),
      api.get("/outlets"),
    ]);
    setProducts(pr.data);
    setOutlets(ou.data);
    if (!outletId && ou.data.length > 0) setOutletId(ou.data[0].id);
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (category !== "all" && p.category !== category) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.barcode === search;
      }
      return true;
    });
  }, [products, search, category]);

  const addToCart = (p) => {
    const existing = cart.find(c => c.product.id === p.id);
    if (existing) {
      setCart(cart.map(c => c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { product: p, quantity: 1, discount: 0 }]);
    }
  };

  const updateQty = (pid, delta) => {
    setCart(cart.map(c => {
      if (c.product.id === pid) {
        const nq = c.quantity + delta;
        return nq <= 0 ? null : { ...c, quantity: nq };
      }
      return c;
    }).filter(Boolean));
  };

  const removeItem = (pid) => setCart(cart.filter(c => c.product.id !== pid));

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0, pointsEarned = 0;
    cart.forEach(c => {
      const lt = c.product.selling_price * c.quantity - c.discount;
      subtotal += lt;
      tax += lt * (c.product.tax_percent || 0) / 100;
      pointsEarned += (c.product.reward_points || 0) * c.quantity;
    });
    const redeemValue = (redeemPts || 0) * 1.0;
    const total = Math.max(0, subtotal + tax - billDiscount - redeemValue);
    return { subtotal, tax, pointsEarned, redeemValue, total };
  }, [cart, billDiscount, redeemPts]);

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!outletId) {
      toast.error("Select an outlet");
      return;
    }
    try {
      const { data } = await api.post("/bills", {
        outlet_id: outletId,
        customer_id: customer?.id || null,
        items: cart.map(c => ({
          product_id: c.product.id,
          quantity: c.quantity,
          discount: c.discount,
        })),
        discount_total: billDiscount,
        payment_method: paymentMethod,
        redeem_points: redeemPts || 0,
      });
      toast.success("Bill generated!");
      setLastBill(data);
      setShowInvoice(true);
      setCart([]);
      setCustomer(null);
      setRedeemPts(0);
      setBillDiscount(0);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Checkout failed");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-8rem)]">
      {/* Left - Products */}
      <div className="lg:col-span-8 flex flex-col card-modern p-4 overflow-hidden">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or scan barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
              data-testid="pos-search"
              autoFocus
            />
          </div>
          {outlets.length > 1 && user.role === "business_admin" && (
            <Select value={outletId} onValueChange={setOutletId}>
              <SelectTrigger className="md:w-48 h-11" data-testid="pos-outlet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 border-b border-border">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              data-testid={`pos-cat-${c}`}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "all" ? "All Items" : c}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(p => {
              const stock = p.stock_by_outlet?.[outletId] || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  data-testid={`pos-product-${p.id}`}
                  disabled={stock <= 0}
                  className="text-left p-3 card-modern hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="aspect-square bg-secondary rounded-md mb-2 flex items-center justify-center text-2xl font-display font-bold text-muted-foreground">
                    {p.name[0]}
                  </div>
                  <div className="font-medium text-sm line-clamp-1">{p.name}</div>
                  <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-mono text-sm font-bold">{formatCurrency(p.selling_price, currency)}</span>
                    <Badge variant={stock <= 5 ? "destructive" : "outline"}>{stock}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right - Cart */}
      <div className="lg:col-span-4 card-modern p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="uppercase-label">Current bill</div>
            <h3 className="font-display font-bold text-lg">{cart.length} item{cart.length !== 1 ? "s" : ""}</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCustomerDialog(true)} data-testid="pos-customer-btn">
            <User size={14} className="mr-1" />
            {customer ? customer.name.split(" ")[0] : "Add"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {cart.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Tap a product to add</p>
            </div>
          ) : cart.map(c => (
            <div key={c.product.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm line-clamp-1">{c.product.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{formatCurrency(c.product.selling_price, currency)} × {c.quantity}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(c.product.id, -1)} className="w-6 h-6 rounded bg-secondary hover:bg-muted flex items-center justify-center">
                  <Minus size={12} />
                </button>
                <span className="w-6 text-center text-sm font-medium">{c.quantity}</span>
                <button onClick={() => updateQty(c.product.id, 1)} className="w-6 h-6 rounded bg-secondary hover:bg-muted flex items-center justify-center">
                  <Plus size={12} />
                </button>
                <button onClick={() => removeItem(c.product.id)} className="w-6 h-6 rounded hover:bg-destructive/10 text-destructive flex items-center justify-center ml-1">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {customer && (
          <div className="p-2.5 bg-accent/30 rounded-lg mb-3 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{customer.name}</div>
              <div className="text-xs text-muted-foreground">Balance: {customer.reward_balance} pts</div>
            </div>
            <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
          </div>
        )}

        <div className="space-y-1.5 text-sm border-t border-border pt-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(totals.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-mono">{formatCurrency(totals.tax, currency)}</span></div>
          {customer && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Redeem pts</span>
              <Input
                type="number"
                value={redeemPts}
                onChange={(e) => setRedeemPts(Math.min(customer.reward_balance, Number(e.target.value) || 0))}
                className="w-20 h-7 text-right text-sm"
                data-testid="pos-redeem"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bill discount</span>
            <Input
              type="number"
              value={billDiscount}
              onChange={(e) => setBillDiscount(Number(e.target.value) || 0)}
              className="w-20 h-7 text-right text-sm"
              data-testid="pos-discount"
            />
          </div>
          <div className="flex justify-between text-base font-display font-bold pt-2 border-t border-border">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(totals.total, currency)}</span>
          </div>
        </div>

        <div className="mt-3">
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-10" data-testid="pos-payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">💵 Cash</SelectItem>
              <SelectItem value="upi">📱 UPI</SelectItem>
              <SelectItem value="card">💳 Card</SelectItem>
              <SelectItem value="wallet">📦 Wallet</SelectItem>
              <SelectItem value="split">Split Payment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={checkout}
          disabled={cart.length === 0}
          data-testid="pos-pay-btn"
          className="w-full h-12 mt-3 text-base font-display font-semibold"
        >
          <CreditCard size={16} className="mr-2" />
          Pay {formatCurrency(totals.total, currency)}
        </Button>
      </div>

      <CustomerDialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog} onSelect={(c) => { setCustomer(c); setShowCustomerDialog(false); }} />
      <InvoiceDialog open={showInvoice} onOpenChange={setShowInvoice} bill={lastBill} currency={currency} />
    </div>
  );
}

function CustomerDialog({ open, onOpenChange, onSelect }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });

  const search = async (query) => {
    const { data } = await api.get(`/customers${query ? `?search=${query}` : ""}`);
    setList(data);
  };
  useEffect(() => { if (open) search(""); }, [open]);

  const create = async () => {
    try {
      const { data } = await api.post("/customers", form);
      toast.success("Customer added");
      const c = { ...form, id: data.id, reward_balance: 0 };
      onSelect(c);
      setShowNew(false);
      setForm({ name: "", phone: "", email: "" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showNew ? "New customer" : "Select customer"}</DialogTitle>
        </DialogHeader>
        {showNew ? (
          <div className="space-y-3">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="new-cust-name" />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="new-cust-phone" />
            <Input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="new-cust-email" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Back</Button>
              <Button onClick={create} data-testid="new-cust-save">Save & select</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Search by name or phone..." value={q} onChange={(e) => { setQ(e.target.value); search(e.target.value); }} data-testid="cust-search" />
            <div className="max-h-80 overflow-y-auto space-y-2">
              {list.map(c => (
                <button key={c.id} onClick={() => onSelect(c)} data-testid={`select-cust-${c.id}`}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-secondary">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone} · {c.reward_balance} pts</div>
                </button>
              ))}
              {list.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No matches</p>}
            </div>
            <Button variant="outline" onClick={() => setShowNew(true)} className="w-full" data-testid="cust-new-btn">+ Add new customer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ open, onOpenChange, bill, currency }) {
  if (!bill) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Check className="text-success" size={20} /> Bill {bill.bill_no}</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{bill.customer_name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="capitalize">{bill.payment_method}</span></div>
          <div className="border-t border-border my-2" />
          {bill.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span className="line-clamp-1">{it.product_name} × {it.quantity}</span>
              <span className="font-mono">{formatCurrency(it.line_total, currency)}</span>
            </div>
          ))}
          <div className="border-t border-border my-2" />
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(bill.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span className="font-mono">{formatCurrency(bill.tax_total, currency)}</span></div>
          {bill.redeem_value > 0 && <div className="flex justify-between"><span>Points redeemed</span><span className="font-mono">-{formatCurrency(bill.redeem_value, currency)}</span></div>}
          <div className="flex justify-between text-lg font-display font-bold pt-2 border-t border-border">
            <span>Total</span><span className="font-mono">{formatCurrency(bill.total, currency)}</span>
          </div>
          {bill.reward_points_earned > 0 && (
            <div className="bg-success/10 text-success rounded p-2 text-xs text-center mt-3">
              🎉 {bill.reward_points_earned} reward points earned
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full" data-testid="invoice-close">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
