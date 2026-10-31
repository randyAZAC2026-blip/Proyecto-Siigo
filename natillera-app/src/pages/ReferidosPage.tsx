import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type TasasPrestamo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOP, formatCOPCompacto, formatFechaCorta } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import { NuevoPrestamoReferidoModal } from "@/components/dashboard/NuevoPrestamoReferidoModal";

const pct = (t: number | null) => (t == null ? "—" : `${(t * 100).toLocaleString("es-CO")}%`);

/** Tasas de interés mensual de la natillera, editables por tesorería. */
function TasasCard({ tasas, onGuardado }: { tasas: TasasPrestamo; onGuardado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [socios, setSocios] = useState("");
  const [referidos, setReferidos] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abrir = () => {
    setSocios(tasas.socios != null ? String(tasas.socios * 100) : "");
    setReferidos(tasas.referidos != null ? String(tasas.referidos * 100) : "");
    setError(null);
    setEditando(true);
  };

  async function guardar() {
    const s = Number(socios.replace(",", "."));
    const r = Number(referidos.replace(",", "."));
    if (!(s >= 0 && s <= 100) || !(r >= 0 && r <= 100)) return setError("Escribe porcentajes entre 0 y 100.");
    try {
      await api.guardarTasa("socios", s / 100);
      await api.guardarTasa("referidos", r / 100);
      setEditando(false);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm shadow-[var(--shadow-card)]"
      data-print="hide"
    >
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">Interés mensual</span>
      {editando ? (
        <>
          <label className="flex items-center gap-2">
            Socios
            <Input className="h-8 w-20" inputMode="decimal" value={socios} onChange={(e) => setSocios(e.target.value)} />%
          </label>
          <label className="flex items-center gap-2">
            Referidos
            <Input className="h-8 w-20" inputMode="decimal" value={referidos} onChange={(e) => setReferidos(e.target.value)} />%
          </label>
          <Button size="sm" onClick={guardar}>Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
          <span className="w-full text-[11px] text-[var(--color-muted)]">
            Aplica a los préstamos que se creen de aquí en adelante; los existentes conservan su tasa.
          </span>
        </>
      ) : (
        <>
          <span>
            Socios <strong>{pct(tasas.socios)}</strong>
          </span>
          <span>
            Referidos <strong>{pct(tasas.referidos)}</strong>
          </span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2" onClick={abrir}>
            <Pencil className="size-3.5" /> Cambiar
          </Button>
        </>
      )}
    </div>
  );
}

export function ReferidosPage({ onVolver: _onVolver }: { onVolver: () => void }) {
  const prestamosQ = useApi(() => api.prestamosReferidos(), []);
  const tasasQ = useApi(() => api.tasasPrestamo(), []);
  const [modal, setModal] = useState(false);

  const filas = prestamosQ.data ?? [];
  const activos = filas.filter((p) => p.estado === "activo");
  const saldo = activos.reduce((t, p) => t + p.saldo, 0);
  const intereses = filas.reduce((t, p) => t + p.intereses_pagados, 0);
  const personas = new Set(filas.map((p) => p.referido_id)).size;

  // Totales por socio responsable (lo que se le descontaría si sus referidos no pagan).
  const porResponsable = Object.values(
    activos.reduce<Record<number, { nombre: string; saldo: number; n: number }>>((acc, p) => {
      const r = (acc[p.responsable_id] ??= { nombre: p.responsable, saldo: 0, n: 0 });
      r.saldo += p.saldo;
      r.n += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.saldo - a.saldo);

  const recargar = () => {
    prestamosQ.reload();
    tasasQ.reload();
  };

  return (
    <InformeLayout
      titulo="Préstamos a referidos"
      descripcion="Personas que no son socias, recomendadas por un socio. Si el referido no paga, responde el socio que lo recomendó: el saldo se le descuenta en su liquidación."
      Icon={UserPlus}
      cargando={prestamosQ.loading}
      error={prestamosQ.error ?? tasasQ.error}
      listo={!!prestamosQ.data}
      onActualizar={recargar}
      acciones={
        <Button size="sm" variant="outline" onClick={() => setModal(true)} className="gap-1">
          <UserPlus className="size-4" />
          Nuevo préstamo a referido
        </Button>
      }
      avisos={tasasQ.data ? <TasasCard tasas={tasasQ.data} onGuardado={tasasQ.reload} /> : undefined}
      resumen={[
        { label: "Referidos", valor: String(personas) },
        { label: "Préstamos activos", valor: String(activos.length) },
        { label: "Saldo por cobrar", valor: formatCOPCompacto(saldo), tono: saldo > 0 ? "alerta" : "bueno" },
        { label: "Intereses cobrados", valor: formatCOPCompacto(intereses) },
      ]}
      excel={() => [
        {
          nombre: "Préstamos a referidos",
          columnas: [
            { titulo: "Referido", tipo: "texto", ancho: 28 },
            { titulo: "Cédula", tipo: "texto", ancho: 14 },
            { titulo: "Teléfono", tipo: "texto", ancho: 14 },
            { titulo: "Recomendado por", tipo: "texto", ancho: 26 },
            { titulo: "Fecha", tipo: "fecha" },
            { titulo: "Monto prestado", tipo: "moneda" },
            { titulo: "Tasa mensual", tipo: "texto", ancho: 10 },
            { titulo: "Intereses pagados", tipo: "moneda" },
            { titulo: "Saldo", tipo: "moneda" },
            { titulo: "Estado", tipo: "texto", ancho: 10 },
          ],
          filas: filas.map((p) => [
            p.referido,
            p.identificacion,
            p.telefono,
            p.responsable,
            p.fecha_desembolso,
            p.monto_prestado,
            pct(p.tasa_interes),
            p.intereses_pagados,
            p.saldo,
            p.estado,
          ]),
          totales: ["TOTAL", null, null, null, null, filas.reduce((t, p) => t + p.monto_prestado, 0), null, intereses, saldo, null],
        },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] shadow-[var(--shadow-card)] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Préstamos</CardTitle>
            <CardDescription>Del más reciente al más antiguo.</CardDescription>
          </CardHeader>
          <CardContent>
            {filas.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                Aún no hay préstamos a referidos. Usa “Nuevo préstamo a referido”.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referido</TableHead>
                    <TableHead>Recomendado por</TableHead>
                    <TableHead className="text-right">Prestado</TableHead>
                    <TableHead className="text-right">Intereses</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((p) => (
                    <TableRow key={p.prestamo_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.referido}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">
                          {formatFechaCorta(p.fecha_desembolso)} · {pct(p.tasa_interes)} mensual
                          {p.telefono ? ` · ${p.telefono}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{p.responsable}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCOP(p.monto_prestado)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCOP(p.intereses_pagados)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">
                        {p.estado === "pagado" ? "Pagado" : formatCOP(p.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow data-total className="bg-[var(--color-background)] font-semibold hover:bg-[var(--color-background)]">
                    <TableCell colSpan={2} className="text-xs">Total</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCOP(filas.reduce((t, p) => t + p.monto_prestado, 0))}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCOP(intereses)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCOP(saldo)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit rounded-[var(--radius-card)] border-[var(--color-border)] shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Socios responsables</CardTitle>
            <CardDescription>Lo que se les descontaría en la liquidación si sus referidos no pagan.</CardDescription>
          </CardHeader>
          <CardContent>
            {porResponsable.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Ningún socio responde hoy por referidos.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {porResponsable.map((r) => (
                  <li key={r.nombre} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{r.nombre}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">
                        {r.n} préstamo{r.n > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCOP(r.saldo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <NuevoPrestamoReferidoModal
        open={modal}
        onClose={() => setModal(false)}
        onGuardado={recargar}
        tasaReferidos={tasasQ.data?.referidos ?? null}
      />
    </InformeLayout>
  );
}
