import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

const businessTypes = [
  "Grocery Store", "Restaurant", "Footwear Store", "Clothing Store",
  "Electronics Store", "Pharmacy", "Hardware Store", "Wholesale", "Service Business", "Other",
];

const plans = [
  { id: "starter", name: "Starter", price: "₹999/mo", outlets: "1 outlet" },
  { id: "growth", name: "Growth", price: "₹2,999/mo", outlets: "5 outlets" },
  { id: "enterprise", name: "Enterprise", price: "₹9,999/mo", outlets: "Unlimited" },
];

export default function Register() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [form, setForm] = useState({
    business_name: "",
    business_type: "Grocery Store",
    owner_name: "",
    email: "",
    phone: "",
    password: "",
    plan: sp.get("plan") || "starter",
  });
  const [loading, setLoading] = useState(false);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/register-business", form);
      toast.success("Registration submitted! Awaiting platform admin approval.");
      navigate("/pending-approval");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 px-6 md:px-12 lg:px-20 py-12 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-10" data-testid="register-back">
            <ArrowLeft size={14} /> Back to home
          </Link>

          <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Start your free trial</h1>
          <p className="text-muted-foreground mb-10">No credit card needed. Approval typically within minutes.</p>

          <form onSubmit={submit} className="space-y-8">
            <div>
              <div className="uppercase-label mb-4">Pick a plan</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => update("plan", p.id)}
                    data-testid={`plan-${p.id}`}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      form.plan === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display font-semibold">{p.name}</span>
                      {form.plan === p.id && <Check size={16} className="text-primary" />}
                    </div>
                    <div className="text-xl font-display font-bold">{p.price}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.outlets}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="uppercase-label">Business details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Business Name</Label>
                  <Input
                    value={form.business_name}
                    onChange={(e) => update("business_name", e.target.value)}
                    required
                    data-testid="reg-business-name"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Business Type</Label>
                  <Select value={form.business_type} onValueChange={(v) => update("business_type", v)}>
                    <SelectTrigger className="mt-1.5 h-11" data-testid="reg-business-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="uppercase-label pt-2">Your details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Owner Name</Label>
                  <Input
                    value={form.owner_name}
                    onChange={(e) => update("owner_name", e.target.value)}
                    required
                    data-testid="reg-owner-name"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    required
                    data-testid="reg-phone"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                    data-testid="reg-email"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    required
                    minLength={6}
                    data-testid="reg-password"
                    className="mt-1.5 h-11"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} data-testid="reg-submit" className="w-full h-12 text-base">
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Submit for approval"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              By registering you agree to our terms. No payment is required until your subscription is approved.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
