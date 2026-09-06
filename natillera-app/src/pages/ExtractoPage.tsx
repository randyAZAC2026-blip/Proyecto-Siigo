import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Search,
  Link2,
  Link2Off,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api, type Extracto, type Socio } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

export function ExtractoPage({ onVolver }: { onVolver: () => void }) {
  const [banco, setBanco] = useState<string>("");
  const [origen, setOrigen] = useState<string>("");
  const [conciliado, setConciliado] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const filtros = useMemo(
    () => ({
      banco: banco || undefined,
      origen: origen || undefined,
      conciliado: (conciliado as "true" | "false") || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      limit,
      offset,
    }),
    [banco, origen, conciliado, desde, hasta, q, offset],
  );

  const { data, loading, error, reload } = useApi(() => api.extractos(filtros), [
    filtros,
  ]);
  const sociosApi = useApi(() => api.socios(), []);

  useEffect(() => setOffset(0), [banco, origen, conciliado, desde, hasta, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <Landmark className="size-6 text-[var(--color-primary)]" />
            Extracto bancario
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {data?.total ?? 0} movimientos totales · filtra y marca cada uno como NATILLERA /
            PERSONAL, o vincula a una transacción registrada.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver
        </Button>
      </div>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="Bancolombia">Bancolombia</option>
                <option value="Nequi">Nequi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Origen</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="NATILLERA">NATILLERA</option>
                <option value="PERSONAL">PERSONAL</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Conciliado</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={conciliado}
                onChange={(e) => setConciliado(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-muted)]" />
                <Input
                  className="pl-7"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="descripción / socio"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Movimientos {loading && "cargando…"}
          </CardTitle>
          <CardDescription>
            Página {Math.floor(offset / limit) + 1} de{" "}
            {Math.max(1, Math.ceil((data?.total ?? 0) / limit))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Socio</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-center">Origen</TableHead>
                <TableHead className="text-center">Conciliado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.filas.map((fila) => (
                <ExtractoRow
                  key={fila.id}
                  fila={fila}
                  socios={sociosApi.data ?? []}
                  onCambio={reload}
                />
              ))}
              {!loading && data?.filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-[var(--color-muted)]">
                    Sin movimientos con esos filtros
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              ← Anterior
            </Button>
            <span className="text-xs text-[var(--color-muted)]">
              Mostrando {data?.filas.length ?? 0} de {data?.total ?? 0}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || offset + limit >= data.total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExtractoRow({
  fila,
  socios,
  onCambio,
}: {
  fila: Extracto;
  socios: Socio[];
  onCambio: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function marcarOrigen(v: string) {
    setSaving(true);
    try {
      await api.marcarOrigenExtracto(fila.id, v || null);
      onCambio();
    } finally {
      setSaving(false);
    }
  }

  async function desvincular() {
    if (!confirm("¿Desvincular este movimiento de su transacción?")) return;
    setSaving(true);
    try {
      await api.vincularExtracto(fila.id, null);
      onCambio();
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="text-xs">{fila.fecha ?? "—"}</TableCell>
      <TableCell className="text-xs">{fila.banco}</TableCell>
      <TableCell className="max-w-[280px] truncate text-xs" title={fila.descripcion ?? ""}>
        {fila.descripcion ?? "—"}
      </TableCell>
      <TableCell className="text-xs">{fila.socio_nombre ?? "—"}</TableCell>
      <TableCell
        className={`text-right tabular-nums text-xs ${
          fila.monto < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"
        }`}
      >
        {fila.monto < 0 ? "-" : "+"}
        {formatCOP(Math.abs(fila.monto))}
      </TableCell>
      <TableCell className="text-center">
        <select
          disabled={saving}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px]"
          value={fila.detalle_origen ?? ""}
          onChange={(e) => marcarOrigen(e.target.value)}
        >
          <option value="">(sin marcar)</option>
          <option value="NATILLERA">NATILLERA</option>
          <option value="PERSONAL">PERSONAL</option>
          <option value="N/A">N/A</option>
        </select>
      </TableCell>
      <TableCell className="text-center">
        {fila.transaccion_id ? (
          <div className="flex items-center justify-center gap-1">
            <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 gap-1">
              <Check className="size-3" />#{fila.transaccion_id}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1 text-[var(--color-destructive)]"
              onClick={desvincular}
              title="Desvincular"
            >
              <Link2Off className="size-3" />
            </Button>
          </div>
        ) : (
          <VincularBoton fila={fila} socios={socios} onCambio={onCambio} />
        )}
      </TableCell>
    </TableRow>
  );
}

function VincularBoton({
  fila,
  socios: _socios,
  onCambio,
}: {
  fila: Extracto;
  socios: Socio[];
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [txId, setTxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function vincular() {
    setError(null);
    setSaving(true);
    try {
      const n = Number(txId);
      if (!Number.isInteger(n) || n <= 0) throw new Error("ID inválido");
      await api.vincularExtracto(fila.id, n);
      setAbierto(false);
      setTxId("");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!abierto) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs gap-1 text-[var(--color-muted)]"
        onClick={() => setAbierto(true)}
      >
        <Link2 className="size-3" />
        Vincular
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        className="h-6 w-16 px-1 text-xs"
        placeholder="Tx #"
        value={txId}
        onChange={(e) => setTxId(e.target.value)}
      />
      <Button size="sm" variant="ghost" className="h-6 px-1" onClick={vincular} disabled={saving}>
        <Check className="size-3" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1"
        onClick={() => {
          setAbierto(false);
          setError(null);
        }}
      >
        <X className="size-3" />
      </Button>
      {error && <span className="text-[10px] text-[var(--color-destructive)]">{error}</span>}
    </div>
  );
}
