import { useMemo, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api, type Deudor, type MatrizPrestamos } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { USA_SUPABASE } from "@/lib/dashboard/api";
import { DetalladoPrestamosButton } from "@/components/dashboard/DetalladoPrestamosButton";

type Orden = "saldo_desc" | "nombre";

interface PrestamoDetalle {
  prestamo_id: number;
  monto_prestado: number;
  saldo: number;
  intereses_pagados: number;
  fecha_desembolso: string | null;
}

interface FilaSocio {
  socio_id: number;
  socio: string;
  prestamos: PrestamoDetalle[];
  monto_prestado: number;
  saldo: number;
  intereses_pagados: number;
  estado: "activo" | "cancelado";
}

// modoSocio: "Mis préstamos" del socio que entró. RLS ya le devuelve solo sus filas;
// aquí se ocultan los controles pensados para revisar a todo el grupo.
export function PrestamosPage({ onVolver, modoSocio = false }: { onVolver?: () => void; modoSocio?: boolean }) {
  const deudoresQ = useApi(() => api.deudores(), []);
  const matrizQ = useApi(() => api.matrizPrestamos(), []);

  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("saldo_desc");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const loading = deudoresQ.loading || matrizQ.loading;
  const error = deudoresQ.error || matrizQ.error;

  function reload() {
    deudoresQ.reload();
    matrizQ.reload();
  }

  function toggle(id: number) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filas: FilaSocio[] = useMemo(() => {
    if (!deudoresQ.data) return [];
    const porSocio = new Map<number, FilaSocio>();
    for (const d of deudoresQ.data as Deudor[]) {
      const detalle: PrestamoDetalle = {
        prestamo_id: d.prestamo_id,
        monto_prestado: d.monto_prestado,
        saldo: d.saldo,
        intereses_pagados: d.intereses_pagados,
        fecha_desembolso: d.fecha_desembolso,
      };
      const existente = porSocio.get(d.id);
      if (existente) {
        existente.prestamos.push(detalle);
        existente.monto_prestado += detalle.monto_prestado;
        existente.saldo += detalle.saldo;
        existente.intereses_pagados += detalle.intereses_pagados;
      } else {
        porSocio.set(d.id, {
          socio_id: d.id,
          socio: d.nombre,
          prestamos: [detalle],
          monto_prestado: detalle.monto_prestado,
          saldo: detalle.saldo,
          intereses_pagados: detalle.intereses_pagados,
          estado: "activo",
        });
      }
    }
    for (const f of porSocio.values()) {
      f.estado = f.saldo <= 0 ? "cancelado" : "activo";
    }
    return Array.from(porSocio.values());
  }, [deudoresQ.data]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtered = q
      ? filas.filter((f) => f.socio.toLowerCase().includes(q))
      : filas;
    const sorted = [...filtered];
    if (orden === "saldo_desc") sorted.sort((a, b) => b.saldo - a.saldo);
    else sorted.sort((a, b) => a.socio.localeCompare(b.socio));
    return sorted;
  }, [filas, busqueda, orden]);

  const tot = useMemo(
    () =>
      filas.reduce(
        (a, f) => ({
          total_prestado: a.total_prestado + f.monto_prestado,
          saldo_capital: a.saldo_capital + f.saldo,
          intereses_cobrados: a.intereses_cobrados + f.intereses_pagados,
          activos: a.activos + (f.estado !== "cancelado" ? 1 : 0),
        }),
        {
          total_prestado: 0,
          saldo_capital: 0,
          intereses_cobrados: 0,
          activos: 0,
        },
      ),
    [filas],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">{modoSocio ? "Mis préstamos" : "Préstamos"}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {modoSocio
              ? "Lo que te han prestado, lo que has abonado y lo que te falta."
              : "Un socio por fila con todos sus préstamos acumulados. Clic para ver el detalle."}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {USA_SUPABASE && !modoSocio && <DetalladoPrestamosButton />}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          {onVolver && (
            <Button variant="ghost" size="sm" onClick={onVolver}>
              ← Volver
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      <div className={`grid gap-3 grid-cols-2 ${modoSocio ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <MiniTile label="Total prestado" value={formatCOP(tot.total_prestado)} color="var(--color-muted)" />
        <MiniTile
          label="Saldo capital pendiente"
          value={formatCOP(tot.saldo_capital)}
          color="var(--color-warning)"
        />
        <MiniTile
          label="Intereses cobrados"
          value={formatCOP(tot.intereses_cobrados)}
          color="var(--color-success)"
        />
        {!modoSocio && (
          <MiniTile
            label="Socios con préstamo"
            value={String(tot.activos)}
            color="var(--color-primary)"
          />
        )}
      </div>

      {loading && !deudoresQ.data && (
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      )}

      {deudoresQ.data && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {modoSocio ? (
                "Detalle"
              ) : (
                <>
                  Socios con préstamo ({filtradas.length}
                  {filtradas.length !== filas.length ? ` de ${filas.length}` : ""})
                </>
              )}
            </CardTitle>
            <CardDescription>
              {modoSocio
                ? "Tus préstamos, abonos mes a mes y vencimientos de intereses."
                : "Clic en cualquier fila para ver los préstamos individuales y la matriz mensual."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-sm:px-3">
            <div className={`flex flex-wrap gap-2 items-center ${modoSocio ? "hidden" : ""}`}>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted)]" />
                <Input
                  placeholder="Buscar socio…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {(["saldo_desc", "nombre"] as Orden[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrden(o)}
                    className={`rounded-md border px-3 py-1 transition-colors ${
                      orden === o
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                    }`}
                  >
                    {o === "saldo_desc"
                      ? "Ordenar por saldo"
                      : "Ordenar por nombre"}
                  </button>
                ))}
              </div>
            </div>

            {/* En celular cada socio es una tarjeta; la tabla aparece desde sm. */}
            <ul className="sm:hidden space-y-2">
              {filtradas.map((f) => (
                <TarjetaSocio
                  key={f.socio_id}
                  fila={f}
                  matriz={matrizQ.data}
                  abierto={modoSocio || abiertos.has(f.socio_id)}
                  onToggle={() => toggle(f.socio_id)}
                />
              ))}
              {filtradas.length === 0 && (
                <li className="py-6 text-center text-sm text-[var(--color-muted)]">
                  {busqueda
                    ? "No hay socios con préstamo que coincidan con la búsqueda."
                    : modoSocio
                      ? "No tienes préstamos registrados."
                      : "No hay socios con préstamos registrados."}
                </li>
              )}
            </ul>

            <Table className="hidden sm:table">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Socio</TableHead>
                  <TableHead className="text-center">Préstamos</TableHead>
                  <TableHead className="text-right">Capital inicial</TableHead>
                  <TableHead className="text-right">Saldo capital</TableHead>
                  <TableHead className="text-right">Int. pagados</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((f) => (
                  <FilaExpansible
                    key={f.socio_id}
                    fila={f}
                    matriz={matrizQ.data}
                      abierto={modoSocio || abiertos.has(f.socio_id)}
                    onToggle={() => toggle(f.socio_id)}
                  />
                ))}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-[var(--color-muted)]">
                      {busqueda
                        ? "No hay socios con préstamo que coincidan con la búsqueda."
                        : modoSocio
                      ? "No tienes préstamos registrados."
                      : "No hay socios con préstamos registrados."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums mt-1" style={{ color }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function badgeEstado(estado: FilaSocio["estado"]) {
  return estado === "activo"
    ? { label: "Activo", clase: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" }
    : { label: "Cancelado", clase: "bg-[var(--color-muted)]/20 text-[var(--color-muted)]" };
}

function Dato({ label, valor, clase = "" }: { label: string; valor: string; clase?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`text-xs tabular-nums ${clase}`}>{valor}</div>
    </div>
  );
}

// Versión móvil de FilaExpansible: los montos clave a la vista y el detalle debajo al tocar.
function TarjetaSocio({
  fila,
  matriz,
  abierto,
  onToggle,
}: {
  fila: FilaSocio;
  matriz: MatrizPrestamos | null;
  abierto: boolean;
  onToggle: () => void;
}) {
  const estadoBadge = badgeEstado(fila.estado);
  return (
    <li className="rounded-lg border border-[var(--color-border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="w-full space-y-2 p-3 text-left hover:bg-[var(--color-primary)]/5"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-start gap-1 text-sm font-medium break-words">
            {abierto ? (
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" />
            ) : (
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" />
            )}
            {fila.socio}
          </span>
          <Badge variant="secondary" className={`shrink-0 ${estadoBadge.clase}`}>
            {estadoBadge.label}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Dato label="Saldo capital" valor={formatCOP(fila.saldo)} clase="font-semibold text-[var(--color-warning)]" />
          <Dato label="Capital inicial" valor={formatCOP(fila.monto_prestado)} />
          <Dato label="Int. pagados" valor={formatCOP(fila.intereses_pagados)} clase="text-[var(--color-success)]" />
        </div>
        <div className="text-[11px] text-[var(--color-muted)]">
          {fila.prestamos.length} {fila.prestamos.length === 1 ? "préstamo" : "préstamos"}
        </div>
      </button>
      {abierto && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-primary)]/5 p-3">
          <Detalle fila={fila} matriz={matriz} />
        </div>
      )}
    </li>
  );
}

function FilaExpansible({
  fila,
  matriz,
  abierto,
  onToggle,
}: {
  fila: FilaSocio;
  matriz: MatrizPrestamos | null;
  abierto: boolean;
  onToggle: () => void;
}) {
  const estadoBadge = badgeEstado(fila.estado);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-[var(--color-primary)]/5" onClick={onToggle}>
        <TableCell className="w-8">
          {abierto ? (
            <ChevronDown className="size-4 text-[var(--color-muted)]" />
          ) : (
            <ChevronRight className="size-4 text-[var(--color-muted)]" />
          )}
        </TableCell>
        <TableCell className="font-medium text-xs">{fila.socio}</TableCell>
        <TableCell className="text-center text-xs">{fila.prestamos.length}</TableCell>
        <TableCell className="text-right tabular-nums text-xs">
          {formatCOP(fila.monto_prestado)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs font-semibold text-[var(--color-warning)]">
          {formatCOP(fila.saldo)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs text-[var(--color-success)]">
          {formatCOP(fila.intereses_pagados)}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary" className={estadoBadge.clase}>
            {estadoBadge.label}
          </Badge>
        </TableCell>
      </TableRow>
      {abierto && (
        <TableRow>
          <TableCell colSpan={7} className="bg-[var(--color-primary)]/5 p-4">
            <Detalle fila={fila} matriz={matriz} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// En celular los encabezados del detalle pueden partirse en dos líneas y las celdas van más juntas.
const TABLA_COMPACTA =
  "[&_th]:h-auto [&_th]:py-1.5 [&_th]:text-xs [&_th]:whitespace-normal max-sm:[&_th]:px-1 max-sm:[&_td]:px-1";

function Detalle({
  fila,
  matriz,
}: {
  fila: FilaSocio;
  matriz: MatrizPrestamos | null;
}) {
  const socioMatriz = matriz?.socios.find((s) => s.socio_id === fila.socio_id);

  return (
    <div className="space-y-4">
      {USA_SUPABASE && (
        <div className="flex justify-end">
          <DetalladoPrestamosButton
            socio={{ id: fila.socio_id, nombre: fila.socio }}
            etiqueta={`Detallado de ${fila.socio} en Excel`}
          />
        </div>
      )}
      {fila.prestamos.length > 1 && (
        <div>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
            Préstamos individuales ({fila.prestamos.length})
          </div>
          <Table className={TABLA_COMPACTA}>
            <TableHeader>
              <TableRow>
                <TableHead><span className="max-sm:hidden">Préstamo </span>#</TableHead>
                <TableHead className="hidden sm:table-cell">Desembolso</TableHead>
                <TableHead className="text-right">Capital inicial</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Intereses pagados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fila.prestamos.map((p) => (
                <TableRow key={p.prestamo_id}>
                  <TableCell className="text-xs">#{p.prestamo_id}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{p.fecha_desembolso ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCOP(p.monto_prestado)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCOP(p.saldo)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular-nums text-xs">
                    {formatCOP(p.intereses_pagados)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
          Matriz mensual — {fila.socio}
        </div>
        {socioMatriz ? (
          <Table className={TABLA_COMPACTA}>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Abono capital</TableHead>
                <TableHead className="text-right">Intereses pagados</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matriz!.meses.map((m) => {
                const c = socioMatriz.celdas[m.nombre] ?? {
                  abono: 0,
                  intereses: 0,
                  total: 0,
                };
                if (c.abono === 0 && c.intereses === 0) return null;
                return (
                  <TableRow key={m.nombre}>
                    <TableCell className="text-xs">{m.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {c.abono > 0 ? formatCOP(c.abono) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {c.intereses > 0 ? formatCOP(c.intereses) : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums text-xs font-semibold">
                      {formatCOP(c.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-[var(--color-primary)]/5">
                <TableCell className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.totalAbono)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.totalIntereses)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div className="text-xs text-[var(--color-muted)]">
            Sin movimientos mensuales registrados.
          </div>
        )}
      </div>

    </div>
  );
}
