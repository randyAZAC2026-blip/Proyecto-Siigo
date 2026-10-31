import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
  Wallet,
} from "lucide-react";
import type { Vista } from "@/lib/navegacion";

interface Ficha {
  vista: Vista;
  titulo: string;
  descripcion: string;
  Icon: LucideIcon;
}

const SECCIONES: { titulo: string; descripcion: string; fichas: Ficha[] }[] = [
  {
    titulo: "Socios",
    descripcion: "Lo que ha aportado y lo que debe cada socio.",
    fichas: [
      {
        vista: "socios",
        titulo: "Socios y aportes",
        descripcion: "Ahorro, actividades, rifa, total aportado y deuda de cada socio.",
        Icon: Users,
      },
      {
        vista: "estado",
        titulo: "Estado de cuenta",
        descripcion: "Movimientos de un socio, listo para imprimir y entregar.",
        Icon: FileText,
      },
    ],
  },
  {
    titulo: "Ahorro",
    descripcion: "Cumplimiento del ahorro mensual.",
    fichas: [
      {
        vista: "matriz",
        titulo: "Matriz de ahorros",
        descripcion: "Socio por mes: quién pagó, cuánto y el total recaudado de cada mes.",
        Icon: BarChart3,
      },
      {
        vista: "mora-ahorros",
        titulo: "Mora de ahorros",
        descripcion: "Pagos tarde o pendientes y la mora que generan.",
        Icon: AlertTriangle,
      },
    ],
  },
  {
    titulo: "Préstamos",
    descripcion: "Intereses y atrasos de la cartera.",
    fichas: [
      {
        vista: "mora-intereses",
        titulo: "Mora de intereses",
        descripcion: "Intereses de préstamos pagados tarde o pendientes.",
        Icon: AlertTriangle,
      },
    ],
  },
  {
    titulo: "Cierre del ciclo",
    descripcion: "Cuánto le corresponde a cada socio al liquidar.",
    fichas: [
      {
        vista: "liquidacion",
        titulo: "Liquidación",
        descripcion: "Aportes menos deducciones: el neto a recibir por socio si se cierra hoy.",
        Icon: Wallet,
      },
      {
        vista: "simulador",
        titulo: "Simulador de cierre",
        descripcion: "Prueba reglas de reparto de utilidades, mora y préstamos antes de cerrar.",
        Icon: Calculator,
      },
    ],
  },
];

/** Índice de informes: todos con el mismo formato, Excel e impresión. */
export function InformesPage({ onIr }: { onIr: (v: Vista) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Informes</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Todos los informes tienen la misma estructura: totales arriba, tabla con fila de totales y los botones{" "}
          <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
            <FileSpreadsheet className="size-3.5" aria-hidden /> Excel
          </span>{" "}
          e{" "}
          <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
            <Printer className="size-3.5" aria-hidden /> Imprimir / PDF
          </span>
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {SECCIONES.map((s) => (
          <section key={s.titulo}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{s.titulo}</h2>
            <p className="mb-2 text-xs text-[var(--color-muted)]">{s.descripcion}</p>
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
              {s.fichas.map(({ vista, titulo, descripcion, Icon }, i) => (
                <li key={vista} className={i > 0 ? "border-t border-[var(--color-border)]" : ""}>
                  <button
                    type="button"
                    onClick={() => onIr(vista)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-primary)]/[0.04] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)]/8 text-[var(--color-primary)]">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--color-text)]">{titulo}</span>
                      <span className="block text-xs text-[var(--color-muted)]">{descripcion}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
