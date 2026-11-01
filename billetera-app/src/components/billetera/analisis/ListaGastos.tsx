import type { MovimientoAnalisis } from "@/lib/billetera/analisis";
import { grupoDe } from "@/lib/billetera/analisis";
import { formatCOP, formatDate } from "@/lib/billetera/format";

/** Lista compacta de gastos: fecha, descripción y categoría, y el monto. */
export function ListaGastos({ gastos, vacio, mostrarCategoria = true }: { gastos: MovimientoAnalisis[]; vacio: string; mostrarCategoria?: boolean }) {
  if (!gastos.length) return <p className="text-sm text-[var(--color-muted)]">{vacio}</p>;
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {gastos.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate text-[var(--color-text)]">{m.descripcion || m.contraparte || grupoDe(m)}</p>
            <p className="text-xs text-[var(--color-muted)]">{formatDate(m.fecha)}{mostrarCategoria ? ` · ${grupoDe(m)}` : ""}</p>
          </div>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--color-text)]">{formatCOP(Number(m.monto))}</span>
        </li>
      ))}
    </ul>
  );
}
