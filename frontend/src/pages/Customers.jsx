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
import { Search, Plus, Phone, Award, Download, MapPin, Eye } from "lucide-react";
import { toast } from "sonner";
import CustomerLocationField from "@/components/CustomerLocationField";

export default function Customers() {
  const { user, business, outlet } = useAuth();
  const currency = business?.currency || "INR";
  const isOutletScoped = ["outlet_manager", "cashier"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", location: "" });
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (isOutletScoped && user?.outlet_id) params.set("outlet_id", user.outlet_id);
    const qs = params.toString();
    const { data } = await api.get(`/customers${qs ? `?${qs}` : ""}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [q, user?.outlet_id]);

  const openNewDialog = () => {
    setForm({
      name: "", phone: "", email: "", address: "",
      location: isOutletScoped ? (outlet?.name || "") : "",
    });
    setShowDialog(true);
  };

  const save = async () => {
    if (!form.name || !form.phone) {
      toast.error("Name and phone are required");
      return;
    }
    if (user?.role === "business_admin" && !form.location) {
      toast.error("Please select an outlet for location");
      return;
    }
    try {
      const payload = { name: form.name, phone: form.phone };
      if (form.email) payload.email = form.email;
      if (form.address) payload.address = form.address;
      if (form.location) payload.location = form.location;
      await api.post("/customers", payload);
      toast.success("Customer added");
      setShowDialog(false);
      setForm({ name: "", phone: "", email: "", address: "", location: "" });
      load();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to add customer");
    }
  };

  const showDetail = async (c) => {
    const { data } = await api.get(`/customers/${c.id}`);
    setDetail(data);
  };

  const purchases = (c) => (isOutletScoped ? c.outlet_purchases : c.total_purchases) || 0;
  const spent = (c) => (isOutletScoped ? c.outlet_spent : c.total_spent) || 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Customers"
        description={
          isOutletScoped
            ? `${items.length} customers at your outlet (registered, located here, or purchased here).`
            : `${items.length} customers in your CRM.`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => {
              const token = localStorage.getItem("token");
              const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/exports/customers.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
              const blob = await res.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `customers-${Date.now()}.xlsx`;
              a.click();
            }} data-testid="cust-export"><Download size={14} className="mr-1.5" />Excel</Button>
            <Button onClick={openNewDialog} data-testid="cust-new"><Plus size={14} className="mr-1.5" />Add Customer</Button>
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, phone, email or location..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" data-testid="cust-search-input" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={isOutletScoped ? "No outlet customers yet" : "No customers yet"}
          description={isOutletScoped ? "Customers appear here after they place an order at your outlet." : "They'll be added automatically as you bill them."}
        />
      ) : (
        <div className="card-modern overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Phone</th>
                <th className="text-left p-4">Location</th>
                <th className="text-right p-4">Purchases</th>
                <th className="text-right p-4">Total spent</th>
                <th className="text-right p-4">Points</th>
                <th className="p-4 w-12" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer"
                  onClick={() => showDetail(c)}
                  data-testid={`cust-row-${c.id}`}
                >
                  <td className="p-4 font-medium">{c.name}</td>
                  <td className="p-4 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Phone size={12} />{c.phone}</span>
                  </td>
                  <td className="p-4 text-muted-foreground max-w-[200px]">
                    {c.location || c.address ? (
                      <span className="inline-flex items-center gap-1.5 truncate" title={c.location || c.address}>
                        <MapPin size={12} className="shrink-0" />
                        {c.location || c.address}
                      </span>
                    ) : (
                      <span className="text-xs italic">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right font-mono">{purchases(c)}</td>
                  <td className="p-4 text-right font-mono">{formatCurrency(spent(c), currency)}</td>
                  <td className="p-4 text-right">
                    <Badge variant="primary"><Award size={10} className="mr-1" />{c.reward_balance || 0}</Badge>
                  </td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); showDetail(c); }}>
                      <Eye size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="cust-form-name" /></div>
            <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="cust-form-phone" /></div>
            <CustomerLocationField
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v })}
              testId="cust-form-location"
            />
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Full address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="cust-form-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {(detail.location || detail.address) && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <div>
                    {detail.location && <div className="font-medium text-foreground">{detail.location}</div>}
                    {detail.address && <div>{detail.address}</div>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">{isOutletScoped ? "Outlet bills" : "Bills"}</div>
                  <div className="text-2xl font-display font-bold mt-1">
                    {isOutletScoped ? detail.outlet_purchases : detail.total_purchases || 0}
                  </div>
                </div>
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">Spent</div>
                  <div className="text-2xl font-display font-bold mt-1">
                    {formatCurrency(isOutletScoped ? detail.outlet_spent : detail.total_spent || 0, currency)}
                  </div>
                </div>
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">Points</div>
                  <div className="text-2xl font-display font-bold mt-1 text-primary">{detail.reward_balance || 0}</div>
                </div>
              </div>
              <div>
                <h4 className="font-display font-semibold mb-2 text-sm">Recent bills</h4>
                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {detail.bills?.length > 0 ? detail.bills.slice(0, 10).map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-sm p-2 border border-border rounded">
                      <div>
                        <div className="font-mono text-xs">{b.bill_no}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(b.created_at)}</div>
                      </div>
                      <div className="font-mono font-medium">{formatCurrency(b.total, currency)}</div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No bills yet</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
