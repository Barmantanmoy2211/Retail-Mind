import React from "react";

export const KpiCard = ({ label, value, sub, icon: Icon, accent = "primary", testId }) => (
  <div data-testid={testId} className="card-modern p-6">
    <div className="flex items-center justify-between mb-3">
      <span className="uppercase-label">{label}</span>
      {Icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-${accent}/10`}>
          <Icon size={16} className={`text-${accent}`} />
        </div>
      )}
    </div>
    <div className="text-3xl font-display font-bold tracking-tight">{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
  </div>
);

export const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
    <div>
      <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">{title}</h1>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-secondary text-foreground",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    primary: "bg-primary/10 text-primary border-primary/20",
    outline: "border border-border bg-transparent",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  );
};

export const EmptyState = ({ title = "Nothing here yet", description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
      <span className="text-2xl">∅</span>
    </div>
    <h3 className="font-display font-semibold text-lg">{title}</h3>
    {description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Phase2Banner = ({ feature }) => (
  <div className="card-modern p-8 text-center bg-accent/30 border-dashed">
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Coming in Phase 2
    </div>
    <h3 className="text-xl font-display font-bold mb-2">{feature}</h3>
    <p className="text-sm text-muted-foreground max-w-md mx-auto">
      This feature is being polished and will be released in the next iteration.
      All core data is already being captured — the integration is what's pending.
    </p>
  </div>
);
