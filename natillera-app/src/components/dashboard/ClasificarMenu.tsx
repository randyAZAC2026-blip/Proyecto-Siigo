import { useState, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, X } from "lucide-react";
import { api, NOMBRE_CATEGORIA, type CategoriaBanco, type Extracto } from "@/lib/dashboard/api";

/**
 * Menú del punto de estado: clasifica el movimiento como personal, gasto o
 * rendimiento del banco (deja de contar como pendiente) o quita la
 * clasificación. No aplica a movimientos que ya tienen pagos unidos.
 */
export function ClasificarMenu({
  fila,
  children,
  onCambio,
}: {
  fila: Extracto;
  children: ReactNode;
  onCambio: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const conPagos = (fila.n_transacciones ?? 0) > 0;
  const actual = fila.categoria ?? null;

  async function poner(categoria: CategoriaBanco | null) {
    setGuardando(true);
    try {
      await api.categorizarExtractos([fila.id], categoria);
      onCambio();
    } catch (e) {
      // El menú ya se cerró: el aviso tiene que verse igual.
      window.alert(`No se pudo clasificar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardando(false);
    }
  }

  if (conPagos) return <>{children}</>;

  const item =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--color-primary)]/8";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={guardando}>
        <button
          type="button"
          className="inline-grid size-6 place-items-center rounded-full hover:bg-[var(--color-primary)]/10 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
          aria-label="Clasificar movimiento"
        >
          {children}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[11px] font-medium text-[var(--color-muted)]">
            No es pago de un socio:
          </DropdownMenu.Label>
          {(Object.keys(NOMBRE_CATEGORIA) as CategoriaBanco[]).map((c) => (
            <DropdownMenu.Item key={c} className={item} onSelect={() => void poner(c)}>
              <Check className={`size-3.5 ${actual === c ? "opacity-100" : "opacity-0"}`} aria-hidden />
              {NOMBRE_CATEGORIA[c]}
            </DropdownMenu.Item>
          ))}
          {actual && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />
              <DropdownMenu.Item className={item} onSelect={() => void poner(null)}>
                <X className="size-3.5" aria-hidden />
                Quitar clasificación
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
