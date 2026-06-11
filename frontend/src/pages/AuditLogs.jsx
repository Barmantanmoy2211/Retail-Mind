import React, { useEffect, useState } from "react";
import api, { formatDate } from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { ScrollText, User, Database, Package, Receipt, Wallet, Building2 } from "lucide-react";

const iconFor = (entity) => ({
  user: User, product: Package, bill: Receipt, expense: Wallet,
  business: Building2, outlet: Building2, supplier: Database,
  purchase_order: ScrollText, inventory: Database,
}[entity] || ScrollText);

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/audit-logs").then((r) => setLogs(r.data));
  }, []);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Audit Logs" description={`${logs.length} actions in last 30 days.`} />

      {logs.length === 0 ? <EmptyState title="No activity yet" /> : (
        <div className="card-modern p-4">
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {logs.map((log, i) => {
                const Icon = iconFor(log.entity);
                return (
                  <div key={log.id || i} className="relative pl-12">
                    <div className="absolute left-2 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center">
                      <Icon size={12} className="text-muted-foreground" />
                    </div>
                    <div className="card-modern p-3 hover:border-primary/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">
                            <span className="font-semibold">{log.user_name || "System"}</span>{" "}
                            <Badge variant="outline">{log.action}</Badge>{" "}
                            <span className="text-muted-foreground">{log.entity}</span>
                          </div>
                          {log.entity_id && <div className="text-xs text-muted-foreground font-mono mt-0.5">{log.entity_id}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground flex-shrink-0">{formatDate(log.timestamp)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
