import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { CalculatorPage } from "@/pages/CalculatorPage";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { TablasAdminPage } from "@/pages/admin/TablasAdminPage";
import { TablaEditorPage } from "@/pages/admin/TablaEditorPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<CalculatorPage />} />
                <Route path="/natillera" element={<NatilleraPage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin/tablas" element={<TablasAdminPage />} />
                  <Route path="/admin/tablas/:tabla" element={<TablaEditorPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
