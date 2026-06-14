import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/SharedUI";
import { cn } from "@/lib/utils";

export default function OrgChart() {
  const [chart, setChart] = useState({ employee_tree: [], role_tree: [] });
  const [view, setView] = useState("employees");
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    api.get("/org/chart").then(({ data }) => setChart(data));
  }, []);

  const tree = view === "employees" ? chart.employee_tree : chart.role_tree;

  const toggle = useCallback((id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const visibleRows = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      visibleRows.push({ node, depth });
      const hasChildren = node.children?.length > 0;
      const isCollapsed = collapsed[node.id];
      if (hasChildren && !isCollapsed) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(tree, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization chart"
        description="Reporting structure and role hierarchy"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={cn("px-3 py-1.5 rounded-lg text-sm", view === "employees" ? "bg-primary text-primary-foreground" : "bg-secondary")}
              onClick={() => setView("employees")}
            >
              Employees
            </button>
            <button
              type="button"
              className={cn("px-3 py-1.5 rounded-lg text-sm", view === "roles" ? "bg-primary text-primary-foreground" : "bg-secondary")}
              onClick={() => setView("roles")}
            >
              Roles
            </button>
          </div>
        }
      />
      {tree.length === 0 ? (
        <EmptyState title="No hierarchy data" description="Assign reports-to relationships on employees or parent roles." />
      ) : (
        <div className="card-modern p-6 max-w-2xl space-y-1">
          {visibleRows.map(({ node, depth }) => {
            const hasChildren = node.children?.length > 0;
            const isCollapsed = collapsed[node.id];
            return (
              <div
                key={node.id}
                className="flex items-center gap-2"
                style={{ paddingLeft: `${depth * 20}px` }}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 py-2 px-3 rounded-lg border border-border bg-card hover:bg-secondary/50 flex-1 text-left"
                  onClick={() => hasChildren && toggle(node.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(node.name || "?")[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{node.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{node.role || node.slug}</div>
                  </div>
                  {hasChildren && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {isCollapsed ? "+" : "−"}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
