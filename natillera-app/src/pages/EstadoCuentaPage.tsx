import { useMemo, useState } from "react";
import {
  FileText,
  Search,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Printer,
  MessageCircle,
  ClipboardCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { api, type Socio } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

export function EstadoCuentaPage({ onVolver }: { onVolver: () => void }) {
  const socios = useApi(() => api.socios(), []);
  const [busqueda, setBusqueda] = useState("");
  const [socioId, setSocioId] = useState<number | null>(null);
  const [filtroConcepto, setFiltroConcepto] = useState<string>("");

  const detalle = useApi(
    () => (socioId ? api.socioById(socioId) : Promise.resolve(null as never)),
    [socioId],
  );

  const sociosFiltrados = useMemo(() => {
    const lista = (socios.data ?? []).filter((s) => s.tipo === "persona");
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase();
    return lista.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [socios.data, busqueda]);

  const historialFiltrado = useMemo(() => {
    if (!detalle.data) return [];
    if (!filtroConcepto) return detalle.data.historial;
    return detalle.data.historial.filter((t) => t.concepto === filtroConcepto);
  }, [detalle.data, filtroConcepto]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3" data-print="hide">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <FileText className="size-6 text-[var(--color-primary)]" />
            Estado de cuenta
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Detallado por socio — todos los movimientos, saldos, deuda.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]" data-print="single-col">
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] h-fit" data-print="hide">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Socios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-muted)]" />
              <Input
                className="pl-7"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
              />
            </div>
            <div className="max-h-[500px] overflow-y-auto pr-1">
              {sociosFiltrados.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSocioId(s.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 mb-1 transition-colors ${
                    socioId === s.id
                      ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold"
                      : "hover:bg-[var(--color-primary)]/5"
                  }`}
                >
                  <div className="text-sm">{s.nombre}</div>
                  <div className="text-[10px] text-[var(--color-muted)] tabular-nums">
                    aportado {formatCOP(s.total_aportado)}
                  </div>
                </button>
              ))}
              {sociosFiltrados.length === 0 && (
                <p className="text-xs text-[var(--color-muted)] italic p-2">
                  Sin coincidencias
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!socioId && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
              Selecciona un socio a la izquierda para ver su estado de cuenta.
            </div>
          )}

          {detalle.loading && socioId && (
            <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
          )}

          {detalle.error && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
              <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-destructive)]">{detalle.error}</p>
            </div>
          )}

          {detalle.data && (
            <>
              <PrintHeader socio={detalle.data.socio} />
              <SaldoResumen socio={detalle.data.socio} />
              <ConceptoFiltros
                actual={filtroConcepto}
                onChange={setFiltroConcepto}
                total={detalle.data.historial.length}
                filtrado={historialFiltrado.length}
                onPrint={() => window.print()}
                socio={detalle.data.socio}
              />
              <HistorialTabla filas={historialFiltrado} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PrintHeader({ socio }: { socio: Socio }) {
  const hoy = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div data-print="header">
      <h1>Estado de cuenta — Natillera</h1>
      <p>
        Socio: <strong>{socio.nombre}</strong> (ID #{socio.id}) · Generado el {hoy}
      </p>
    </div>
  );
}

function armarMensajeWhatsApp(socio: Socio): string {
  const fmt = (n: number) => "$" + Number(n || 0).toLocaleString("es-CO");
  const hoy = new Date().toLocaleDateString("es-CO");
  const lineas = [
    `📊 *Estado de cuenta — Natillera*`,
    `Socio: ${socio.nombre}`,
    `Corte: ${hoy}`,
    ``,
    `💰 Ahorros:      ${fmt(socio.ahorro)}`,
    `🎉 Actividades:  ${fmt(socio.actividades)}`,
    `🎲 Rifa chance:  ${fmt(socio.rifa_chance)}`,
    `💵 Intereses:    ${fmt(socio.intereses_pagados)}`,
    `⚠️ Multas:       ${fmt(socio.multas_pagadas)}`,
    ``,
    `✅ *Total aportado: ${fmt(socio.total_aportado)}*`,
    socio.saldo_prestamos > 0
      ? `⚠️ Deuda préstamo pendiente: ${fmt(socio.saldo_prestamos)}`
      : `✔️ Sin deuda pendiente`,
    ``,
    `_Esta información es orientativa y no reemplaza el estado oficial._`,
  ];
  return lineas.join("\n");
}

function SaldoResumen({ socio }: { socio: Socio }) {
  const kpi = [
    { label: "Ahorro", value: socio.ahorro, color: "var(--color-primary)" },
    { label: "Actividades", value: socio.actividades, color: "var(--color-primary)" },
    { label: "Rifa chance", value: socio.rifa_chance, color: "var(--color-primary)" },
    {
      label: "Intereses pagados",
      value: socio.intereses_pagados,
      color: "var(--color-success)",
    },
    {
      label: "Multas",
      value: socio.multas_pagadas,
      color: "var(--color-warning)",
    },
    {
      label: "Deuda préstamos",
      value: socio.saldo_prestamos,
      color:
        socio.saldo_prestamos > 0 ? "var(--color-warning)" : "var(--color-success)",
    },
  ];

  return (
    <>
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{socio.nombre}</CardTitle>
          <p className="text-xs text-[var(--color-muted)]">
            ID #{socio.id} · Cuota base {formatCOP(socio.cuota_sostenimiento)} · Estado {socio.estado}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {kpi.map((k) => (
              <div
                key={k.label}
                className="rounded-md border border-[var(--color-border)] p-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                  {k.label}
                </div>
                <div
                  className="text-sm font-semibold tabular-nums mt-1"
                  style={{ color: k.color }}
                >
                  {formatCOP(k.value)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between items-center rounded-md bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 px-3 py-2">
            <span className="text-sm font-semibold text-[var(--color-text)]">
              TOTAL APORTADO
            </span>
            <span className="text-lg font-bold tabular-nums text-[var(--color-primary)]">
              {formatCOP(socio.total_aportado)}
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

const CONCEPTOS = [
  "AHORRO",
  "ACTIVIDADES",
  "RIFA_CHANCE",
  "PRESTAMO",
  "ABONO_PRESTAMO",
  "INTERESES_PRESTAMO",
  "MULTA",
];

function ConceptoFiltros({
  actual,
  onChange,
  total,
  filtrado,
  onPrint,
  socio,
}: {
  actual: string;
  onChange: (v: string) => void;
  total: number;
  filtrado: number;
  onPrint: () => void;
  socio: Socio;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiarParaWhatsApp() {
    const texto = armarMensajeWhatsApp(socio);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback: seleccionar en un textarea temporal
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  function abrirWhatsApp() {
    const texto = encodeURIComponent(armarMensajeWhatsApp(socio));
    // Sin número específico → el usuario elige el contacto en WhatsApp.
    window.open(`https://wa.me/?text=${texto}`, "_blank");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-print="hide">
      <button
        onClick={() => onChange("")}
        className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
          actual === ""
            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
            : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
        }`}
      >
        Todos ({total})
      </button>
      {CONCEPTOS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
            actual === c
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
          }`}
        >
          {c}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1">
        <span className="text-xs text-[var(--color-muted)]">{filtrado} movimientos</span>
        <Button
          variant="outline"
          size="sm"
          onClick={copiarParaWhatsApp}
          className="h-7 px-2 gap-1"
          title="Copia el resumen al portapapeles"
        >
          {copiado ? (
            <>
              <ClipboardCheck className="size-3 text-[var(--color-success)]" />
              Copiado
            </>
          ) : (
            <>
              <ClipboardCheck className="size-3" />
              Copiar
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={abrirWhatsApp}
          className="h-7 px-2 gap-1"
          title="Abre WhatsApp con el mensaje prellenado"
        >
          <MessageCircle className="size-3 text-[var(--color-success)]" />
          WhatsApp
        </Button>
        <Button variant="outline" size="sm" onClick={onPrint} className="h-7 px-2 gap-1">
          <Printer className="size-3" />
          Imprimir / PDF
        </Button>
      </div>
    </div>
  );
}

function HistorialTabla({
  filas,
}: {
  filas: {
    id: number;
    fecha_pago: string | null;
    concepto: string;
    tipo: "ingreso" | "egreso";
    valor: number;
    periodo: string | null;
  }[];
}) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Periodo</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{t.fecha_pago ?? "—"}</TableCell>
                <TableCell className="text-xs">{t.periodo ?? "—"}</TableCell>
                <TableCell className="text-xs font-medium">{t.concepto}</TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="secondary"
                    className={
                      t.tipo === "ingreso"
                        ? "bg-[var(--color-success)]/15 text-[var(--color-success)] gap-1"
                        : "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)] gap-1"
                    }
                  >
                    {t.tipo === "ingreso" ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {t.tipo}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums text-xs font-semibold ${
                    t.tipo === "egreso" ? "text-[var(--color-destructive)]" : ""
                  }`}
                >
                  {t.tipo === "egreso" ? "-" : "+"}
                  {formatCOP(t.valor)}
                </TableCell>
              </TableRow>
            ))}
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-[var(--color-muted)]">
                  Sin movimientos con este filtro
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
