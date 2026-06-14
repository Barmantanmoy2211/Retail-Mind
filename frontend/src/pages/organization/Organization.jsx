import React, { useState } from "react";
import { PageHeader } from "@/components/SharedUI";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission, useAnyPermission } from "@/hooks/usePermission";
import RolesTab from "./RolesTab";
import EmployeesTab from "./EmployeesTab";
import HiringTab from "./HiringTab";
import ApprovalsTab from "./ApprovalsTab";
import OrgChart from "./OrgChart";
import WorkflowDesigner from "./WorkflowDesigner";
import PermissionMatrix from "./PermissionMatrix";
import ApprovalDashboard from "./ApprovalDashboard";
import TransfersTab from "./TransfersTab";

const TABS = [
  { id: "roles", label: "Roles", perm: "roles.view" },
  { id: "employees", label: "Employees", perm: "employees.view" },
  { id: "hiring", label: "Hiring", perm: "employees.create" },
  { id: "approvals", label: "Approvals", perm: "approvals.view" },
  { id: "transfers", label: "Transfers", perm: "employees.transfer" },
  { id: "chart", label: "Org chart", perm: "employees.view" },
  { id: "workflows", label: "Workflows", owner: true },
  { id: "matrix", label: "Permissions", owner: true },
  { id: "dashboard", label: "Approval inbox", perm: "approvals.view" },
];

export default function Organization() {
  const { user } = useAuth();
  const isOwner = user?.role === "business_admin";
  const canRoles = usePermission("roles.view");
  const canEmployees = usePermission("employees.view");
  const canHire = usePermission("employees.create");
  const canApprovals = useAnyPermission("approvals.view", "approvals.act");
  const canTransfer = usePermission("employees.transfer");

  const visibleTabs = TABS.filter((t) => {
    if (t.owner) return isOwner;
    if (t.perm === "roles.view") return isOwner || canRoles;
    if (t.perm === "employees.view") return isOwner || canEmployees;
    if (t.perm === "employees.create") return isOwner || canHire;
    if (t.perm === "approvals.view") return isOwner || canApprovals;
    if (t.perm === "employees.transfer") return isOwner || canTransfer;
    return isOwner;
  });

  const [tab, setTab] = useState(visibleTabs[0]?.id || "roles");

  const content = {
    roles: <RolesTab />,
    employees: <EmployeesTab />,
    hiring: <HiringTab />,
    approvals: <ApprovalsTab />,
    transfers: <TransfersTab />,
    chart: <OrgChart />,
    workflows: <WorkflowDesigner />,
    matrix: <PermissionMatrix />,
    dashboard: <ApprovalDashboard />,
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Organization"
        description="Roles, employees, hiring, and approvals"
      />
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {content[tab]}
    </div>
  );
}
