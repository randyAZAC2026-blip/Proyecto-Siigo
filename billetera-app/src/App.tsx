import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/billetera/DashboardPage";
import { MovimientosPage } from "@/pages/billetera/MovimientosPage";
import { NuevoMovimientoPage } from "@/pages/billetera/NuevoMovimientoPage";
import { CuentasPorPagarPage } from "@/pages/billetera/CuentasPorPagarPage";
import { CuentasPorCobrarPage } from "@/pages/billetera/CuentasPorCobrarPage";
import { CuentasPage } from "@/pages/billetera/CuentasPage";
import { CategoriasPage } from "@/pages/billetera/CategoriasPage";

// Análisis trae la librería de gráficos: se descarga solo al entrar.
const AnalisisPage = lazy(() => import("@/pages/billetera/AnalisisPage").then((m) => ({ default: m.AnalisisPage })));

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
                <Route path="/analisis" element={<Suspense fallback={<p className="text-sm text-[var(--color-muted)]">Cargando análisis…</p>}><AnalisisPage /></Suspense>} />
                <Route path="/por-pagar" element={<CuentasPorPagarPage />} />
                <Route path="/por-cobrar" element={<CuentasPorCobrarPage />} />
                <Route path="/cuentas" element={<CuentasPage />} />
                <Route path="/categorias" element={<CategoriasPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
