import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import type { Liquidacion } from "@/lib/dashboard/api";

export function LiquidacionCard({ filas }: { filas: Liquidacion[] }) {
  const totales = filas.reduce(
    (acc, f) => ({
      ahorro: acc.ahorro + f.ahorro,
      actividades: acc.actividades + f.actividades,
      rifa: acc.rifa + f.rifa_chance,
      intereses: acc.intereses + f.intereses_pagados,
      aportes: acc.aportes + f.total_aportes,
      prestamos: acc.prestamos + f.deducc_prestamo,
      multas: acc.multas + f.deducc_multas,
      neto: acc.neto + f.neto_a_recibir,
    }),
    { ahorro: 0, actividades: 0, rifa: 0, intereses: 0, aportes: 0, prestamos: 0, multas: 0, neto: 0 },
  );

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Liquidación por socio</CardTitle>
        <CardDescription>
          Cada socio recibe lo que aportó (ahorro + actividades + rifa + intereses pagados)
          menos sus deudas pendientes (saldo de préstamo + multas). Sin proporción — es lo
          que le corresponde a cada uno según sus movimientos reales.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2}>Socio</TableHead>
              <TableHead className="text-center border-l" colSpan={4}>
                Aportes (+)
              </TableHead>
              <TableHead className="text-center border-l" colSpan={2}>
                Deducciones (−)
              </TableHead>
              <TableHead rowSpan={2} className="text-right border-l">
                Neto a recibir
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="text-right text-[10px] border-l">Ahorro</TableHead>
              <TableHead className="text-right text-[10px]">Activid.</TableHead>
              <TableHead className="text-right text-[10px]">Rifa</TableHead>
              <TableHead className="text-right text-[10px]">Int. pag.</TableHead>
              <TableHead className="text-right text-[10px] border-l">Préstamo</TableHead>
              <TableHead className="text-right text-[10px]">Multas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas
              .filter((f) => f.total_aportes > 0 || f.deducc_prestamo > 0 || f.deducc_multas > 0)
              .map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium text-xs">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs border-l">
                    {formatCOP(f.ahorro)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCOP(f.actividades)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCOP(f.rifa_chance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCOP(f.intereses_pagados)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs border-l text-[var(--color-warning)]">
                    {f.deducc_prestamo > 0 ? "-" + formatCOP(f.deducc_prestamo) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-[var(--color-warning)]">
                    {f.deducc_multas > 0 ? "-" + formatCOP(f.deducc_multas) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-semibold border-l ${
                      f.neto_a_recibir < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"
                    }`}
                  >
                    {formatCOP(f.neto_a_recibir)}
                  </TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-[var(--color-primary)]/5">
              <TableCell className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs border-l">
                {formatCOP(totales.ahorro)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs">
                {formatCOP(totales.actividades)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs">
                {formatCOP(totales.rifa)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs">
                {formatCOP(totales.intereses)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs border-l text-[var(--color-warning)]">
                -{formatCOP(totales.prestamos)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-warning)]">
                -{formatCOP(totales.multas)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-semibold border-l ${
                  totales.neto < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"
                }`}
              >
                {formatCOP(totales.neto)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
