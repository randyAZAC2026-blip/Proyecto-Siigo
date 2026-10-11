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
  const cortaMes = (n: string) => n.slice(0, 3);

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Matriz de ahorros — socios × mes</CardTitle>
        <CardDescription>
          Verde = pagó el mes. Vacío = pendiente. Los totales se recalculan al re-migrar el Excel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-[var(--color-surface)]">Socio</TableHead>
              {matriz.meses.map((m) => (
                <TableHead key={m.nombre} className="text-center text-xs">
                  {cortaMes(m.nombre)}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matriz.socios
              .filter((s) => s.total > 0)
              .map((s) => (
                <TableRow key={s.socio_id}>
                  <TableCell className="sticky left-0 bg-[var(--color-surface)] font-medium">
                    {s.nombre}
                  </TableCell>
                  {matriz.meses.map((m) => {
                    const v = s.celdas[m.nombre] || 0;
                    return (
                      <TableCell
                        key={m.nombre}
                        className={`text-center text-xs tabular-nums ${
                          v > 0
                            ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                            : "text-[var(--color-muted)]"
                        }`}
                      >
                        {v > 0 ? formatCOP(v).replace("$", "") : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCOP(s.total)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
