import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CircleCheck, Landmark, UserPlus, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Extracto, type Referido, type Socio } from "@/lib/dashboard/api";
import { formatCOP, formatFechaCorta, parseCOP } from "@/lib/natillera/format";

const SELECT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm";

type Entrega = "banco" | "efectivo";

/**
 * Préstamo a una persona externa recomendada por un socio. El socio que
 * recomienda responde si el referido no paga (se le descuenta en la
 * liquidación). La tasa sale de la configuración de referidos.
 */
export function NuevoPrestamoReferidoModal({
  open,
  onClose,
  onGuardado,
  tasaReferidos,
}: {
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
  tasaReferidos: number | null;
}) {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [referidos, setReferidos] = useState<Referido[]>([]);
  const [egresos, setEgresos] = useState<Extracto[]>([]);

  const [referidoId, setReferidoId] = useState<string>("nuevo");
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [recomendadoPor, setRecomendadoPor] = useState<string>("");
  const [monto, setMonto] = useState("");
  const [intereses, setIntereses] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [entrega, setEntrega] = useState<Entrega>("banco");
  const [extractoId, setExtractoId] = useState<string>("");
  const [notas, setNotas] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOk(null);
    setReferidoId("nuevo");
    setNombre("");
    setCedula("");
    setTelefono("");
    setRecomendadoPor("");
    setMonto("");
    setIntereses("");
    setExtractoId("");
    setNotas("");
    setEntrega("banco");
    Promise.all([api.socios(), api.referidos(), api.egresosPendientes()])
      .then(([s, r, e]) => {
        setSocios(s.filter((x) => x.tipo === "persona" && x.estado === "activo"));
        setReferidos(r.filter((x) => x.estado === "activo"));
        setEgresos(e);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);

  // Un referido existente ya trae quién lo recomendó.
  const existente = referidos.find((r) => String(r.id) === referidoId);
  useEffect(() => {
    if (existente) setRecomendadoPor(String(existente.referido_por));
  }, [existente]);

  const montoN = parseCOP(monto);
  const interesesN = parseCOP(intereses);
  const entregado = montoN - interesesN;

  // Salidas del banco que coinciden con lo entregado (monto − intereses).
  const coincidentes = useMemo(
    () => egresos.filter((e) => Math.abs(e.monto) === entregado),
    [egresos, entregado],
  );
  const listaEgresos = coincidentes.length > 0 ? coincidentes : egresos;
  const extractoElegido = egresos.find((x) => String(x.id) === extractoId);

  const motivo =
    tasaReferidos == null
      ? "Falta configurar la tasa de los préstamos a referidos."
      : referidoId === "nuevo" && nombre.trim().length < 3
        ? "Escribe el nombre del referido."
        : !recomendadoPor
          ? "Elige el socio que lo recomendó."
          : montoN <= 0
            ? "Escribe el monto del préstamo."
            : interesesN >= montoN
              ? "Los intereses descontados no pueden ser iguales o mayores al préstamo."
              : entrega === "banco" && !extractoId
                ? "Elige la salida del banco con la que se entregó el préstamo."
                : entrega === "banco" && extractoElegido && Math.abs(extractoElegido.monto) !== entregado
                  ? `La salida elegida es de ${formatCOP(Math.abs(extractoElegido.monto))} y lo entregado es ${formatCOP(entregado)}: deben ser iguales.`
                  : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (motivo) return setError(motivo);
    setEnviando(true);
    setError(null);
    try {
      let idReferido = existente?.id;
      if (!idReferido) {
        const r = await api.crearReferido({
          nombre,
          identificacion: cedula,
          telefono,
          referido_por: Number(recomendadoPor),
        });
        idReferido = r.id;
      }
      if (entrega === "banco") {
        const lineas = [{ concepto: "PRESTAMO", valor: montoN }];
        if (interesesN > 0) lineas.push({ concepto: "INTERESES_PRESTAMO", valor: interesesN });
        await api.crearDesglose({
          socio_id: idReferido,
          fecha_pago: fecha,
          extracto_id: Number(extractoId),
          notas: notas || undefined,
          lineas,
        });
      } else {
        await api.crearPrestamo({
          socio_id: idReferido,
          monto: montoN,
          fecha,
          intereses_descontados: interesesN,
          notas,
        });
      }
      setOk(`Préstamo registrado: ${formatCOP(montoN)} · entregado ${formatCOP(entregado)}.`);
      onGuardado();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  const socioRecomienda = socios.find((s) => String(s.id) === recomendadoPor);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-[var(--color-primary)]" />
            Nuevo préstamo a referido
          </DialogTitle>
          <DialogDescription>
            Para una persona que no es socia, recomendada por un socio. Si no paga, responde el socio que la
            recomendó: el saldo se le descuenta en su liquidación.
            {tasaReferidos != null && <> Tasa de referidos: <strong>{(tasaReferidos * 100).toLocaleString("es-CO")}% mensual</strong>.</>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          <fieldset className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
            <legend className="px-1 text-xs font-medium text-[var(--color-muted)]">Quién recibe el préstamo</legend>
            <div className="space-y-1.5">
              <Label htmlFor="ref-sel">Referido</Label>
              <select id="ref-sel" className={SELECT} value={referidoId} onChange={(e) => setReferidoId(e.target.value)}>
                <option value="nuevo">+ Nuevo referido</option>
                {referidos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                    {r.identificacion ? ` · C.C. ${r.identificacion}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {referidoId === "nuevo" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="ref-nombre">Nombre completo *</Label>
                  <Input id="ref-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-cc">Cédula</Label>
                  <Input id="ref-cc" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-tel">Teléfono</Label>
                  <Input id="ref-tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ref-por">Recomendado por (socio responsable) *</Label>
              <select
                id="ref-por"
                className={SELECT}
                value={recomendadoPor}
                onChange={(e) => setRecomendadoPor(e.target.value)}
                disabled={!!existente}
              >
                <option value="">— Elige el socio —</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              {socioRecomienda && (
                <p className="text-[11px] text-[var(--color-muted)]">
                  {socioRecomienda.nombre} tiene {formatCOP(socioRecomienda.total_aportado)} aportados
                  {socioRecomienda.saldo_prestamos > 0 ? ` y debe ${formatCOP(socioRecomienda.saldo_prestamos)} en préstamos propios` : ""}
                  {(socioRecomienda.saldo_referidos ?? 0) > 0
                    ? ` y ${formatCOP(socioRecomienda.saldo_referidos ?? 0)} de otros referidos`
                    : ""}
                  .
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
            <legend className="px-1 text-xs font-medium text-[var(--color-muted)]">Préstamo</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-monto">Monto prestado *</Label>
                <Input id="p-monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="450.000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-int">Intereses descontados</Label>
                <Input id="p-int" inputMode="numeric" value={intereses} onChange={(e) => setIntereses(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-fecha">Fecha de entrega *</Label>
                <Input id="p-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
            {montoN > 0 && (
              <p className="text-xs text-[var(--color-text)]">
                Se le entregan <strong>{formatCOP(Math.max(entregado, 0))}</strong>
                {interesesN > 0 && <> ({formatCOP(montoN)} − {formatCOP(interesesN)} de intereses)</>}. Queda debiendo{" "}
                <strong>{formatCOP(montoN)}</strong>.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
            <legend className="px-1 text-xs font-medium text-[var(--color-muted)]">Cómo se entregó</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { k: "banco", t: "Por el banco", d: "Se concilia con la salida del extracto", Icon: Landmark },
                  { k: "efectivo", t: "En efectivo", d: "Sin movimiento en el banco", Icon: Wallet },
                ] as const
              ).map(({ k, t, d, Icon }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEntrega(k)}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-left ${
                    entrega === k
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
                  }`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t}</span>
                    <span className="block text-[11px] text-[var(--color-muted)]">{d}</span>
                  </span>
                </button>
              ))}
            </div>
            {entrega === "banco" && (
              <div className="space-y-1.5">
                <Label htmlFor="p-ext">Salida del banco *</Label>
                <select id="p-ext" className={SELECT} value={extractoId} onChange={(e) => setExtractoId(e.target.value)}>
                  <option value="">— Elige la salida —</option>
                  {listaEgresos.map((x) => (
                    <option key={x.id} value={x.id}>
                      {formatFechaCorta(x.fecha)} · −{formatCOP(Math.abs(x.monto))} · {x.descripcion ?? ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {montoN > 0 && coincidentes.length > 0
                    ? `Se muestran las ${coincidentes.length} salidas pendientes por ${formatCOP(entregado)}.`
                    : montoN > 0
                      ? `No hay salidas pendientes por exactamente ${formatCOP(entregado)}; se muestran todas.`
                      : "Escribe el monto para ver las salidas que coinciden."}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="p-notas">Notas</Label>
              <Input id="p-notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} />
            </div>
          </fieldset>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-destructive)]" />
              <p className="text-sm text-[var(--color-destructive)]">{error}</p>
            </div>
          )}
          {!error && motivo && (montoN > 0 || nombre) && (
            <p className="flex items-center gap-2 text-xs text-[var(--color-warning)]">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {motivo}
            </p>
          )}
          {ok && (
            <p className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <CircleCheck className="size-4 text-[var(--status-good)]" />
              {ok}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !!motivo || !!ok}>
              {enviando ? "Registrando…" : "Registrar préstamo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
