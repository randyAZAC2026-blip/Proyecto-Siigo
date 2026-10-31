import { useMemo, useState } from "react";
import {
  FileText,
  Search,
  TrendingUp,
  TrendingDown,
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
import { formatCOP, nombreConcepto } from "@/lib/natillera/format";
import { api, type Socio } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { InformeLayout } from "@/components/informes/InformeLayout";

// Con socioFijo es "Mis ahorros" del socio que entró: sin lista de socios ni selector.
export function EstadoCuentaPage({ onVolver: _onVolver, socioFijo }: { onVolver?: () => void; socioFijo?: number }) {
  const socios = useApi(() => (socioFijo ? Promise.resolve([]) : api.socios()), [socioFijo]);
  const [busqueda, setBusqueda] = useState("");
  const [socioElegido, setSocioId] = useState<number | null>(null);
  const socioId = socioFijo ?? socioElegido;
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

  const s = detalle.data?.socio;
  const historial = detalle.data?.historial ?? [];
  const firmado = (t: { tipo: string; valor: number }) => (t.tipo === "egreso" ? -t.valor : t.valor);

  return (
    <InformeLayout
      titulo={socioFijo ? "Mis ahorros" : "Estado de cuenta"}
      descripcion={
        socioFijo
          ? "Todos tus aportes y movimientos en la natillera."
          : "Aportes, movimientos y deuda de un socio. Elige el socio en la lista; se puede imprimir, exportar o enviar por WhatsApp."
      }
      Icon={FileText}
      cargando={socios.loading || detalle.loading}
      error={socios.error ?? detalle.error}
      listo={socioFijo ? !!detalle.data : !!socios.data}
      imprimible={!!s}
      onActualizar={() => {
        socios.reload();
        detalle.reload();
      }}
      detalleImpresion={s ? `Socio: ${s.nombre} · ID #${s.id} · Cuota base ${formatCOP(s.cuota_sostenimiento)}` : undefined}
      excel={
        s
          ? () => [
              {
                nombre: "Resumen",
                columnas: [
                  { titulo: "Concepto", tipo: "texto", ancho: 26 },
                  { titulo: "Valor", tipo: "moneda" },
                ],
                filas: [
                  ["Socio", s.nombre],
                  ["Ahorro", s.ahorro],
                  ["Actividades", s.actividades],
                  ["Rifa / chance", s.rifa_chance],
                  ["Intereses pagados", s.intereses_pagados],
                  ["Multas pagadas", s.multas_pagadas],
                  ["Deuda en préstamos", s.saldo_prestamos],
                ],
                totales: ["TOTAL APORTADO", s.total_aportado],
              },
              {
                nombre: "Movimientos",
                columnas: [
                  { titulo: "Fecha", tipo: "fecha" },
                  { titulo: "Periodo", tipo: "texto", ancho: 14 },
                  { titulo: "Concepto", tipo: "texto", ancho: 24 },
                  { titulo: "Tipo", tipo: "texto", ancho: 10 },
                  { titulo: "Valor", tipo: "moneda" },
                ],
                filas: historial.map((t) => [t.fecha_pago, t.periodo, nombreConcepto(t.concepto), t.tipo, firmado(t)]),
                totales: ["NETO", null, null, null, historial.reduce((n, t) => n + firmado(t), 0)],
              },
            ]
          : undefined
      }
    >
      <div className={socioFijo ? "space-y-4" : "grid gap-4 md:grid-cols-[280px_1fr]"} data-print="single-col">
        {!socioFijo && (
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
        )}

        <div className="space-y-4">
          {!socioId && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
              Selecciona un socio a la izquierda para ver su estado de cuenta.
            </div>
          )}

          {detalle.loading && socioId && !detalle.data && (
            <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
          )}

          {detalle.data && (
            <>
              <SaldoResumen socio={detalle.data.socio} />
              <ConceptoFiltros
                actual={filtroConcepto}
                onChange={setFiltroConcepto}
                total={detalle.data.historial.length}
                filtrado={historialFiltrado.length}
                socio={detalle.data.socio}
              />
              <HistorialTabla filas={historialFiltrado} />
            </>
          )}
        </div>
      </div>
    </InformeLayout>
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
  socio,
}: {
  actual: string;
  onChange: (v: string) => void;
  total: number;
  filtrado: number;
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
          {nombreConcepto(c)}
        </button>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-1">
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
  const entra = filas.filter((t) => t.tipo === "ingreso").reduce((n, t) => n + t.valor, 0);
  const sale = filas.filter((t) => t.tipo === "egreso").reduce((n, t) => n + t.valor, 0);
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {/* En celular cada movimiento es una línea; la tabla aparece desde sm. */}
        <ul className="sm:hidden divide-y divide-[var(--color-border)]">
          {filas.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{nombreConcepto(t.concepto)}</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {t.fecha_pago ?? "sin fecha"}
                  {t.periodo ? ` · ${t.periodo}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  t.tipo === "egreso" ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"
                }`}
              >
                {t.tipo === "egreso" ? "-" : "+"}
                {formatCOP(t.valor)}
              </span>
            </li>
          ))}
          {filas.length === 0 && (
            <li className="py-6 text-center text-sm text-[var(--color-muted)]">Sin movimientos con este filtro</li>
          )}
        </ul>
        <Table className="hidden sm:table">
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
                <TableCell className="text-xs font-medium">{nombreConcepto(t.concepto)}</TableCell>
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
            {filas.length > 0 && (
              <TableRow data-total className="bg-[var(--color-background)] font-semibold hover:bg-[var(--color-background)]">
                <TableCell colSpan={3} className="text-xs">
                  Total · {filas.length} movimientos
                </TableCell>
                <TableCell className="text-center text-[11px] font-normal text-[var(--color-muted)]">
                  +{formatCOP(entra)} / −{formatCOP(sale)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatCOP(entra - sale)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
