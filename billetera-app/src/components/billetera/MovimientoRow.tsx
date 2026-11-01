import { ArrowDownRight, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import type { MovimientoTipo } from "@/lib/supabase/database.types";
import type { MovimientoConRelaciones } from "@/lib/billetera/queries";
import { formatCOP, formatDate } from "@/lib/billetera/format";
import { ReciboMovimiento } from "@/components/billetera/ReciboMovimiento";

const estilo: Record<MovimientoTipo, { icon: typeof ArrowUpRight; color: string; sign: string }> = {
  ingreso: { icon: ArrowDownRight, color: "var(--color-success)", sign: "+" },
  egreso: { icon: ArrowUpRight, color: "var(--color-destructive)", sign: "−" },
  transferencia: { icon: ArrowLeftRight, color: "var(--color-muted)", sign: "" },
};

interface Props {
  mov: MovimientoConRelaciones;
  onDelete?: (id: string) => void;
  /** Muestra el clip para adjuntar un recibo si el movimiento no tiene. */
  adjuntarRecibo?: boolean;
}

export function MovimientoRow({ mov, onDelete, adjuntarRecibo = false }: Props) {
  const { icon: Icon, color, sign } = estilo[mov.tipo];
  const titulo =
    mov.descripcion ||
    mov.categoria?.nombre ||
    (mov.tipo === "transferencia"
      ? `Transferencia a ${mov.cuenta_destino?.nombre ?? "otra cuenta"}`
      : mov.contraparte || "Movimiento sin descripción");

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-b-0">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{titulo}</p>
        <p className="truncate text-xs text-[var(--color-muted)]">
          {formatDate(mov.fecha)} · {mov.cuenta?.nombre ?? "—"}
          {mov.tipo === "transferencia" && mov.cuenta_destino
            ? ` → ${mov.cuenta_destino.nombre}`
            : ""}
          {mov.categoria && mov.tipo !== "transferencia" ? ` · ${mov.categoria.nombre}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {mov.tipo !== "transferencia" && <ReciboMovimiento movimientoId={mov.id} ruta={mov.recibo_path ?? null} puedeAdjuntar={adjuntarRecibo} />}
        <p className="tabular-nums font-semibold" style={{ color }}>
          {sign}
          {formatCOP(Number(mov.monto))}
        </p>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(mov.id)}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-destructive)]"
            aria-label="Eliminar movimiento"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
