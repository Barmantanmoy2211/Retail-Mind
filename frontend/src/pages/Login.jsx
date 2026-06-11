import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      toast.success(`Welcome back, ${data.user.name}`);
      const role = data.user.role;
      if (role === "platform_admin") navigate("/platform");
      else if (data.business?.subscription_status === "pending") navigate("/pending-approval");
      else navigate(role === "cashier" ? "/pos" : "/dashboard");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (em, pw) => {
    setEmail(em);
    setPassword(pw);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left - form */}
      <div className="flex-1 flex flex-col justify-center px-6 md:px-12 lg:px-20 py-12">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-12" data-testid="login-back-home">
            <ArrowLeft size={14} /> Back to home
          </Link>
          <div className="mb-8">
            <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your RetailFlow account.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
                placeholder="you@business.com"
                className="mt-1.5 h-11"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
                placeholder="••••••••"
                className="mt-1.5 h-11"
              />
            </div>
            <Button type="submit" disabled={loading} data-testid="login-submit" className="w-full h-11">
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary font-medium hover:underline" data-testid="login-to-register">
              Register your business
            </Link>
          </div>

          <div className="mt-10 p-4 border border-dashed border-border rounded-lg">
            <div className="uppercase-label mb-3">Try demo accounts</div>
            <div className="space-y-1.5 text-xs">
              {[
                ["Platform Admin", "admin@retailflow.ai", "Admin@123"],
                ["Business Owner", "owner@bharatmart.com", "Owner@123"],
                ["Outlet Manager", "manager@bharatmart.com", "Manager@123"],
                ["Cashier", "cashier@bharatmart.com", "Cashier@123"],
              ].map(([role, em, pw]) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => quickFill(em, pw)}
                  data-testid={`demo-fill-${role.toLowerCase().replace(/\s+/g, "-")}`}
                  className="w-full flex items-center justify-between p-2 rounded hover:bg-secondary text-left"
                >
                  <span className="font-medium">{role}</span>
                  <span className="font-mono text-muted-foreground">{em}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right - decoration */}
      <div className="hidden lg:flex flex-1 bg-foreground text-background items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="relative max-w-md">
          <div className="uppercase-label mb-4 text-background/60">RetailFlow AI</div>
          <h2 className="text-4xl font-display font-bold tracking-tight mb-4 leading-tight">
            The operating system for modern retail.
          </h2>
          <p className="text-background/70">
            Bill faster. Restock smarter. Grow steadier. From a single corner shop to a 100-outlet chain.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { v: "10k+", l: "bills/day" },
              { v: "99.9%", l: "uptime" },
              { v: "60s", l: "to onboard" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-3xl font-display font-bold">{s.v}</div>
                <div className="text-xs text-background/60 mt-1 uppercase tracking-wider">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
