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
import type { Matriz } from "@/lib/dashboard/api";

export function MatrizAhorros({ matriz }: { matriz: Matriz }) {
  const cortaMes = (n: string) => n.charAt(0) + n.slice(1, 3).toLowerCase();
  const socios = matriz.socios.filter((s) => s.total > 0);
  const totalMes = (mes: string) => socios.reduce((t, s) => t + (s.celdas[mes] || 0), 0);
  const total = socios.reduce((t, s) => t + s.total, 0);

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base">Socio por mes</CardTitle>
        <CardDescription>
          Celda verde: pagó ese mes. Guion: no hay pago registrado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-[var(--color-surface)]">Socio</TableHead>
              {matriz.meses.map((m) => (
                <TableHead key={m.nombre} className="px-1 text-center text-xs">
                  {cortaMes(m.nombre)}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {socios.map((s) => (
                <TableRow key={s.socio_id}>
                  <TableCell className="sticky left-0 max-w-[11rem] truncate bg-[var(--color-surface)] text-xs font-medium" title={s.nombre}>
                    {s.nombre}
                  </TableCell>
                  {matriz.meses.map((m) => {
                    const v = s.celdas[m.nombre] || 0;
                    return (
                      <TableCell
                        key={m.nombre}
                        className={`px-1 text-center text-[11px] tabular-nums ${
                          v > 0
                            ? "bg-[var(--color-success)]/15 text-[#2e6b4c]"
                            : "text-[var(--color-muted)]"
                        }`}
                      >
                        {v > 0 ? formatCOP(v).replace("$", "") : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs tabular-nums font-semibold">
                    {formatCOP(s.total)}
                  </TableCell>
                </TableRow>
              ))}
            {socios.length > 0 && (
              <TableRow data-total className="bg-[var(--color-background)] font-semibold hover:bg-[var(--color-background)]">
                <TableCell className="sticky left-0 bg-[var(--color-background)]">Total del mes</TableCell>
                {matriz.meses.map((m) => {
                  const v = totalMes(m.nombre);
                  return (
                    <TableCell key={m.nombre} className="px-1 text-center text-[11px] tabular-nums">
                      {v > 0 ? formatCOP(v).replace("$", "") : "—"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right tabular-nums">{formatCOP(total)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
