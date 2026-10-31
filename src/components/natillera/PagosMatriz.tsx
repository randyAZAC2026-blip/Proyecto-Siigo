import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PagoDialog } from "@/components/natillera/PagoDialog";
import { findPago } from "@/lib/natillera/storage";
import { formatCOP } from "@/lib/natillera/format";
import { MESES, type Miembro, type Pago } from "@/lib/natillera/types";

type Props = {
  miembros: Miembro[];
  pagos: Pago[];
  anio: number;
  cuotaBase: number;
  onUpsert: (input: {
    miembroId: string;
    anio: number;
    mes: number;
    monto: number;
    fechaPago?: string;
    notas?: string;
  }) => void;
  onRemove: (miembroId: string, anio: number, mes: number) => void;
};

type Seleccion = { miembro: Miembro; mes: number };

export function PagosMatriz({ miembros, pagos, anio, cuotaBase, onUpsert, onRemove }: Props) {
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);

  const activos = miembros.filter((m) => m.activo);

  function estadoDePago(m: Miembro, mes: number): "pagado" | "parcial" | "vacio" {
    const pago = findPago(pagos, m.id, anio, mes);
    if (!pago) return "vacio";
    const esperada = m.cuotaMensual > 0 ? m.cuotaMensual : cuotaBase;
    if (pago.monto >= esperada) return "pagado";
    return "parcial";
  }

  function totalMiembro(m: Miembro): number {
    return pagos
      .filter((p) => p.miembroId === m.id && p.anio === anio)
      .reduce((acc, p) => acc + p.monto, 0);
  }

  function totalMes(mes: number): number {
    return pagos
      .filter((p) => p.anio === anio && p.mes === mes)
      .reduce((acc, p) => acc + p.monto, 0);
  }

  const pagoSeleccionado = seleccion
    ? findPago(pagos, seleccion.miembro.id, anio, seleccion.mes)
    : undefined;

  const cuotaSugerida = seleccion
    ? seleccion.miembro.cuotaMensual > 0
      ? seleccion.miembro.cuotaMensual
      : cuotaBase
    : cuotaBase;

  return (
    <>
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader>
          <CardTitle>Pagos {anio}</CardTitle>
          <CardDescription>
            Haz clic en una celda para registrar, editar o eliminar un pago. Verde = pagado completo,
            ámbar = pago parcial, vacío = pendiente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activos.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Agrega al menos un miembro activo para empezar a registrar pagos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-[var(--color-surface)]">Miembro</TableHead>
                  {MESES.map((m, idx) => (
                    <TableHead key={m} className="text-center">
                      {m}
                      <div className="text-[10px] font-normal text-[var(--color-muted)]">{idx + 1}</div>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="sticky left-0 bg-[var(--color-surface)] font-medium">
                      {m.nombre}
                      <div className="text-xs font-normal text-[var(--color-muted)]">
                        {formatCOP(m.cuotaMensual > 0 ? m.cuotaMensual : cuotaBase)}/mes
                      </div>
                    </TableCell>
                    {MESES.map((_, idx) => {
                      const mes = idx + 1;
                      const estado = estadoDePago(m, mes);
                      const clase =
                        estado === "pagado"
                          ? "bg-[var(--color-success)]/15 hover:bg-[var(--color-success)]/25 text-[var(--color-success)]"
                          : estado === "parcial"
                            ? "bg-[var(--color-warning)]/15 hover:bg-[var(--color-warning)]/25 text-[var(--color-warning)]"
                            : "hover:bg-[var(--color-primary)]/5 text-[var(--color-muted)]";
                      return (
                        <TableCell key={mes} className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => setSeleccion({ miembro: m, mes })}
                            className={`w-full rounded-md px-1 py-2 text-xs font-medium transition-colors ${clase}`}
                            title={
                              estado === "vacio"
                                ? "Registrar pago"
                                : `Editar pago (${formatCOP(findPago(pagos, m.id, anio, mes)!.monto)})`
                            }
                          >
                            {estado === "vacio"
                              ? "—"
                              : estado === "pagado"
                                ? "✓"
                                : "◐"}
                          </button>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCOP(totalMiembro(m))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="sticky left-0 bg-[var(--color-surface)] font-semibold">
                    Total mes
                  </TableCell>
                  {MESES.map((_, idx) => (
                    <TableCell key={idx} className="text-center text-xs tabular-nums">
                      {formatCOP(totalMes(idx + 1))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCOP(pagos.filter((p) => p.anio === anio).reduce((a, p) => a + p.monto, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PagoDialog
        open={seleccion !== null}
        onClose={() => setSeleccion(null)}
        miembro={seleccion?.miembro ?? null}
        mes={seleccion?.mes ?? null}
        anio={anio}
        pagoExistente={pagoSeleccionado}
        cuotaSugerida={cuotaSugerida}
        onSave={(input) => {
          if (!seleccion) return;
          onUpsert({
            miembroId: seleccion.miembro.id,
            anio,
            mes: seleccion.mes,
            monto: input.monto,
            fechaPago: input.fechaPago,
            notas: input.notas,
          });
        }}
        onDelete={() => {
          if (!seleccion) return;
          onRemove(seleccion.miembro.id, anio, seleccion.mes);
        }}
      />
    </>
  );
}
