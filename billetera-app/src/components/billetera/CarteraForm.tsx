import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/billetera/format";

export interface CarteraFormValues {
  parte: string; // acreedor o deudor según variante
  concepto: string;
  monto_total: number;
  fecha_registro: string;
  fecha_vencimiento?: string | null;
  nota?: string | null;
}

interface Props {
  variante: "por_pagar" | "por_cobrar";
  onSubmit: (values: CarteraFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

export function CarteraForm({ variante, onSubmit, onCancel }: Props) {
  const esPorPagar = variante === "por_pagar";
  const [parte, setParte] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fechaReg, setFechaReg] = useState(todayISO());
  const [fechaVenc, setFechaVenc] = useState<string>("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const montoNum = Number(monto);
    if (!parte.trim() || !concepto.trim() || !montoNum || montoNum <= 0) {
      setError("Nombre, concepto y monto son obligatorios.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        parte: parte.trim(),
        concepto: concepto.trim(),
        monto_total: montoNum,
        fecha_registro: fechaReg,
        fecha_vencimiento: fechaVenc || null,
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
        <Label htmlFor="parte">{esPorPagar ? "Acreedor" : "Deudor"}</Label>
        <Input
          id="parte"
          required
          value={parte}
          onChange={(e) => setParte(e.target.value)}
          placeholder={esPorPagar ? "¿A quién le debes?" : "¿Quién te debe?"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="concepto">Concepto</Label>
        <Input
          id="concepto"
          required
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Préstamo, servicio, venta..."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="monto-cartera">Monto total</Label>
        <Input
          id="monto-cartera"
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fecha-registro">Fecha</Label>
          <Input
            id="fecha-registro"
            type="date"
            required
            value={fechaReg}
            onChange={(e) => setFechaReg(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha-venc">Vencimiento</Label>
          <Input
            id="fecha-venc"
            type="date"
            value={fechaVenc}
            onChange={(e) => setFechaVenc(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nota">Nota</Label>
        <Textarea id="nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          {submitting ? "Guardando..." : "Registrar"}
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
