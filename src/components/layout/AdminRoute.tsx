import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function AdminRoute() {
  const { profile, loading } = useAuth();

  if (loading) return null;
  if (profile?.role !== "superuser") return <Navigate to="/" replace />;

  return <Outlet />;
}
