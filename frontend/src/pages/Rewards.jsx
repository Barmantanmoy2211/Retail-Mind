import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Award, Save } from "lucide-react";
import { toast } from "sonner";

export default function Rewards() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.get("/rewards/config").then((r) => setCfg(r.data));
  }, []);

  const save = async () => {
    try {
      await api.put("/rewards/config", {
        points_per_currency: Number(cfg.points_per_currency),
        currency_per_point: Number(cfg.currency_per_point),
        min_redeem_points: Number(cfg.min_redeem_points),
        expiry_days: Number(cfg.expiry_days),
      });
      toast.success("Reward config saved");
    } catch (e) {
      toast.error("Failed");
    }
  };

  if (!cfg) return <div>Loading…</div>;

  return (
    <div className="space-y-6 animate-fade-up max-w-2xl">
      <PageHeader title="Loyalty Rewards" description="Configure earn & redeem rules for your loyalty program." />

      <div className="card-modern p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Award size={18} /></div>
          <div>
            <h3 className="font-display font-semibold">How it works</h3>
            <p className="text-sm text-muted-foreground mt-1">
              For every <span className="font-bold">{cfg.points_per_currency}</span> spent, customer earns
              <span className="font-bold"> 1 point</span>. Each point is worth
              <span className="font-bold"> {cfg.currency_per_point}</span> on redemption.
              Minimum redemption: <span className="font-bold">{cfg.min_redeem_points}</span> points.
            </p>
          </div>
        </div>
      </div>

      <div className="card-modern p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Currency per point earned</Label>
            <Input type="number" step="0.1" value={cfg.points_per_currency} onChange={(e) => setCfg({ ...cfg, points_per_currency: e.target.value })} data-testid="rw-earn-rate" />
            <p className="text-xs text-muted-foreground mt-1">Spend this much to earn 1 point.</p>
          </div>
          <div>
            <Label>Value per point on redeem</Label>
            <Input type="number" step="0.1" value={cfg.currency_per_point} onChange={(e) => setCfg({ ...cfg, currency_per_point: e.target.value })} data-testid="rw-redeem-rate" />
            <p className="text-xs text-muted-foreground mt-1">1 point = this much off.</p>
          </div>
          <div>
            <Label>Min redeem points</Label>
            <Input type="number" value={cfg.min_redeem_points} onChange={(e) => setCfg({ ...cfg, min_redeem_points: e.target.value })} data-testid="rw-min-redeem" />
          </div>
          <div>
            <Label>Expiry (days)</Label>
            <Input type="number" value={cfg.expiry_days} onChange={(e) => setCfg({ ...cfg, expiry_days: e.target.value })} data-testid="rw-expiry" />
          </div>
        </div>
        <Button onClick={save} data-testid="rw-save"><Save size={14} className="mr-2" />Save changes</Button>
      </div>
    </div>
  );
}
