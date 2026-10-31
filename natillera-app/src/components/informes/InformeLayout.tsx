import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { exportarExcel, type HojaExcel } from "@/lib/informes/excel";
import { ResumenInforme, type ItemResumen } from "@/components/informes/ResumenInforme";

const fechaLarga = (d = new Date()) =>
  d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

/**
 * Molde común de todos los informes:
 *   encabezado (título · descripción · fecha de corte · acciones)
 *   → avisos → franja de totales → contenido.
 * Acciones iguales en todos: Actualizar, Exportar a Excel, Imprimir / PDF.
 * Al imprimir se reemplaza el encabezado de pantalla por uno formal.
 */
export function InformeLayout({
  titulo,
  descripcion,
  Icon,
  corte,
  cargando,
  error,
  listo,
  onActualizar,
  excel,
  acciones,
  avisos,
  resumen,
  detalleImpresion,
  imprimible = true,
  horizontal = false,
  children,
}: {
  titulo: string;
  descripcion?: ReactNode;
  Icon?: LucideIcon;
  /** Fecha de corte en texto; por defecto, hoy. */
  corte?: string;
  cargando: boolean;
  error: string | null;
  /** true cuando ya hay datos para mostrar (oculta el esqueleto de carga). */
  listo: boolean;
  onActualizar?: () => void;
  /** Si viene, aparece "Exportar a Excel"; devuelve las hojas a exportar. */
  excel?: () => HojaExcel[];
  /** Controles propios del informe (filtros, selector de socio…). */
  acciones?: ReactNode;
  avisos?: ReactNode;
  resumen?: ItemResumen[];
  /** Línea extra del encabezado impreso (p. ej. el socio del estado de cuenta). */
  detalleImpresion?: string;
  /** false mientras no haya nada que valga la pena imprimir. */
  imprimible?: boolean;
  /** Tablas anchas: se imprime en hoja horizontal. */
  horizontal?: boolean;
  children: ReactNode;
}) {
  const [exportando, setExportando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const textoCorte = corte ?? fechaLarga();

  async function exportar() {
    if (!excel) return;
    setExportando(true);
    setErrorExcel(null);
    try {
      await exportarExcel(titulo, textoCorte, excel());
    } catch (e) {
      setErrorExcel(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-5" data-pagina={horizontal ? "horizontal" : undefined}>
      {/* Pantalla */}
      <div className="flex flex-wrap items-end justify-between gap-3" data-print="hide">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-muted)]">Informe · corte al {textoCorte}</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            {Icon && <Icon className="size-6 text-[var(--color-primary)]" aria-hidden />}
            {titulo}
          </h1>
          {descripcion && <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">{descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {acciones}
          {onActualizar && (
            <Button variant="outline" size="sm" onClick={onActualizar} disabled={cargando}>
              <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          )}
          {excel && (
            <Button variant="outline" size="sm" onClick={exportar} disabled={!listo || exportando}>
              <FileSpreadsheet className="size-4" />
              {exportando ? "Exportando…" : "Excel"}
            </Button>
          )}
          <Button size="sm" onClick={() => window.print()} disabled={!listo || !imprimible}>
            <Printer className="size-4" />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Impresión */}
      <div data-print="header">
        <p>Natillera · Tesorería</p>
        <h1>{titulo}</h1>
        {detalleImpresion && <p>{detalleImpresion}</p>}
        <p>
          Corte al {textoCorte} · Generado el {fechaLarga()}
        </p>
      </div>

      {(error || errorExcel) && (
        <div
          className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3"
          data-print="hide"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-destructive)]" />
          <p className="text-sm text-[var(--color-destructive)]">{error ?? `No se pudo exportar: ${errorExcel}`}</p>
        </div>
      )}

      {avisos}

      {!listo && cargando && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-card)]" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-[var(--radius-card)]" />
        </div>
      )}

      {listo && resumen && resumen.length > 0 && <ResumenInforme items={resumen} />}
      {listo && children}
    </div>
  );
}
