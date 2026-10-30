import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cuenta, CuentaTipo } from "@/lib/supabase/database.types";
import type { CrearCuentaInput } from "@/lib/billetera/queries";
import { todayISO } from "@/lib/billetera/format";

interface Props {
  cuenta?: Cuenta;
  onSubmit: (input: CrearCuentaInput) => Promise<void> | void;
  onCancel?: () => void;
}

const TIPOS: { value: CuentaTipo; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "banco", label: "Banco" },
  { value: "billetera_digital", label: "Billetera digital" },
  { value: "otro", label: "Otro" },
];

export function CuentaForm({ cuenta, onSubmit, onCancel }: Props) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [tipo, setTipo] = useState<CuentaTipo>(cuenta?.tipo ?? "efectivo");
  const [saldoInicial, setSaldoInicial] = useState<string>(
    cuenta ? String(cuenta.saldo_inicial) : "0",
  );
  const [fecha, setFecha] = useState(cuenta?.fecha_saldo_inicial ?? todayISO());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("Dale un nombre a la cuenta.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        tipo,
        saldo_inicial: Number(saldoInicial) || 0,
        fecha_saldo_inicial: fecha,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cuenta-nombre">Nombre</Label>
        <Input
          id="cuenta-nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Efectivo bolsillo, Bancolombia, Nequi..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as CuentaTipo)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="saldo-inicial">Saldo inicial</Label>
          <Input
            id="saldo-inicial"
            type="number"
            inputMode="decimal"
            step="any"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha-saldo">Fecha del saldo</Label>
          <Input
            id="fecha-saldo"
            type="date"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          {submitting ? "Guardando..." : cuenta ? "Guardar cambios" : "Crear cuenta"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
