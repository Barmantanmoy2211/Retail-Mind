import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Truck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Suppliers() {
  const [items, setItems] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", email: "", gst_number: "", address: "" });

  const load = async () => {
    const { data } = await api.get("/suppliers");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/suppliers", form);
      toast.success("Supplier added");
      setShowDialog(false);
      setForm({ name: "", contact: "", email: "", gst_number: "", address: "" });
      load();
    } catch (e) {
      toast.error("Failed");
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.name}?`)) return;
    await api.delete(`/suppliers/${s.id}`);
    load();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Suppliers"
        description={`${items.length} suppliers.`}
        actions={<Button onClick={() => setShowDialog(true)} data-testid="sup-new"><Plus size={14} className="mr-1.5" />Add Supplier</Button>}
      />

      {items.length === 0 ? <EmptyState title="No suppliers" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(s => (
            <div key={s.id} className="card-modern p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Truck size={18} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(s)}><Trash2 size={14} className="text-destructive" /></Button>
              </div>
              <div className="font-display font-semibold">{s.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.contact}</div>
              {s.gst_number && <div className="text-xs text-muted-foreground mt-1">GST: <span className="font-mono">{s.gst_number}</span></div>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="sup-name" /></div>
            <div><Label>Contact *</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} data-testid="sup-contact" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>GST Number</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="sup-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
