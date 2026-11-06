import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FrecuenciaIngreso, FuenteIngreso } from "@/lib/supabase/database.types";

export interface FuenteIngresoFormValues {
  nombre: string;
  frecuencia: FrecuenciaIngreso;
  monto_esperado_mensual: number | null;
  nota: string | null;
}

interface Props {
  fuente?: FuenteIngreso;
  onSubmit: (values: FuenteIngresoFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

export function FuenteIngresoForm({ fuente, onSubmit, onCancel }: Props) {
  const [nombre, setNombre] = useState(fuente?.nombre ?? "");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaIngreso>(fuente?.frecuencia ?? "fijo");
  const [monto, setMonto] = useState<string>(
    fuente?.monto_esperado_mensual != null ? String(fuente.monto_esperado_mensual) : "",
  );
  const [nota, setNota] = useState(fuente?.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("Dale un nombre a la fuente.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        frecuencia,
        monto_esperado_mensual: monto ? Number(monto) : null,
        nota: nota.trim() || null,
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
        <Label htmlFor="fuente-nombre">Nombre</Label>
        <Input
          id="fuente-nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Salario empresa X, Freelance, Arriendo apto 201..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Frecuencia</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["fijo", "variable"] as FrecuenciaIngreso[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrecuencia(f)}
              className={[
                "rounded-[var(--radius-default)] border px-3 py-2 text-sm font-medium capitalize transition-colors",
                frecuencia === f
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
              ].join(" ")}
            >
              {f === "fijo" ? "Fijo (mensual)" : "Variable"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="monto-esperado">
          Monto esperado mensual {frecuencia === "fijo" ? "" : "(opcional)"}
        </Label>
        <Input
          id="monto-esperado"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder={frecuencia === "fijo" ? "Ej. 3000000" : "Déjalo vacío si no aplica"}
        />
        <p className="text-xs text-[var(--color-muted)]">
          Se usa para mostrar "recibido / esperado" en el dashboard. Déjalo vacío si no quieres
          llevar ese contraste.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fuente-nota">Nota (opcional)</Label>
        <Textarea
          id="fuente-nota"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Detalles, condiciones, acuerdo..."
        />
      </div>

      {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          {submitting ? "Guardando..." : fuente ? "Guardar cambios" : "Crear fuente"}
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
