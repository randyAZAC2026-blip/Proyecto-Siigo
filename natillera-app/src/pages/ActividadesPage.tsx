import { useState } from "react";
import {
  Sparkles,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  CheckCircle2,
  Circle,
  Trophy,
  Medal,
  Search,
  Calendar,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { api, USA_SUPABASE, type ActividadResumen, type ActividadBoleta } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

export function ActividadesPage({ onVolver }: { onVolver: () => void }) {
  const [actividadId, setActividadId] = useState<number | null>(null);
  const lista = useApi(() => api.listarActividades(), []);

  if (!USA_SUPABASE) {
    return (
      <div className="space-y-4">
        <PageHeader onVolver={onVolver} titulo="Actividades" />
        <Card className="rounded-[var(--radius-card)] border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5">
          <CardContent className="py-4 flex items-start gap-2">
            <AlertCircle className="size-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-[var(--color-text)]">
                <strong>Módulo disponible solo con Supabase.</strong>
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Cambia <code>VITE_NAT_DATA_SOURCE=supabase</code> en el <code>.env.local</code> y reinicia <code>pnpm dev</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (actividadId !== null) {
    return (
      <ActividadDetalleView
        actividadId={actividadId}
        onVolver={() => setActividadId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        onVolver={onVolver}
        titulo="Actividades"
        subtitulo="Rifas y eventos de la natillera"
        onRecargar={lista.reload}
        cargando={lista.loading}
      />

      {lista.error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{lista.error}</p>
        </div>
      )}

      {lista.loading && !lista.data && (
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      )}

      {lista.data && lista.data.length === 0 && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardContent className="py-8 text-center text-sm text-[var(--color-muted)]">
            Aún no hay actividades registradas.
          </CardContent>
        </Card>
      )}

      {lista.data && lista.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.data.map((a) => (
            <ActividadCard key={a.id} actividad={a} onAbrir={() => setActividadId(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader({
  onVolver,
  titulo,
  subtitulo,
  onRecargar,
  cargando,
}: {
  onVolver: () => void;
  titulo: string;
  subtitulo?: string;
  onRecargar?: () => void;
  cargando?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
          <Sparkles className="size-6 text-[var(--color-primary)]" />
          {titulo}
        </h1>
        {subtitulo && (
          <p className="text-sm text-[var(--color-muted)] mt-1">{subtitulo}</p>
        )}
      </div>
      <div className="flex gap-2">
        {onRecargar && (
          <Button variant="outline" size="sm" onClick={onRecargar} disabled={cargando}>
            <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver
        </Button>
      </div>
    </div>
  );
}

function ActividadCard({
  actividad,
  onAbrir,
}: {
  actividad: ActividadResumen;
  onAbrir: () => void;
}) {
  const progreso =
    actividad.boletas_asignadas > 0
      ? Math.round((actividad.boletas_pagadas / actividad.boletas_asignadas) * 100)
      : 0;
  const esRifa = actividad.tipo === "rifa";
  const premios = actividad.premios as Record<string, number | string>;

  const estadoBadge =
    actividad.estado === "activa"
      ? { label: "Activa", clase: "bg-[var(--color-success)]/15 text-[var(--color-success)]" }
      : actividad.estado === "cerrada"
        ? { label: "Cerrada", clase: "bg-[var(--color-muted)]/20 text-[var(--color-muted)]" }
        : { label: "Cancelada", clase: "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]" };

  return (
    <Card
      className="rounded-[var(--radius-card)] border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)]/50 transition-colors"
      onClick={onAbrir}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {esRifa ? <Ticket className="size-4 text-[var(--color-primary)]" /> : <Sparkles className="size-4 text-[var(--color-primary)]" />}
            {actividad.nombre}
          </CardTitle>
          <Badge variant="secondary" className={estadoBadge.clase}>
            {estadoBadge.label}
          </Badge>
        </div>
        {actividad.fecha_evento && (
          <CardDescription className="flex items-center gap-1 text-xs">
            <Calendar className="size-3" />
            {actividad.fecha_evento}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {esRifa && typeof premios.mayor === "number" && (
          <div className="flex gap-2 text-[11px]">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold">
              <Trophy className="size-3" /> {formatCOP(Number(premios.mayor))}
            </span>
            {typeof premios.segundo === "number" && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--color-muted)]/15 text-[var(--color-text)] font-semibold">
                <Medal className="size-3" /> {formatCOP(Number(premios.segundo))}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Recaudado" valor={formatCOP(actividad.recaudado)} color="var(--color-success)" />
          <Stat label="Por cobrar" valor={formatCOP(actividad.por_cobrar)} color="var(--color-warning)" />
          <Stat label="Boletas" valor={`${actividad.boletas_pagadas} / ${actividad.boletas_asignadas}`} color="var(--color-primary)" />
          <Stat label="Participantes" valor={String(actividad.participantes)} color="var(--color-text)" />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] uppercase tracking-wide">
            <span>Avance de cobro</span>
            <span>{progreso}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-muted)]/15 overflow-hidden">
            <div
              className="h-full bg-[var(--color-success)]"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, valor, color }: { label: string; valor: string; color: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{label}</div>
      <div className="font-semibold tabular-nums mt-0.5" style={{ color }}>{valor}</div>
    </div>
  );
}

// =========================== DETALLE ===========================

function ActividadDetalleView({
  actividadId,
  onVolver,
}: {
  actividadId: number;
  onVolver: () => void;
}) {
  const detalle = useApi(() => api.actividadDetalle(actividadId), [actividadId]);
  const [filtro, setFiltro] = useState("");
  const [verSolo, setVerSolo] = useState<"todas" | "pagadas" | "pendientes">("todas");

  const toggle = async (b: ActividadBoleta) => {
    try {
      await api.marcarBoletaPagada(b.id, !b.pagada);
      detalle.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const marcarGanadora = async (b: ActividadBoleta, premio: "mayor" | "segundo" | null) => {
    try {
      await api.marcarBoletaGanadora(b.id, premio);
      detalle.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 px-1 h-7" onClick={onVolver}>
            <ChevronLeft className="size-4" />
            Actividades
          </Button>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            {detalle.data?.actividad.nombre ?? "Cargando…"}
          </h1>
          {detalle.data?.actividad.fecha_evento && (
            <p className="text-sm text-[var(--color-muted)] mt-1 flex items-center gap-1">
              <Calendar className="size-4" />
              {detalle.data.actividad.fecha_evento}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={detalle.reload} disabled={detalle.loading}>
          <RefreshCw className={`size-4 ${detalle.loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {detalle.error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{detalle.error}</p>
        </div>
      )}

      {detalle.loading && !detalle.data && (
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      )}

      {detalle.data && (
        <>
          <ResumenActividad actividad={detalle.data.actividad} />

          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Boletas asignadas</CardTitle>
              <CardDescription>
                Clic en el círculo para marcar pagada; usa los íconos de trofeo/medalla para registrar ganadores.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted)]" />
                  <Input
                    placeholder="Buscar número o persona…"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <div className="flex gap-1 text-xs">
                  {(["todas", "pagadas", "pendientes"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVerSolo(v)}
                      className={`rounded-md border px-3 py-1 transition-colors ${
                        verSolo === v
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                      }`}
                    >
                      {v === "todas" ? "Todas" : v === "pagadas" ? "Pagadas" : "Pendientes"}
                    </button>
                  ))}
                </div>
              </div>

              <TablaBoletas
                boletas={filtrar(detalle.data.boletas, filtro, verSolo)}
                onToggle={toggle}
                onGanadora={marcarGanadora}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function filtrar(
  boletas: ActividadBoleta[],
  filtro: string,
  verSolo: "todas" | "pagadas" | "pendientes",
) {
  const q = filtro.trim().toLowerCase();
  return boletas.filter((b) => {
    if (verSolo === "pagadas" && !b.pagada) return false;
    if (verSolo === "pendientes" && b.pagada) return false;
    if (!q) return true;
    const nombre = b.socio_nombre ?? b.nombre_externo ?? "";
    return b.numero.includes(q) || nombre.toLowerCase().includes(q);
  });
}

function ResumenActividad({ actividad }: { actividad: ActividadResumen }) {
  const premios = actividad.premios as Record<string, number | string>;
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <MiniTile label="Recaudado" valor={formatCOP(actividad.recaudado)} color="var(--color-success)" />
      <MiniTile label="Por cobrar" valor={formatCOP(actividad.por_cobrar)} color="var(--color-warning)" />
      <MiniTile
        label="Boletas"
        valor={`${actividad.boletas_pagadas} / ${actividad.boletas_asignadas}`}
        color="var(--color-primary)"
      />
      <MiniTile label="Boleta" valor={formatCOP(actividad.valor_boleta)} color="var(--color-muted)" />
      {typeof premios.mayor === "number" && (
        <MiniTile label="Premio mayor" valor={formatCOP(Number(premios.mayor))} color="var(--color-primary)" />
      )}
      {typeof premios.segundo === "number" && (
        <MiniTile label="Segundo premio" valor={formatCOP(Number(premios.segundo))} color="var(--color-primary)" />
      )}
    </div>
  );
}

function MiniTile({ label, valor, color }: { label: string; valor: string; color: string }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
        <div className="text-base font-semibold tabular-nums mt-1" style={{ color }}>
          {valor}
        </div>
      </CardContent>
    </Card>
  );
}

function TablaBoletas({
  boletas,
  onToggle,
  onGanadora,
}: {
  boletas: ActividadBoleta[];
  onToggle: (b: ActividadBoleta) => void;
  onGanadora: (b: ActividadBoleta, premio: "mayor" | "segundo" | null) => void;
}) {
  if (boletas.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-muted)]">
        No hay boletas que coincidan con el filtro.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14 text-center">Pagada</TableHead>
          <TableHead>Número</TableHead>
          <TableHead>Persona</TableHead>
          <TableHead className="text-center">Cifras</TableHead>
          <TableHead className="text-center">Fecha pago</TableHead>
          <TableHead className="text-center">Ganadora</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {boletas.map((b) => {
          const nombre = b.socio_nombre ?? b.nombre_externo ?? "—";
          const pp = b.numero.slice(0, 2);
          const uu = b.numero.slice(2);
          return (
            <TableRow key={b.id} className={b.es_ganadora ? "bg-[var(--color-primary)]/5" : ""}>
              <TableCell className="text-center p-1">
                <button
                  onClick={() => onToggle(b)}
                  className="rounded-md p-1 hover:bg-[var(--color-primary)]/10 transition-colors"
                  title={b.pagada ? "Marcar como pendiente" : "Marcar como pagada"}
                >
                  {b.pagada ? (
                    <CheckCircle2 className="size-5 text-[var(--color-success)]" />
                  ) : (
                    <Circle className="size-5 text-[var(--color-muted)]" />
                  )}
                </button>
              </TableCell>
              <TableCell className="font-mono font-bold text-sm">{b.numero}</TableCell>
              <TableCell className="text-xs">{nombre}</TableCell>
              <TableCell className="text-center text-[11px] text-[var(--color-muted)] tabular-nums">
                {pp} · {uu}
              </TableCell>
              <TableCell className="text-center text-[11px] text-[var(--color-muted)]">
                {b.fecha_pago ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() =>
                      onGanadora(b, b.premio_tipo === "mayor" ? null : "mayor")
                    }
                    className={`rounded p-1 transition-colors ${
                      b.premio_tipo === "mayor"
                        ? "bg-[var(--color-primary)] text-[var(--color-surface)]"
                        : "text-[var(--color-muted)] hover:text-[var(--color-primary)]"
                    }`}
                    title="Premio mayor"
                  >
                    <Trophy className="size-4" />
                  </button>
                  <button
                    onClick={() =>
                      onGanadora(b, b.premio_tipo === "segundo" ? null : "segundo")
                    }
                    className={`rounded p-1 transition-colors ${
                      b.premio_tipo === "segundo"
                        ? "bg-[var(--color-muted)] text-[var(--color-surface)]"
                        : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    }`}
                    title="Segundo premio"
                  >
                    <Medal className="size-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
