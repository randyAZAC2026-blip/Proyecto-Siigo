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
import { formatCOP } from "@/lib/natillera/format";
import type { MatrizPrestamos } from "@/lib/dashboard/api";

type Modo = "total" | "abono" | "intereses";

export function MatrizPrestamosView({ matriz }: { matriz: MatrizPrestamos }) {
  const [modo, setModo] = useState<Modo>("total");
  const cortaMes = (n: string) => n.slice(0, 3);

  const totalPorMes: Record<string, { abono: number; intereses: number; total: number }> = {};
  for (const m of matriz.meses) totalPorMes[m.nombre] = { abono: 0, intereses: 0, total: 0 };
  for (const s of matriz.socios) {
    for (const [mes, c] of Object.entries(s.celdas)) {
      totalPorMes[mes].abono += c.abono;
      totalPorMes[mes].intereses += c.intereses;
      totalPorMes[mes].total += c.total;
    }
  }
  const grandTotal = matriz.socios.reduce(
    (a, s) => ({
      abono: a.abono + s.totalAbono,
      intereses: a.intereses + s.totalIntereses,
      total: a.total + s.total,
    }),
    { abono: 0, intereses: 0, total: 0 },
  );

  function valorCelda(c: { abono: number; intereses: number; total: number } | undefined) {
    if (!c) return 0;
    if (modo === "abono") return c.abono;
    if (modo === "intereses") return c.intereses;
    return c.total;
  }

  function totalSocio(s: (typeof matriz.socios)[number]) {
    if (modo === "abono") return s.totalAbono;
    if (modo === "intereses") return s.totalIntereses;
    return s.total;
  }

  function totalMes(mes: string) {
    if (modo === "abono") return totalPorMes[mes]?.abono ?? 0;
    if (modo === "intereses") return totalPorMes[mes]?.intereses ?? 0;
    return totalPorMes[mes]?.total ?? 0;
  }

  const grandTotalActual =
    modo === "abono" ? grandTotal.abono : modo === "intereses" ? grandTotal.intereses : grandTotal.total;

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Matriz de préstamos — socios × mes</CardTitle>
        <CardDescription>
          Abonos a capital + intereses pagados por cada socio en cada mes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 text-xs">
          {(["total", "abono", "intereses"] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`rounded-md border px-3 py-1 transition-colors ${
                modo === m
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
              }`}
            >
              {m === "total" ? "Abono + Intereses" : m === "abono" ? "Solo capital" : "Solo intereses"}
            </button>
          ))}
        </div>
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
            {matriz.socios.map((s) => (
              <TableRow key={s.socio_id}>
                <TableCell className="sticky left-0 bg-[var(--color-surface)] font-medium text-xs">
                  {s.nombre}
                </TableCell>
                {matriz.meses.map((m) => {
                  const v = valorCelda(s.celdas[m.nombre]);
                  return (
                    <TableCell
                      key={m.nombre}
                      className={`text-center text-xs tabular-nums ${
                        v > 0
                          ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                          : "text-[var(--color-muted)]"
                      }`}
                    >
                      {v > 0 ? formatCOP(v).replace("$", "").replace(".000", "k") : "—"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right tabular-nums font-semibold text-xs">
                  {formatCOP(totalSocio(s))}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-[var(--color-primary)]/5">
              <TableCell className="sticky left-0 bg-[var(--color-primary)]/5 font-semibold">
                TOTAL
              </TableCell>
              {matriz.meses.map((m) => (
                <TableCell key={m.nombre} className="text-center tabular-nums text-xs font-semibold">
                  {totalMes(m.nombre) > 0
                    ? formatCOP(totalMes(m.nombre)).replace("$", "").replace(".000", "k")
                    : "—"}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums font-semibold">
                {formatCOP(grandTotalActual)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
