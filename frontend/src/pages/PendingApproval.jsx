import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";

export default function PendingApproval() {
  const { business, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="card-modern p-10 max-w-lg w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-warning/10 text-warning flex items-center justify-center mb-6">
          <Clock size={28} />
        </div>
        <h1 className="text-3xl font-display font-bold tracking-tight mb-2">Awaiting approval</h1>
        <p className="text-muted-foreground mb-8">
          Your business <span className="font-semibold text-foreground">{business?.business_name}</span> is currently
          under review by our platform team. You'll be notified by email once approved.
        </p>
        <div className="bg-secondary/50 rounded-lg p-4 mb-8 text-left text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium capitalize">{business?.plan}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Outlet limit</span>
            <span className="font-medium">{business?.outlet_limit}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize text-warning">{business?.subscription_status}</span>
          </div>
        </div>
        <Button onClick={logout} data-testid="pending-logout" className="w-full">
          Sign out <ArrowRight size={14} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}
