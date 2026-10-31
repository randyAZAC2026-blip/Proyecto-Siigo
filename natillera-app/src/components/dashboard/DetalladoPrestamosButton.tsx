import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descargarDetalladoPrestamos } from "@/lib/informes/detalladoPrestamos";

/** Botón que descarga el detallado de préstamos en Excel (de un socio o de todos). */
export function DetalladoPrestamosButton({
  socio,
  etiqueta = "Detallado en Excel",
}: {
  socio?: { id: number; nombre: string };
  etiqueta?: string;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setTrabajando(true);
    setError(null);
    try {
      await descargarDetalladoPrestamos(socio);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={descargar} disabled={trabajando} className="gap-1">
        <FileSpreadsheet className="size-4" />
        {trabajando ? "Generando…" : etiqueta}
      </Button>
      {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
    </span>
  );
}
