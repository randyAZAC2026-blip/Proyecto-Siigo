import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descargarExtractos } from "@/lib/informes/extractosExcel";

/**
 * Descarga en Excel los extractos de todas las cuentas. Si hay fechas en los
 * filtros usa ese rango; si no, el año en curso completo.
 */
export function DescargarExtractosButton({ desde, hasta }: { desde?: string; hasta?: string }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anio = new Date().getFullYear();
  const conRango = Boolean(desde || hasta);
  const d = desde || `${anio}-01-01`;
  const h = hasta || `${anio}-12-31`;

  async function descargar() {
    setTrabajando(true);
    setError(null);
    try {
      await descargarExtractos(d, h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={descargar}
        disabled={trabajando}
        className="gap-1"
        title={conRango ? `Movimientos del ${d} al ${h}, todas las cuentas` : `Todos los movimientos de ${anio}, todas las cuentas`}
      >
        <FileSpreadsheet className="size-4" />
        {trabajando ? "Generando…" : conRango ? "Excel de las fechas" : `Extractos ${anio} en Excel`}
      </Button>
      {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
    </span>
  );
}
