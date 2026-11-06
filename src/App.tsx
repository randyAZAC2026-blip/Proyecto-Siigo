import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { CalculatorPage } from "@/pages/CalculatorPage";
import { TablasAdminPage } from "@/pages/admin/TablasAdminPage";
import { TablaEditorPage } from "@/pages/admin/TablaEditorPage";
import { DashboardPage } from "@/pages/billetera/DashboardPage";
import { MovimientosPage } from "@/pages/billetera/MovimientosPage";
import { NuevoMovimientoPage } from "@/pages/billetera/NuevoMovimientoPage";
import { CuentasPorPagarPage } from "@/pages/billetera/CuentasPorPagarPage";
import { CuentasPorCobrarPage } from "@/pages/billetera/CuentasPorCobrarPage";
import { CuentasPage } from "@/pages/billetera/CuentasPage";
import { CategoriasPage } from "@/pages/billetera/CategoriasPage";
import { FuentesIngresoPage } from "@/pages/billetera/FuentesIngresoPage";

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
                <Route path="/" element={<DashboardPage />} />
                <Route path="/movimientos" element={<MovimientosPage />} />
                <Route path="/movimientos/nuevo" element={<NuevoMovimientoPage />} />
                <Route path="/por-pagar" element={<CuentasPorPagarPage />} />
                <Route path="/por-cobrar" element={<CuentasPorCobrarPage />} />
                <Route path="/cuentas" element={<CuentasPage />} />
                <Route path="/categorias" element={<CategoriasPage />} />
                <Route path="/ingresos" element={<FuentesIngresoPage />} />
                <Route path="/asesor" element={<CalculatorPage />} />

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
