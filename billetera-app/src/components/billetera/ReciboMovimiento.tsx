import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip } from "lucide-react";
import { enlaceRecibo, TIPOS_RECIBO, validarRecibo } from "@/lib/billetera/queries";
import { useSubirRecibo } from "@/lib/billetera/hooks";

interface Props {
  movimientoId: string;
  ruta: string | null;
  /** Si es false solo se puede abrir el recibo (p. ej. en el Inicio). */
  puedeAdjuntar?: boolean;
}

/**
 * Recibo de un movimiento: si tiene, el botón lo abre (enlace temporal de 5 minutos); si no y se puede, el clip
 * abre el selector para adjuntar un PDF o una foto.
 */
export function ReciboMovimiento({ movimientoId, ruta, puedeAdjuntar = false }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const subir = useSubirRecibo();
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    if (!ruta) return;
    // La pestaña se abre antes del await: así el navegador no la bloquea como ventana emergente.
    const ventana = window.open("", "_blank");
    setAbriendo(true);
    try {
      const url = await enlaceRecibo(ruta);
      if (ventana) ventana.location.href = url; else window.location.href = url;
    } catch (e) {
      ventana?.close();
      alert(e instanceof Error ? e.message : "No se pudo abrir el recibo.");
    } finally {
      setAbriendo(false);
    }
  }

  async function elegido(archivo: File | undefined) {
    if (!archivo) return;
    const problema = validarRecibo(archivo);
    if (problema) { alert(problema); return; }
    try {
      await subir.mutateAsync({ movimientoId, archivo, rutaAnterior: ruta });
    } catch (e) {
      alert(`No se pudo subir el recibo: ${e instanceof Error ? e.message : e}`);
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  }

  if (ruta) {
    return (
      <button type="button" onClick={abrir} disabled={abriendo} title="Ver recibo" aria-label="Ver recibo"
        className="flex size-8 items-center justify-center rounded-full text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10">
        {abriendo ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
      </button>
    );
  }
  if (!puedeAdjuntar) return null;
  return (
    <>
      <input ref={entrada} type="file" accept={TIPOS_RECIBO.join(",")} className="hidden" onChange={(e) => elegido(e.target.files?.[0])} aria-hidden tabIndex={-1} />
      <button type="button" onClick={() => entrada.current?.click()} disabled={subir.isPending} title="Adjuntar recibo (PDF o foto)" aria-label="Adjuntar recibo"
        className="flex size-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]">
        {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
      </button>
    </>
  );
}
