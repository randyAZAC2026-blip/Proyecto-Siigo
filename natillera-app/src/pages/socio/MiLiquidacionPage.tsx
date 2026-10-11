import { AlertCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOP } from "@/lib/natillera/format";

function Linea({ label, valor, signo }: { label: string; valor: number; signo: "+" | "-" }) {
  if (!valor) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={`tabular-nums font-medium ${signo === "-" ? "text-[var(--color-destructive)]" : ""}`}>
        {signo === "-" ? "- " : ""}
        {formatCOP(valor)}
      </span>
    </div>
  );
}

// La liquidación del socio como un recibo: lo que aportó menos lo que debe.
export function MiLiquidacionPage({ socioId }: { socioId: number }) {
  const { data, loading, error } = useApi(() => api.liquidacion(), []);
  const l = data?.find((f) => f.id === socioId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3" data-print="hide">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Mi liquidación</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Lo que recibirías si el ciclo se cerrara hoy.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir / PDF
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}
      {loading && !data && <Skeleton className="h-64 rounded-[var(--radius-card)]" />}
      {data && !l && <p className="text-sm text-[var(--color-muted)]">Todavía no hay movimientos para calcular tu liquidación.</p>}

      {l && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{l.nombre}</CardTitle>
            <CardDescription>Estimado con los movimientos registrados hasta hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-[var(--color-border)]">
              <Linea label="Ahorro" valor={l.ahorro} signo="+" />
              <Linea label="Actividades" valor={l.actividades} signo="+" />
              <Linea label="Rifa / chance" valor={l.rifa_chance} signo="+" />
              <Linea label="Intereses pagados" valor={l.intereses_pagados} signo="+" />
              <div className="flex items-center justify-between gap-3 py-2 text-sm font-semibold">
                <span>Total aportado</span>
                <span className="tabular-nums">{formatCOP(l.total_aportes)}</span>
              </div>
              <Linea label="Saldo de préstamos" valor={l.deducc_prestamo} signo="-" />
              <Linea label="Multas pendientes" valor={l.deducc_multas} signo="-" />
              <Linea label="Mora de intereses" valor={l.deducc_mora_intereses} signo="-" />
              <Linea label="Mora de ahorro" valor={l.deducc_mora_ahorro} signo="-" />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-3 py-2">
              <span className="text-sm font-semibold">Neto a recibir</span>
              <span
                className={`text-lg font-bold tabular-nums ${l.neto_a_recibir < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-primary)]"}`}
              >
                {formatCOP(l.neto_a_recibir)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
