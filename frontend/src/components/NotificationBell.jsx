import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/SharedUI";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({
    unread_count: 0,
    pending_stock_requests: 0,
    pending_approvals: 0,
    notifications: [],
    pending_stock_request_details: [],
  });

  const isOwner = user?.role === "business_admin";

  const load = () => {
    api.get("/notifications").then(({ data: d }) => setData(d)).catch(() => {});
  };

  useEffect(() => {
    if (!user || user.role === "platform_admin") return;
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [user]);

  const totalBadge = (data.unread_count || 0) + (data.pending_stock_requests || 0) + (data.pending_approvals || 0);

  if (!user || user.role === "platform_admin") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="notifications-bell"
          className="relative p-2 hover:bg-secondary rounded-lg text-muted-foreground"
        >
          <Bell size={18} />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isOwner && data.pending_stock_requests > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-warning font-normal">
              {data.pending_stock_requests} stock request(s) awaiting approval
            </DropdownMenuLabel>
            {data.pending_stock_request_details?.map((po) => (
              <DropdownMenuItem
                key={po.id}
                className="flex flex-col items-start gap-1 cursor-pointer"
                onClick={() => navigate("/purchase-orders")}
              >
                <span className="font-medium text-sm">{po.requested_by_name}</span>
                <span className="text-xs text-muted-foreground">
                  {po.requested_outlet_name} · {po.items?.length || 0} items
                </span>
                <Badge variant="warning" className="text-[10px]">Review & approve</Badge>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

        {data.notifications?.length === 0 && data.pending_stock_requests === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground text-sm">No new notifications</DropdownMenuItem>
        ) : (
          data.notifications?.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex flex-col items-start gap-0.5"
              onClick={() => {
                if (n.type === "stock_request") navigate("/purchase-orders");
                else if (n.type?.includes("approval")) navigate("/organization");
              }}
            >
              <span className={`text-sm ${n.read ? "text-muted-foreground" : "font-medium"}`}>{n.message}</span>
              {!n.read && <Badge variant="primary" className="text-[10px]">New</Badge>}
            </DropdownMenuItem>
          ))
        )}

        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/purchase-orders")} className="text-primary text-sm">
              Open purchase orders →
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
