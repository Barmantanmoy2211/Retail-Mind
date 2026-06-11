import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ArrowRight, Sparkles, ShoppingCart, BarChart3, Users, Boxes,
  Sun, Moon, Check, Store, Receipt, Shield, Zap,
} from "lucide-react";

const features = [
  { icon: ShoppingCart, title: "Lightning POS", desc: "Sub-second billing with barcode, split payments, and printable invoices." },
  { icon: Boxes, title: "Multi-Outlet Inventory", desc: "Stock transfers, alerts, valuation across every location in real-time." },
  { icon: Users, title: "Loyalty & Rewards", desc: "Configurable points engine. Customers earn, redeem, and come back." },
  { icon: BarChart3, title: "Live P&L Analytics", desc: "Revenue, tax, expenses, profit — every outlet, every period, exportable." },
  { icon: Receipt, title: "Tax-ready Reports", desc: "CGST · SGST · IGST broken down by rate, outlet, and product." },
  { icon: Shield, title: "Bank-grade Security", desc: "JWT, RBAC, strict tenant isolation, audit log on every action." },
];

const plans = [
  { id: "starter", name: "Starter", price: "₹999", outlets: "1 Outlet", features: ["Unlimited products", "Unlimited bills", "Inventory + Customers", "Loyalty rewards", "Basic reports"] },
  { id: "growth", name: "Growth", price: "₹2,999", outlets: "5 Outlets", featured: true, features: ["Everything in Starter", "Multi-outlet sync", "Staff & roles", "Advanced reports", "Audit logs", "Priority support"] },
  { id: "enterprise", name: "Enterprise", price: "₹9,999", outlets: "Unlimited", features: ["Everything in Growth", "Unlimited outlets", "Custom integrations", "Dedicated success manager", "SLA-backed uptime"] },
];

export default function Landing() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-display font-bold">R</div>
            <span className="font-display font-bold text-lg">RetailFlow<span className="text-primary">.</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
            <a href="#stack" className="text-muted-foreground hover:text-foreground">For</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={toggle} data-testid="landing-theme-toggle" className="p-2 hover:bg-secondary rounded-lg text-muted-foreground">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Button variant="ghost" onClick={() => navigate("/login")} data-testid="landing-login-btn">Log in</Button>
            <Button onClick={() => navigate("/register")} data-testid="landing-cta-register">
              Get started <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-40 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="max-w-7xl mx-auto relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
              <Sparkles size={12} />
              The operating system for modern retail
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter leading-[1.05] mb-6">
              Run every outlet
              <br />
              <span className="text-primary">like one shop.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Billing, inventory, customers, loyalty, taxes, expenses and live analytics —
              for grocery stores, restaurants, pharmacies, fashion, hardware and everything in between.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate("/register")} data-testid="hero-cta-register" className="text-base px-6 py-6">
                Start free trial <ArrowRight size={16} className="ml-2" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/login")} data-testid="hero-cta-demo" className="text-base px-6 py-6">
                View live demo
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Check size={14} className="text-success" /> No credit card</div>
              <div className="flex items-center gap-1.5"><Check size={14} className="text-success" /> Setup in 60s</div>
              <div className="flex items-center gap-1.5"><Check size={14} className="text-success" /> 10+ business types</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="py-24 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 max-w-2xl">
            <div className="uppercase-label mb-3">What's inside</div>
            <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight">
              One platform. Every workflow.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="card-modern p-8 group">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-display font-semibold text-xl mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* For */}
      <section id="stack" className="py-24 px-6 border-t border-border bg-secondary/30">
        <div className="max-w-7xl mx-auto">
          <div className="uppercase-label mb-3">Built for</div>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight mb-12">
            Any business that moves things.
          </h2>
          <div className="flex flex-wrap gap-3">
            {["Grocery", "Restaurants", "Footwear", "Clothing", "Electronics", "Pharmacies", "Hardware", "Wholesale", "Service businesses", "Custom"].map((b) => (
              <div key={b} className="px-5 py-2.5 bg-card border border-border rounded-full text-sm font-medium">
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="uppercase-label mb-3">Pricing</div>
            <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight">Pay per outlet, not per feature.</h2>
            <p className="text-muted-foreground mt-3">Every plan unlocks every feature.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`card-modern p-8 relative ${p.featured ? "border-primary ring-2 ring-primary/20" : ""}`}
              >
                {p.featured && (
                  <div className="absolute -top-3 left-8 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                    Most popular
                  </div>
                )}
                <div className="uppercase-label mb-2">{p.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-display font-bold tracking-tight">{p.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <div className="text-sm text-muted-foreground mb-6">{p.outlets}</div>
                <Button
                  className="w-full mb-6"
                  variant={p.featured ? "default" : "outline"}
                  onClick={() => navigate(`/register?plan=${p.id}`)}
                  data-testid={`pricing-cta-${p.id}`}
                >
                  Get started
                </Button>
                <ul className="space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-display font-bold">R</div>
            <span className="font-display font-bold">RetailFlow.</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2026 RetailFlow AI. Crafted for retailers.
          </div>
        </div>
      </footer>
    </div>
  );
}
