import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/billetera/EmptyState";
import { TarjetaDato } from "@/components/billetera/analisis/TarjetaDato";
import { GastosPorCategoria } from "@/components/billetera/analisis/GastosPorCategoria";
import { RitmoDelMes } from "@/components/billetera/analisis/RitmoDelMes";
import { TendenciaMensual } from "@/components/billetera/analisis/TendenciaMensual";
import { GastoPorDiaSemana } from "@/components/billetera/analisis/GastoPorDiaSemana";
import { Hallazgos } from "@/components/billetera/analisis/Hallazgos";
import { ListaGastos } from "@/components/billetera/analisis/ListaGastos";
import { useCuentas, useMovimientos } from "@/lib/billetera/hooks";
import { formatCOP, todayISO } from "@/lib/billetera/format";
import {
  cambiosCategorias, desplazarMes, diasDelMes, etiquetaMes, gastoPorDiaSemana, gastosDeCategoria, gastosPorCategoria,
  mayoresGastos, proyeccionMes, resumenMes, ritmoDelMes, serieMensual, variacion, type MovimientoAnalisis,
} from "@/lib/billetera/analisis";

const MAX_CATEGORIAS = 8;

/** Análisis: cómo se mueve la plata. Mes y cuenta arriba; todo lo demás se recalcula con ellos. */
export function AnalisisPage() {
  const hoy = todayISO();
  const mesActual = hoy.slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const [cuentaId, setCuentaId] = useState("todas");
  const [categoria, setCategoria] = useState<string | null>(null);
  const cuentas = useCuentas();

  // Seis meses hasta el elegido: alcanza para la tendencia, el ritmo contra el mes anterior y los días de la semana.
  const opts = useMemo(() => ({
    desde: `${desplazarMes(mes, -5)}-01`,
    hasta: `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}`,
    cuentaId: cuentaId === "todas" ? undefined : cuentaId,
  }), [mes, cuentaId]);
  const movimientos = useMovimientos(opts);
  const movs = (movimientos.data ?? []) as unknown as MovimientoAnalisis[];

  const anterior = desplazarMes(mes, -1);
  const r = resumenMes(movs, mes);
  const rAnt = resumenMes(movs, anterior);
  const categorias = gastosPorCategoria(movs, mes, MAX_CATEGORIAS);
  const proy = proyeccionMes(movs, mes, hoy);
  const finDiaSemana = mes === mesActual ? hoy : opts.hasta;
  const inicioDiaSemana = `${desplazarMes(mes, -2)}-01`;

  const cambiarMes = (n: number) => { setMes((m) => desplazarMes(m, n)); setCategoria(null); };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-text)]"><BarChart3 className="size-5 text-[var(--color-primary)]" />Análisis</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Button variant="ghost" size="sm" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}><ChevronLeft className="size-4" /></Button>
            <span className="min-w-32 text-center text-sm font-medium capitalize text-[var(--color-text)]" aria-live="polite">{etiquetaMes(mes)}</span>
            <Button variant="ghost" size="sm" aria-label="Mes siguiente" disabled={mes >= mesActual} onClick={() => cambiarMes(1)}><ChevronRight className="size-4" /></Button>
          </div>
          <Select value={cuentaId} onValueChange={(v) => { setCuentaId(v); setCategoria(null); }}>
            <SelectTrigger className="w-44" aria-label="Cuenta"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las cuentas</SelectItem>
              {(cuentas.data ?? []).filter((c) => !c.archivada).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      {movimientos.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-64 sm:col-span-2" /></div>
      ) : movimientos.isError ? (
        <p className="text-sm text-[var(--color-destructive)]">No se pudieron cargar los movimientos. Revisa tu conexión y vuelve a intentar.</p>
      ) : !movs.some((m) => m.tipo !== "transferencia") ? (
        <EmptyState icon={<BarChart3 className="size-8" />} title="Aún no hay movimientos para analizar"
          description="Registra tus ingresos y gastos y aquí verás en qué se va la plata, a qué ritmo y cómo cambia mes a mes."
          action={<Link to="/movimientos/nuevo"><Button size="sm" className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">Registrar movimiento</Button></Link>} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cifras del mes">
            <TarjetaDato titulo="Gastado" valor={formatCOP(r.gastos)} variacion={variacion(r.gastos, rAnt.gastos)} subirEsMalo detalle={`${r.nGastos} gasto${r.nGastos === 1 ? "" : "s"}`} />
            <TarjetaDato titulo="Ingresos" valor={formatCOP(r.ingresos)} variacion={variacion(r.ingresos, rAnt.ingresos)} />
            <TarjetaDato titulo={r.balance >= 0 ? "Te quedó" : "Gastaste de más"} valor={formatCOP(Math.abs(r.balance))}
              detalle={r.ingresos > 0 ? `${((r.balance / r.ingresos) * 100).toFixed(0)} % de tus ingresos` : undefined} />
            <TarjetaDato titulo="Promedio diario" valor={formatCOP(proy.promedioDiario)}
              detalle={proy.proyeccion !== null ? `Cierre estimado: ${formatCOP(proy.proyeccion)}` : `${proy.diasTranscurridos} días`} />
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] lg:col-span-3">
              <CardHeader className="pb-0"><CardTitle className="text-base">¿En qué se va la plata?</CardTitle></CardHeader>
              <CardContent>
                {categorias.length ? <>
                  <GastosPorCategoria datos={categorias} seleccionada={categoria} onSeleccionar={setCategoria} />
                  <p className="mt-2 text-xs text-[var(--color-muted)]">Toca una categoría para ver sus gastos.</p>
                </> : <p className="text-sm text-[var(--color-muted)]">No hay gastos en {etiquetaMes(mes)}.</p>}
              </CardContent>
            </Card>
            <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] lg:col-span-2">
              <CardHeader className="pb-0"><CardTitle className="text-base">Lo que debes saber</CardTitle></CardHeader>
              <CardContent>
                <Hallazgos cambios={cambiosCategorias(movs, mes)} top={categorias[0]} proyeccion={proy} gastoAnterior={rAnt.gastos} mesAnterior={etiquetaMes(anterior).split(" ")[0]} />
              </CardContent>
            </Card>
          </div>

          {categoria && (
            <Card className="rounded-[var(--radius-card)] border-[var(--color-primary)]/40">
              <CardHeader className="flex flex-row items-center justify-between pb-0">
                <CardTitle className="text-base">{categoria} · {etiquetaMes(mes)}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setCategoria(null)} aria-label="Cerrar detalle"><X className="size-4" /></Button>
              </CardHeader>
              <CardContent>
                <ListaGastos gastos={gastosDeCategoria(movs, mes, categoria, MAX_CATEGORIAS)} vacio="Sin gastos." mostrarCategoria={categoria === "Otras"} />
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader className="pb-0"><CardTitle className="text-base">Ritmo de gasto del mes</CardTitle></CardHeader>
            <CardContent>
              <RitmoDelMes datos={ritmoDelMes(movs, mes, hoy)} etiquetas={[etiquetaMes(mes).split(" ")[0], etiquetaMes(anterior).split(" ")[0]]} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
              <CardHeader className="pb-0"><CardTitle className="text-base">Últimos seis meses</CardTitle></CardHeader>
              <CardContent><TendenciaMensual datos={serieMensual(movs, mes)} onMes={(m) => { setMes(m); setCategoria(null); }} /></CardContent>
            </Card>
            <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
              <CardHeader className="pb-0"><CardTitle className="text-base">¿Qué día gastas más?</CardTitle></CardHeader>
              <CardContent><GastoPorDiaSemana datos={gastoPorDiaSemana(movs, inicioDiaSemana, finDiaSemana)} periodo={`${etiquetaMes(desplazarMes(mes, -2)).split(" ")[0]} a ${etiquetaMes(mes).split(" ")[0]}`} /></CardContent>
            </Card>
          </div>

          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader className="pb-0"><CardTitle className="text-base">Los gastos más grandes del mes</CardTitle></CardHeader>
            <CardContent><ListaGastos gastos={mayoresGastos(movs, mes, 5)} vacio={`No hay gastos en ${etiquetaMes(mes)}.`} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
