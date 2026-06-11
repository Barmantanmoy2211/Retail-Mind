import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Badge } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phase2Banner } from "@/components/SharedUI";
import { Save, Cloud, FileText, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";

export default function Settings() {
  const { business, user, refresh } = useAuth();
  const [form, setForm] = useState({
    business_name: business?.business_name || "",
    business_type: business?.business_type || "",
    phone: business?.phone || "",
    address: business?.address || "",
    gst_number: business?.gst_number || "",
    currency: business?.currency || "INR",
  });

  useEffect(() => {
    if (business) {
      setForm({
        business_name: business.business_name || "",
        business_type: business.business_type || "",
        phone: business.phone || "",
        address: business.address || "",
        gst_number: business.gst_number || "",
        currency: business.currency || "INR",
      });
    }
  }, [business]);

  const save = async () => {
    try {
      await api.put("/business/me", form);
      toast.success("Settings saved");
      refresh();
    } catch (e) {
      toast.error("Failed");
    }
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <PageHeader title="Settings" description="Configure your business preferences." />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">Business Profile</TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-sub">Subscription</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-int">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <div className="card-modern p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Business Name</Label><Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} data-testid="set-biz-name" /></div>
              <div><Label>Business Type</Label><Input value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>GST Number</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} data-testid="set-gst" /></div>
            </div>
            <Button onClick={save} data-testid="set-save"><Save size={14} className="mr-1.5" />Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="mt-6">
          <div className="card-modern p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="uppercase-label">Current Plan</div>
                <h3 className="text-3xl font-display font-bold capitalize mt-1">{business?.plan}</h3>
              </div>
              <Badge variant={business?.subscription_status === "approved" ? "success" : "warning"}>
                {business?.subscription_status}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div>
                <div className="uppercase-label">Outlets allowed</div>
                <div className="text-xl font-display font-bold mt-1">{business?.outlet_limit}</div>
              </div>
              <div>
                <div className="uppercase-label">Monthly price</div>
                <div className="text-xl font-display font-bold mt-1">₹{business?.plan_price}</div>
              </div>
              <div>
                <div className="uppercase-label">Approved on</div>
                <div className="text-sm mt-1">{business?.approved_at ? new Date(business.approved_at).toLocaleDateString() : "—"}</div>
              </div>
            </div>
            <div className="mt-6 text-sm text-muted-foreground bg-secondary/30 rounded-lg p-4">
              Need to upgrade or change plan? Contact your platform administrator.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Phase2Banner feature="WhatsApp Cloud API" />
            <Phase2Banner feature="PDF Invoice Generation" />
          </div>
          <div className="card-modern p-6 bg-success/5 border-success/30">
            <div className="flex items-start gap-3">
              <Sparkles className="text-success mt-0.5" size={20} />
              <div>
                <h3 className="font-display font-semibold">Now live ✨</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI Outlet Health Score · AWS S3 product image uploads · Excel exports · Command palette (Cmd/Ctrl + K)
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
