import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Categoria,
  Cuenta,
  FuenteIngreso,
  MovimientoTipo,
} from "@/lib/supabase/database.types";
import type { CrearMovimientoInput } from "@/lib/billetera/queries";
import { todayISO } from "@/lib/billetera/format";

interface Props {
  cuentas: Cuenta[];
  categorias: Categoria[];
  fuentesIngreso?: FuenteIngreso[];
  defaultTipo?: MovimientoTipo;
  // Si se pasan, el form queda pre-ligado a una CxP o CxC (saldo pendiente de cobro/pago).
  cxpId?: string;
  cxcId?: string;
  defaultMonto?: number;
  defaultContraparte?: string;
  defaultDescripcion?: string;
  defaultFuenteIngresoId?: string;
  submitLabel?: string;
  onSubmit: (input: CrearMovimientoInput) => Promise<void> | void;
  onCancel?: () => void;
}

export function MovimientoForm({
  cuentas,
  categorias,
  fuentesIngreso,
  defaultTipo = "egreso",
  cxpId,
  cxcId,
  defaultMonto,
  defaultContraparte,
  defaultDescripcion,
  defaultFuenteIngresoId,
  submitLabel = "Registrar",
  onSubmit,
  onCancel,
}: Props) {
  const cuentasActivas = useMemo(() => cuentas.filter((c) => !c.archivada), [cuentas]);
  const fuentesActivas = useMemo(
    () => (fuentesIngreso ?? []).filter((f) => f.activa),
    [fuentesIngreso],
  );

  const [tipo, setTipo] = useState<MovimientoTipo>(defaultTipo);
  const [cuentaId, setCuentaId] = useState<string>(cuentasActivas[0]?.id ?? "");
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string>("");
  const [monto, setMonto] = useState<string>(defaultMonto ? String(defaultMonto) : "");
  const [fecha, setFecha] = useState<string>(todayISO());
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [descripcion, setDescripcion] = useState<string>(defaultDescripcion ?? "");
  const [contraparte, setContraparte] = useState<string>(defaultContraparte ?? "");
  const [fuenteIngresoId, setFuenteIngresoId] = useState<string>(defaultFuenteIngresoId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoriasFiltradas = useMemo(
    () => categorias.filter((c) => (tipo === "transferencia" ? false : c.tipo === tipo)),
    [categorias, tipo],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const montoNum = Number(monto);
    if (!cuentaId || !montoNum || montoNum <= 0) {
      setError("Monto y cuenta son obligatorios.");
      return;
    }
    if (tipo === "transferencia" && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
      setError("Elige una cuenta destino distinta a la de origen.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        cuenta_id: cuentaId,
        cuenta_destino_id: tipo === "transferencia" ? cuentaDestinoId : null,
        tipo,
        monto: montoNum,
        fecha,
        descripcion: descripcion || null,
        categoria_id: tipo === "transferencia" ? null : categoriaId || null,
        contraparte: contraparte || null,
        cxp_id: cxpId ?? null,
        cxc_id: cxcId ?? null,
        fuente_ingreso_id: tipo === "ingreso" ? fuenteIngresoId || null : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  const ligadoACartera = Boolean(cxpId || cxcId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!ligadoACartera && (
        <div className="grid grid-cols-3 gap-2">
          {(["ingreso", "egreso", "transferencia"] as MovimientoTipo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={[
                "rounded-[var(--radius-default)] border px-3 py-2 text-sm font-medium capitalize transition-colors",
                tipo === t
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="monto">Monto (COP)</Label>
        <Input
          id="monto"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Cuenta {tipo === "transferencia" ? "origen" : ""}</Label>
        <Select value={cuentaId} onValueChange={setCuentaId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Elige una cuenta" />
          </SelectTrigger>
          <SelectContent>
            {cuentasActivas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tipo === "transferencia" && (
        <div className="space-y-1.5">
          <Label>Cuenta destino</Label>
          <Select value={cuentaDestinoId} onValueChange={setCuentaDestinoId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elige la cuenta destino" />
            </SelectTrigger>
            <SelectContent>
              {cuentasActivas
                .filter((c) => c.id !== cuentaId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {tipo !== "transferencia" && (
        <div className="space-y-1.5">
          <Label>Categoría (opcional)</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              {categoriasFiltradas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {tipo === "ingreso" && fuentesActivas.length > 0 && (
        <div className="space-y-1.5">
          <Label>Fuente de ingreso (opcional)</Label>
          <Select value={fuenteIngresoId} onValueChange={setFuenteIngresoId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin fuente" />
            </SelectTrigger>
            <SelectContent>
              {fuentesActivas.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nombre} {f.frecuencia === "fijo" ? "(fijo)" : "(variable)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="fecha">Fecha</Label>
        <Input id="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {tipo !== "transferencia" && (
        <div className="space-y-1.5">
          <Label htmlFor="contraparte">Contraparte (opcional)</Label>
          <Input
            id="contraparte"
            value={contraparte}
            onChange={(e) => setContraparte(e.target.value)}
            placeholder={tipo === "ingreso" ? "¿De quién recibiste?" : "¿A quién le pagaste?"}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Textarea
          id="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Nota breve"
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          {submitting ? "Guardando..." : submitLabel}
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
