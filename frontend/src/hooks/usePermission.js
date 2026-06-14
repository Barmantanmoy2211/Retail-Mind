import { useAuth } from "@/contexts/AuthContext";

export function usePermission(permission) {
  const { can } = useAuth();
  return can(permission);
}

export function useAnyPermission(...permissions) {
  const { canAny } = useAuth();
  return canAny(...permissions);
}
