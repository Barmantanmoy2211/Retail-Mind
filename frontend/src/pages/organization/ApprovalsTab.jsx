import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Badge, EmptyState } from "@/components/SharedUI";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ApprovalsTab() {
  const [pending, setPending] = useState([]);

  const load = async () => {
    const { data } = await api.get("/org/approvals/pending");
    setPending(data);
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

  const label = (item) => {
    if (item.request_type === "hiring") return `Hire: ${item.candidate?.name}`;
    if (item.request_type === "role_create") return `New role: ${item.name}`;
    if (item.request_type === "expense") return `Expense approval`;
    if (item.request_type === "transfer") return `Transfer request`;
    return item.request_type;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My approvals" description={`${pending.length} pending`} />
      {pending.length === 0 ? (
        <EmptyState title="No pending approvals" description="You're all caught up." />
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <div key={`${item.request_type}-${item.id}`} className="card-modern p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{label(item)}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  <Badge variant="outline">{item.request_type.replace("_", " ")}</Badge>
                  <span className="ml-2">Step {(item.current_level || 0) + 1}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => act(item, "reject")}>
                  <X size={14} className="mr-1" />Reject
                </Button>
                <Button size="sm" onClick={() => act(item, "approve")}>
                  <Check size={14} className="mr-1" />Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
