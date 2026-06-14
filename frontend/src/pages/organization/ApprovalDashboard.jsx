import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ApprovalDashboard() {
  const [pending, setPending] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [roleRequests, setRoleRequests] = useState([]);

  const load = async () => {
    const [p, t, r] = await Promise.all([
      api.get("/org/approvals/pending"),
      api.get("/org/transfer-requests").catch(() => ({ data: [] })),
      api.get("/org/role-requests").catch(() => ({ data: [] })),
    ]);
    setPending(p.data);
    setTransfers(t.data.filter((x) => x.status === "pending"));
    setRoleRequests(r.data.filter((x) => x.status === "pending"));
  };

  useEffect(() => { load(); }, []);

  const act = async (item, action) => {
    try {
      await api.post("/org/approvals/action", {
        request_type: item.request_type,
        request_id: item.id,
        action,
      });
      toast.success(action === "approve" ? "Approved" : "Rejected");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const PendingCard = ({ item }) => (
    <div className="card-modern p-4 flex items-center justify-between">
      <div>
        <div className="font-medium">
          {item.request_type === "hiring" && `Hire: ${item.candidate?.name}`}
          {item.request_type === "role_create" && `Role: ${item.name}`}
          {item.request_type === "expense" && "Expense"}
          {item.request_type === "transfer" && `Transfer user`}
        </div>
        <Badge variant="outline" className="mt-1">{item.request_type}</Badge>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => act(item, "reject")}><X size={14} /></Button>
        <Button size="sm" onClick={() => act(item, "approve")}><Check size={14} /></Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Approval dashboard" description="Unified inbox for all pending approvals" />
      <section>
        <h3 className="font-semibold mb-3">Action required ({pending.length})</h3>
        {pending.length === 0 ? (
          <EmptyState title="Inbox clear" />
        ) : (
          <div className="space-y-2">{pending.map((item) => <PendingCard key={`${item.request_type}-${item.id}`} item={item} />)}</div>
        )}
      </section>
      <section>
        <h3 className="font-semibold mb-3">Pending transfers ({transfers.length})</h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending transfers</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="card-modern p-3 text-sm">
                User {t.user_id} → outlets {t.to_outlet_ids?.join(", ")}
                <Badge variant="warning" className="ml-2">{t.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3 className="font-semibold mb-3">Role requests ({roleRequests.length})</h3>
        {roleRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending role requests</p>
        ) : (
          <div className="space-y-2">
            {roleRequests.map((r) => (
              <div key={r.id} className="card-modern p-3 text-sm flex justify-between">
                <span>{r.name}</span>
                <Badge variant="warning">{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
