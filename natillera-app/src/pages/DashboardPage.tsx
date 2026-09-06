import {
  RefreshCw,
  AlertCircle,
  Users,
  BarChart3,
  Wallet,
  AlertTriangle,
  Landmark,
  ClipboardCheck,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/lib/dashboard/useApi";
import { api } from "@/lib/dashboard/api";
import { KpiTiles } from "@/components/dashboard/KpiTiles";

const API_URL = import.meta.env.VITE_NAT_API || "http://localhost:4000";

interface Props {
  onVolver: () => void;
  onIr: (vista: string) => void;
}

const ACCESOS: {
  key: string;
  label: string;
  desc: string;
  Icon: typeof Users;
  color: string;
}[] = [
  {
    key: "socios",
    label: "Socios y aportes",
    desc: "Tabla con buscador y ordenamiento",
    Icon: Users,
    color: "var(--color-primary)",
  },
  {
    key: "matriz",
    label: "Matriz de ahorros",
    desc: "Socios × meses (solo lectura)",
    Icon: BarChart3,
    color: "var(--color-primary)",
  },
  {
    key: "control",
    label: "Control pagos",
    desc: "Matriz clicable — registrar / editar",
    Icon: CheckCircle2,
    color: "var(--color-success)",
  },
  {
    key: "liquidacion",
    label: "Liquidación",
    desc: "Cuánto le tocaría a cada socio hoy",
    Icon: Wallet,
    color: "var(--color-success)",
  },
  {
    key: "prestamos",
    label: "Préstamos activos",
    desc: "Deudores y saldos pendientes",
    Icon: AlertTriangle,
    color: "var(--color-warning)",
  },
  {
    key: "matriz-prestamos",
    label: "Matriz de préstamos",
    desc: "Abonos + intereses mes × socio",
    Icon: BarChart3,
    color: "var(--color-warning)",
  },
  {
    key: "conciliacion",
    label: "Conciliación banco",
    desc: "Resumen Bancolombia + Nequi",
    Icon: Landmark,
    color: "var(--color-primary)",
  },
  {
    key: "extracto",
    label: "Extracto detallado",
    desc: "Movs con filtros + vincular",
    Icon: Landmark,
    color: "var(--color-primary)",
  },
  {
    key: "estado",
    label: "Estado de cuenta",
    desc: "Detallado por socio (PDF/WhatsApp)",
    Icon: FileText,
    color: "var(--color-primary)",
  },
  {
    key: "registrar",
    label: "Registrar pago",
    desc: "Nuevo aporte / abono / préstamo",
    Icon: ClipboardCheck,
    color: "var(--color-primary)",
  },
];

export function DashboardPage({ onVolver: _onVolver, onIr }: Props) {
  const resumen = useApi(() => api.resumen());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Panel principal
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Indicadores del ciclo actual y accesos rápidos a cada módulo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => resumen.reload()} disabled={resumen.loading}>
          <RefreshCw className={`size-4 ${resumen.loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {resumen.error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-default)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-4">
          <AlertCircle className="size-5 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--color-destructive)]">
              No se pudo conectar al backend
            </p>
            <p className="text-[var(--color-muted)] mt-1">
              Verifica que el servidor esté corriendo en <code>{API_URL}</code>. En otra
              terminal:
            </p>
            <pre className="mt-2 rounded bg-[var(--color-muted)]/20 p-2 text-xs">
              cd natillera-backend{"\n"}pnpm dev
            </pre>
            <p className="text-xs mt-2 text-[var(--color-destructive)]">{resumen.error}</p>
          </div>
        </div>
      )}

      {resumen.loading && !resumen.data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
          ))}
        </div>
      )}

      {resumen.data && <KpiTiles resumen={resumen.data} />}

      <div>
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-3">
          Módulos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACCESOS.map((a) => (
            <Card
              key={a.key}
              className="rounded-[var(--radius-card)] border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)]/50 transition-colors"
              onClick={() => onIr(a.key)}
            >
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                <div
                  className="rounded-md p-2"
                  style={{ background: `${a.color}15`, color: a.color }}
                >
                  <a.Icon className="size-5" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--color-text)] text-sm">
                    {a.label}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">{a.desc}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
