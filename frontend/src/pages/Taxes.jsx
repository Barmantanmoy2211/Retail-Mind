import React, { useEffect, useState } from "react";
import api from "@/lib/api";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Taxes() {
  const [items, setItems] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", rate: "", type: "CGST" });

  const load = async () => {
    const { data } = await api.get("/taxes/configs");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/taxes/configs", { ...form, rate: Number(form.rate) });
      toast.success("Tax added");
      setShowDialog(false);
      setForm({ name: "", rate: "", type: "CGST" });
      load();
    } catch (e) {
      toast.error("Failed");
    }
  };

  const remove = async (id) => {
    await api.delete(`/taxes/configs/${id}`);
    load();
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-3xl">
      <PageHeader
        title="Tax Setup"
        description="Configure tax slabs used in product pricing."
        actions={<Button onClick={() => setShowDialog(true)} data-testid="tax-new"><Plus size={14} className="mr-1.5" />Add tax</Button>}
      />

      {items.length === 0 ? <EmptyState title="No tax configs" /> : (
        <div className="card-modern overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Name</th>
                <th className="text-left p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Type</th>
                <th className="text-right p-4 uppercase text-[10px] tracking-wider text-muted-foreground">Rate</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="p-4 font-medium">{t.name}</td>
                  <td className="p-4"><Badge variant="primary">{t.type}</Badge></td>
                  <td className="p-4 text-right font-mono">{t.rate}%</td>
                  <td className="p-4 text-right"><Button variant="ghost" size="sm" onClick={() => remove(t.id)} data-testid={`tax-del-${t.id}`}><Trash2 size={14} className="text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New tax config</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="tax-name" placeholder="e.g. CGST 9%" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="tax-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CGST">CGST</SelectItem>
                  <SelectItem value="SGST">SGST</SelectItem>
                  <SelectItem value="IGST">IGST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Rate (%)</Label><Input type="number" step="0.1" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} data-testid="tax-rate" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} data-testid="tax-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
