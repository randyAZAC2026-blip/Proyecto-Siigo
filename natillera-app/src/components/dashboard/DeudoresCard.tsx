import { AlertCircle } from "lucide-react";
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
import type { Deudor } from "@/lib/dashboard/api";

export function DeudoresCard({ deudores }: { deudores: Deudor[] }) {
  const totalSaldo = deudores.reduce((a, d) => a + d.saldo, 0);
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="size-4 text-[var(--color-warning)]" />
          Préstamos activos ({formatCOP(totalSaldo)} por cobrar)
        </CardTitle>
        <CardDescription>{deudores.length} préstamos vigentes</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Préstamo original</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Int. pagados</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deudores.map((d) => (
              <TableRow key={d.prestamo_id}>
                <TableCell className="font-medium">{d.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCOP(d.monto_prestado)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-[var(--color-warning)]">
                  {formatCOP(d.saldo)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[var(--color-success)]">
                  {formatCOP(d.intereses_pagados)}
                </TableCell>
                <TableCell className="text-xs text-[var(--color-muted)]">
                  {d.fecha_desembolso ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
