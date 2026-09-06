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
  const totalAhorro = filas.reduce((a, f) => a + f.ahorro_socio, 0);
  const totalUtilidad = filas.reduce((a, f) => a + f.utilidad_estimada, 0);
  const totalNeto = filas.reduce((a, f) => a + f.neto_a_pagar_estimado, 0);

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Liquidación estimada</CardTitle>
        <CardDescription>
          Utilidad total ({formatCOP(totalUtilidad)}) repartida proporcional al ahorro individual.
          Si cerramos el ciclo HOY, esto es lo que le tocaría a cada socio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Ahorro</TableHead>
              <TableHead className="text-right">% pot</TableHead>
              <TableHead className="text-right">Ganancia</TableHead>
              <TableHead className="text-right">Neto a pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas
              .filter((f) => f.ahorro_socio > 0)
              .map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCOP(f.ahorro_socio)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[var(--color-muted)]">
                    {(f.proporcion * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[var(--color-success)]">
                    {formatCOP(f.utilidad_estimada)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCOP(f.neto_a_pagar_estimado)}
                  </TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-[var(--color-primary)]/5">
              <TableCell className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatCOP(totalAhorro)}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums font-semibold text-[var(--color-success)]">
                {formatCOP(totalUtilidad)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatCOP(totalNeto)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
