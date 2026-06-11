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
import { Search, Plus, Eye, Phone, Mail, Award } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const { business } = useAuth();
  const currency = business?.currency || "INR";
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const { data } = await api.get(`/customers${q ? `?search=${q}` : ""}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [q]);

  const save = async () => {
    try {
      await api.post("/customers", form);
      toast.success("Customer added");
      setShowDialog(false);
      setForm({ name: "", phone: "", email: "", address: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const showDetail = async (c) => {
    const { data } = await api.get(`/customers/${c.id}`);
    setDetail(data);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Customers"
        description={`${items.length} customers in your CRM.`}
        actions={<Button onClick={() => setShowDialog(true)} data-testid="cust-new"><Plus size={14} className="mr-1.5" />Add Customer</Button>}
      />

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, phone or email..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" data-testid="cust-search-input" />
      </div>

      {items.length === 0 ? (
        <EmptyState title="No customers yet" description="They'll be added automatically as you bill them." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(c => (
            <div key={c.id} className="card-modern p-5 cursor-pointer" onClick={() => showDetail(c)} data-testid={`cust-card-${c.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Phone size={11} />{c.phone}</div>
                  {c.email && <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5"><Mail size={11} />{c.email}</div>}
                </div>
                <Badge variant="primary"><Award size={10} className="mr-1" />{c.reward_balance || 0}</Badge>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                <span>{c.total_purchases || 0} purchases</span>
                <span className="font-mono">{formatCurrency(c.total_spent || 0, currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="cust-form-name" /></div>
            <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="cust-form-phone" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">Bills</div>
                  <div className="text-2xl font-display font-bold mt-1">{detail.total_purchases || 0}</div>
                </div>
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">Spent</div>
                  <div className="text-2xl font-display font-bold mt-1">{formatCurrency(detail.total_spent || 0, currency)}</div>
                </div>
                <div className="card-modern p-4 text-center">
                  <div className="uppercase-label">Points</div>
                  <div className="text-2xl font-display font-bold mt-1 text-primary">{detail.reward_balance || 0}</div>
                </div>
              </div>
              <div>
                <h4 className="font-display font-semibold mb-2 text-sm">Recent bills</h4>
                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {detail.bills?.length > 0 ? detail.bills.slice(0, 10).map(b => (
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
