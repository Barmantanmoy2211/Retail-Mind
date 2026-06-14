import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";

/**
 * Outlet staff: location auto-set to their outlet (read-only).
 * Business owner: picklist of retail outlets.
 */
export default function CustomerLocationField({
  value,
  onChange,
  showLabel = true,
  testId = "cust-location",
}) {
  const { user, outlet } = useAuth();
  const isOwner = user?.role === "business_admin";
  const isOutletStaff = ["outlet_manager", "cashier"].includes(user?.role);
  const [outlets, setOutlets] = useState([]);

  useEffect(() => {
    if (isOwner) {
      api.get("/outlets?active_only=true&exclude_warehouse=true")
        .then((r) => setOutlets(r.data.filter((o) => !o.is_warehouse)))
        .catch(() => {});
    }
  }, [isOwner]);

  useEffect(() => {
    if (isOutletStaff && outlet?.name && !value) {
      onChange(outlet.name);
    }
  }, [isOutletStaff, outlet?.name, value, onChange]);

  const field = isOutletStaff ? (
    <Input
      value={value || outlet?.name || ""}
      readOnly
      disabled
      className="bg-secondary/50"
      data-testid={testId}
    />
  ) : isOwner ? (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder="Select outlet" />
      </SelectTrigger>
      <SelectContent>
        {outlets.map((o) => (
          <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Input
      placeholder="Location (area / locality)"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
    />
  );

  return (
    <div>
      {showLabel && (
        <Label className="mb-1.5 block">
          Location {isOutletStaff ? "(your outlet)" : isOwner ? "(outlet)" : ""}
        </Label>
      )}
      {field}
      {isOutletStaff && (
        <p className="text-xs text-muted-foreground mt-1">Auto-assigned to your outlet</p>
      )}
    </div>
  );
}
