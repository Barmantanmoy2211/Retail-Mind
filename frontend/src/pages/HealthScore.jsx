import React, { useEffect, useState } from "react";
import api, { formatCurrency } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { KpiCard } from "@/components/SharedUI";
import { Sparkles, TrendingUp, ShieldCheck } from "lucide-react";

const colorByScore = (s) =>
  s >= 81 ? "success" : s >= 61 ? "primary" : s >= 41 ? "warning" : "destructive";

const ringColor = (s) =>
  s >= 81 ? "#10B981" : s >= 61 ? "#0055FF" : s >= 41 ? "#F59E0B" : "#EF4444";

function ScoreRing({ score }) {
  const color = ringColor(score);
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative w-36 h-36">
      <svg className="-rotate-90 w-full h-full">
        <circle cx="72" cy="72" r={r} stroke="hsl(var(--border))" strokeWidth="10" fill="none" />
        <circle
          cx="72" cy="72" r={r} stroke={color} strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-display font-bold" style={{ color }}>{score}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/100</div>
      </div>
    </div>
  );
}

const METRIC_LABELS = {
  sales_growth: "Sales Growth",
  profit_margin: "Profit Margin",
  customer_growth: "Customer Growth",
  inventory_health: "Inventory Health",
  expense_control: "Expense Control",
  tax_compliance: "Tax Compliance",
  reward_engagement: "Reward Engagement",
};

export default function HealthScoreView({ embedded = false }) {
  const { business } = useAuth();
  const currency = business?.currency || "INR";
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/health-score").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="text-muted-foreground">Computing health score…</div>;

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Sparkles size={18} /></div>
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Outlet Health Score</h2>
            <p className="text-sm text-muted-foreground">Weighted score across 7 health signals.</p>
          </div>
        </div>
      )}

      {data.outlets.length === 0 ? (
        <p className="text-muted-foreground">No outlets to score.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.outlets.map((o) => (
              <div key={o.outlet_id} className="card-modern p-6" data-testid={`health-card-${o.outlet_id}`}>
                <div className="flex items-start gap-5 mb-5">
                  <ScoreRing score={o.score} />
                  <div className="flex-1">
                    <div className="font-display font-semibold text-lg">{o.outlet_name}</div>
                    <div className={`text-xs font-semibold mt-0.5 inline-block px-2 py-0.5 rounded-full bg-${colorByScore(o.score)}/10 text-${colorByScore(o.score)}`}>
                      {o.status}
                    </div>
                    <div className="mt-3 text-xs">
                      <div className="text-muted-foreground">Revenue (30d)</div>
                      <div className="font-mono font-medium">{formatCurrency(o.revenue_30d, currency)}</div>
                    </div>
                    <div className="mt-1 text-xs">
                      <div className="text-muted-foreground">Profit (30d)</div>
                      <div className={`font-mono font-medium ${o.profit_30d >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(o.profit_30d, currency)}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {Object.entries(o.metrics).map(([k, m]) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{METRIC_LABELS[k]}</span>
                        <span className="font-mono font-medium">{m.score}/100</span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${m.score}%`, background: ringColor(m.score) }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="uppercase-label mb-2 flex items-center gap-1.5"><TrendingUp size={11} />Recommendations</div>
                  <ul className="space-y-1.5">
                    {o.recommendations.map((r, i) => (
                      <li key={i} className="text-xs flex gap-2 items-start">
                        <span className="text-primary mt-0.5">→</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {data.outlets.length > 1 && (
            <div className="card-modern p-6">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={16} className="text-primary" />
                <h3 className="font-display font-semibold">Outlet Ranking</h3>
              </div>
              <div className="space-y-2">
                {data.outlets.map((o, i) => (
                  <div key={o.outlet_id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</div>
                      <div>
                        <div className="font-medium">{o.outlet_name}</div>
                        <div className="text-xs text-muted-foreground">{o.status}</div>
                      </div>
                    </div>
                    <div className="text-2xl font-display font-bold" style={{ color: ringColor(o.score) }}>{o.score}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
