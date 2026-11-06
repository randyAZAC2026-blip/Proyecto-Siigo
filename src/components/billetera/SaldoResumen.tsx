import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Landmark, Smartphone, Package } from "lucide-react";
import type { CuentaTipo, SaldoCuenta } from "@/lib/supabase/database.types";
import { formatCOP } from "@/lib/billetera/format";

const iconoPorTipo: Record<CuentaTipo, typeof Wallet> = {
  efectivo: Wallet,
  banco: Landmark,
  billetera_digital: Smartphone,
  otro: Package,
};

const etiquetaTipo: Record<CuentaTipo, string> = {
  efectivo: "Efectivo",
  banco: "Banco",
  billetera_digital: "Billetera digital",
  otro: "Otro",
};

interface Props {
  saldos: SaldoCuenta[];
}

export function SaldoResumen({ saldos }: Props) {
  const activos = saldos.filter((s) => !s.archivada);
  const total = activos.reduce((acc, s) => acc + Number(s.saldo_actual ?? 0), 0);

  return (
    <section className="space-y-4">
      <Card className="relative overflow-hidden rounded-[var(--radius-card)] border-[var(--color-border)]">
        {/* Halo neon detrás del saldo */}
        <div
          className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--neon-primary)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--neon-cyan)" }}
        />
        <CardHeader className="relative">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Saldo total
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <p className="neon-text font-mono text-4xl font-semibold tracking-tight text-[var(--color-text)] tabular-nums">
            {formatCOP(total)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {activos.length} {activos.length === 1 ? "cuenta activa" : "cuentas activas"}
          </p>
        </CardContent>
      </Card>

      {activos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {activos.map((s) => {
            const Icon = iconoPorTipo[s.tipo];
            return (
              <Card
                key={s.cuenta_id}
                className="rounded-[var(--radius-card)] border-[var(--color-border)] transition-colors"
              >
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {s.nombre}
                    </p>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                      {etiquetaTipo[s.tipo]}
                    </p>
                  </div>
                  <p className="font-mono text-base font-semibold text-[var(--color-text)] tabular-nums">
                    {formatCOP(Number(s.saldo_actual))}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
