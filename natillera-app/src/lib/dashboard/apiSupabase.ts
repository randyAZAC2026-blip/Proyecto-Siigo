// Implementación del API contra Supabase.
// Reproduce la misma interfaz que `apiHttp` (backend Express).
//
// Los queries se apoyan en el schema portado desde SQLite:
//   tablas: socios, periodos, transacciones, prestamos, abonos_prestamos,
//           multas, movimientos_banco, movimientos
//   vistas: vw_saldo_por_socio, vw_matriz_ahorro, vw_matriz_actividades,
//           vw_liquidacion_anual, vw_totales_globales
//
// Cálculos derivados (mora, matriz de préstamos, resúmenes) se hacen en
// cliente porque no hay backend intermedio.

import { supabase, requireSupabaseEnv } from "@/lib/supabase/client";
import type {
  Resumen,
  Socio,
  Matriz,
  MatrizPrestamos,
  MoraReporte,
  MoraAhorroReporte,
  Liquidacion,
  Banco,
  PeriodoResumen,
  Deudor,
  Moroso,
  HistorialSocio,
  Periodo,
  ExtractosPage,
  Extracto,
  PrestamoReferido,
  Referido,
  TasasPrestamo,
  EstadoExtracto,
  CategoriaBanco,
  SugerenciaConciliacion,
  ResultadoSugerencias,
  ReglaBanco,
  Panel,
  FiltrosExtracto,
  Transaccion,
  NuevaTransaccion,
  DesglosePago,
  SimuladorParams,
  SimuladorResultado,
  TotalesGenerales,
  ActividadResumen,
  ActividadPatch,
  ActividadBoleta,
  ActividadDetalle,
} from "./api";

async function q<T>(builder: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  requireSupabaseEnv();
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return (data ?? ([] as unknown as T)) as T;
}

function noImpl(fn: string): never {
  throw new Error(
    `apiSupabase: '${fn}' aún no está implementado. Cambia VITE_NAT_DATA_SOURCE=express o pídeme el port de este endpoint.`,
  );
}
// Reservado para futuros endpoints; silencia TS6133 mientras no haya ninguno pendiente.
void noImpl;

// -------------------- lecturas simples --------------------

async function socios(): Promise<Socio[]> {
  const filas = await q<any[]>(
    supabase
      .from("vw_saldo_por_socio")
      .select("*")
      .order("nombre", { ascending: true }),
  );
  return filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    estado: r.estado,
    cuota_sostenimiento: r.cuota_sostenimiento ?? 0,
    ahorro: r.ahorro ?? 0,
    actividades: r.actividades ?? 0,
    rifa_chance: r.rifa_chance ?? 0,
    intereses_pagados: r.intereses_pagados ?? 0,
    abonado_a_prestamos: r.abonado_a_prestamos ?? 0,
    prestamos_recibidos: r.prestamos_recibidos ?? 0,
    multas_pagadas: r.multas_pagadas ?? 0,
    total_aportado: r.total_aportado ?? 0,
    saldo_prestamos: r.saldo_prestamos ?? 0,
    saldo_referidos: Number(r.saldo_referidos ?? 0),
  }));
}

// -------------------- préstamos a referidos --------------------

async function prestamosReferidos(): Promise<PrestamoReferido[]> {
  requireSupabaseEnv();
  const filas = await q<any[]>(
    supabase.from("vw_prestamos_referidos").select("*").order("fecha_desembolso", { ascending: false }),
  );
  return filas.map((p) => ({
    ...p,
    monto_prestado: Number(p.monto_prestado),
    tasa_interes: Number(p.tasa_interes),
    saldo: Number(p.saldo),
    intereses_pagados: Number(p.intereses_pagados),
  }));
}

async function referidos(): Promise<Referido[]> {
  requireSupabaseEnv();
  return q<Referido[]>(
    supabase
      .from("socios")
      .select("id, nombre, identificacion, telefono, referido_por, estado")
      .eq("tipo", "referido")
      .order("nombre"),
  );
}

async function crearReferido(r: { nombre: string; identificacion?: string; telefono?: string; referido_por: number }) {
  requireSupabaseEnv();
  return q<{ id: number }>(
    supabase
      .from("socios")
      .insert({
        nombre: r.nombre.trim(),
        identificacion: r.identificacion?.trim() || null,
        telefono: r.telefono?.trim() || null,
        referido_por: r.referido_por,
        tipo: "referido",
        estado: "activo",
        cuota_sostenimiento: 0,
      })
      .select("id")
      .single(),
  );
}

async function tasasPrestamo(): Promise<TasasPrestamo> {
  requireSupabaseEnv();
  const filas = await q<{ clave: string; valor: number }[]>(
    supabase.from("configuracion_natillera").select("clave, valor").like("clave", "tasa_prestamo_%"),
  );
  const de = (c: string) => {
    const f = filas.find((x) => x.clave === c);
    return f ? Number(f.valor) : null;
  };
  return { socios: de("tasa_prestamo_socios"), referidos: de("tasa_prestamo_referidos") };
}

async function guardarTasa(tipo: "socios" | "referidos", valor: number) {
  requireSupabaseEnv();
  const { error } = await supabase
    .from("configuracion_natillera")
    .update({ valor, actualizado_en: new Date().toISOString() })
    .eq("clave", `tasa_prestamo_${tipo}`);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

/** Préstamo entregado en efectivo (sin movimiento del banco). */
async function crearPrestamo(p: {
  socio_id: number;
  monto: number;
  fecha: string;
  intereses_descontados?: number;
  notas?: string;
}) {
  requireSupabaseEnv();
  return q<{ ok: true; prestamo_id: number; entregado: number }>(
    supabase.rpc("natillera_crear_prestamo", {
      p_socio_id: p.socio_id,
      p_monto: p.monto,
      p_fecha: p.fecha,
      p_intereses_descontados: p.intereses_descontados ?? 0,
      p_notas: p.notas ?? null,
    }),
  );
}

/** Salidas del banco aún sin conciliar (para entregar un préstamo por banco). */
async function egresosPendientes(): Promise<Extracto[]> {
  const r = await extractos({ banco: "Bancolombia", estado: "pendiente", limit: 300 });
  return r.filas.filter((f) => f.monto < 0);
}

async function periodos(): Promise<Periodo[]> {
  return q<Periodo[]>(
    supabase.from("periodos").select("*").order("orden", { ascending: true }),
  );
}

async function ahorrosPorPeriodo(): Promise<PeriodoResumen[]> {
  const ps = await periodos();
  const txs = await q<any[]>(
    supabase.from("transacciones").select("periodo_id, valor").eq("concepto", "AHORRO"),
  );
  const agg = new Map<number, { total: number; n: number }>();
  for (const t of txs) {
    if (t.periodo_id == null) continue;
    const a = agg.get(t.periodo_id) ?? { total: 0, n: 0 };
    a.total += t.valor;
    a.n += 1;
    agg.set(t.periodo_id, a);
  }
  return ps.map((p) => {
    const a = agg.get(p.id) ?? { total: 0, n: 0 };
    return {
      id: p.id,
      nombre: p.nombre,
      orden: p.orden,
      fecha_corte_ahorro: p.fecha_corte_ahorro,
      ahorro: a.total,
      n_pagos: a.n,
    };
  });
}

async function deudores(): Promise<Deudor[]> {
  const prestamos = await q<any[]>(
    supabase
      .from("prestamos")
      .select("id, socio_id, monto_prestado, fecha_desembolso, socios(nombre)")
      .eq("estado", "activo")
      .gt("monto_prestado", 0),
  );
  const abonos = await q<any[]>(
    supabase.from("abonos_prestamos").select("prestamo_id, capital_pagado, intereses_pagados"),
  );
  const abonoByPrestamo = new Map<number, { capital: number; intereses: number }>();
  for (const a of abonos) {
    const acc = abonoByPrestamo.get(a.prestamo_id) ?? { capital: 0, intereses: 0 };
    acc.capital += a.capital_pagado ?? 0;
    acc.intereses += a.intereses_pagados ?? 0;
    abonoByPrestamo.set(a.prestamo_id, acc);
  }
  return prestamos
    .map((p) => {
      const acc = abonoByPrestamo.get(p.id) ?? { capital: 0, intereses: 0 };
      return {
        id: p.socio_id,
        nombre: p.socios?.nombre ?? "?",
        prestamo_id: p.id,
        monto_prestado: p.monto_prestado,
        saldo: p.monto_prestado - acc.capital,
        intereses_pagados: acc.intereses,
        fecha_desembolso: p.fecha_desembolso,
      };
    })
    .sort((a, b) => b.saldo - a.saldo);
}

// Totales sumados en la base (vw_banco_resumen): sumar en el navegador
// pasaba el tope de 1000 filas de la API y daba totales cortos.
async function bancos(): Promise<Banco[]> {
  const filas = await q<any[]>(supabase.from("vw_banco_resumen").select("*"));
  return filas.map((b) => ({
    banco: b.banco,
    n_movs: Number(b.n_movs),
    ingresos: Number(b.ingresos),
    egresos: Number(b.egresos),
    ingresos_natillera: Number(b.ingresos_natillera),
  }));
}

// -------------------- panel financiero (vistas agregadas) --------------------

async function panel(): Promise<Panel> {
  requireSupabaseEnv();
  const [f, periodos, conc] = await Promise.all([
    q<any>(supabase.from("vw_panel_financiero").select("*").single()),
    q<any[]>(supabase.from("vw_panel_ahorro_periodo").select("*").order("orden")),
    q<any[]>(supabase.from("vw_panel_conciliacion").select("*").eq("banco", "Bancolombia")),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    financiero: {
      socios_activos: n(f.socios_activos),
      ahorro: n(f.ahorro),
      actividades: n(f.actividades),
      rifa: n(f.rifa),
      intereses: n(f.intereses),
      multas: n(f.multas),
      prestamos_desembolsados: n(f.prestamos_desembolsados),
      abonos_prestamos: n(f.abonos_prestamos),
      ingresos: n(f.ingresos),
      egresos: n(f.egresos),
      cartera: n(f.cartera),
      caja_libros: n(f.caja_libros),
      rendimientos: n(f.rendimientos),
      saldo_banco: f.saldo_banco == null ? null : n(f.saldo_banco),
      fecha_saldo_banco: f.fecha_saldo_banco ?? null,
      ultimo_pago: f.ultimo_pago ?? null,
    },
    ahorroPeriodos: periodos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      orden: p.orden,
      fecha_corte_ahorro: p.fecha_corte_ahorro ?? null,
      ahorro: n(p.ahorro),
      socios_pagaron: n(p.socios_pagaron),
    })),
    conciliacion: conc.map((c) => ({
      tipo: c.tipo,
      estado: c.estado,
      n: n(c.n),
      monto: n(c.monto),
      pendiente: n(c.pendiente),
    })),
  };
}

// Helpers de mes y 30 días: formateo YYYY-MM-DD para los filtros de Supabase.
function inicioMesISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hace30DiasISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

async function resumen(): Promise<Resumen> {
  // Totales desde vistas agregadas: traer todas las transacciones pasaba el
  // tope de 1000 filas de la API y los totales salían cortos.
  const [fin, bs, pendientesResp, alDiaMesRaw, activaResp, prestamosActivos] = await Promise.all([
    q<any>(supabase.from("vw_panel_financiero").select("*").single()),
    q<any[]>(supabase.from("vw_banco_resumen").select("banco")),
    supabase
      .from("vw_extracto_estado")
      .select("id", { count: "exact", head: true })
      .is("socio_id", null)
      .is("detalle_origen", null)
      .eq("n_transacciones", 0),
    q<any[]>(
      supabase
        .from("transacciones")
        .select("socio_id")
        .eq("concepto", "AHORRO")
        .gte("fecha_pago", inicioMesISO()),
    ),
    q<any[]>(
      supabase
        .from("vw_actividades_resumen")
        .select("id, nombre, boletas_pagadas, boletas_asignadas, estado, fecha_evento")
        .eq("estado", "activa")
        .order("fecha_evento", { ascending: false })
        .limit(1),
    ),
    q<any[]>(
      supabase
        .from("prestamos")
        .select("id, fecha_desembolso")
        .eq("estado", "activo")
        .gt("monto_prestado", 0),
    ),
  ]);
  if (pendientesResp.error) throw new Error(pendientesResp.error.message);
  const pendientes_conciliar = pendientesResp.count ?? 0;

  // Préstamos sin abono reciente: para cada activo, traer MAX(fecha_abono) y filtrar en JS.
  // Un solo query a abonos_prestamos agrupado por prestamo_id es la forma más barata.
  let prestamos_sin_abono_reciente = 0;
  if (prestamosActivos.length > 0) {
    const ids = prestamosActivos.map((p) => p.id);
    const abonos = await q<any[]>(
      supabase
        .from("abonos_prestamos")
        .select("prestamo_id, fecha_abono")
        .in("prestamo_id", ids),
    );
    const ultimoAbono = new Map<number, string>();
    for (const a of abonos) {
      const prev = ultimoAbono.get(a.prestamo_id);
      if (!prev || a.fecha_abono > prev) ultimoAbono.set(a.prestamo_id, a.fecha_abono);
    }
    const limite = hace30DiasISO();
    prestamos_sin_abono_reciente = prestamosActivos.filter((p) => {
      const ultimo = ultimoAbono.get(p.id) ?? p.fecha_desembolso;
      return ultimo < limite;
    }).length;
  }

  const n = (v: unknown) => Number(v ?? 0);
  const ahorros = n(fin.ahorro);
  const actividades = n(fin.actividades);
  const rifa = n(fin.rifa);
  const intereses = n(fin.intereses);
  const prestamos_desembolsados = n(fin.prestamos_desembolsados);
  const abonos_prestamos_tot = n(fin.abonos_prestamos);
  const multas_tot = n(fin.multas);
  const deuda_pendiente = n(fin.cartera);
  const total_aportado = n(fin.ingresos);
  const socios_activos = n(fin.socios_activos);
  const al_dia_mes = {
    al_dia: new Set(alDiaMesRaw.map((t) => t.socio_id).filter(Boolean)).size,
    total: socios_activos,
  };
  const activa = activaResp[0];
  const actividad_activa = activa
    ? {
        id: activa.id as number,
        nombre: activa.nombre as string,
        pagadas: (activa.boletas_pagadas ?? 0) as number,
        total: (activa.boletas_asignadas ?? 0) as number,
      }
    : null;
  return {
    socios_activos,
    cuentas_admin: n(fin.cuentas_admin),
    n_transacciones: n(fin.n_transacciones),
    n_bancos: new Set(bs.map((b) => b.banco)).size,
    pendientes_conciliar,
    ahorros,
    actividades,
    rifa,
    intereses,
    prestamos_desembolsados,
    abonos_prestamos: abonos_prestamos_tot,
    multas: multas_tot,
    deuda_pendiente,
    utilidad_ciclo: intereses + multas_tot + rifa,
    total_aportado,
    al_dia_mes,
    actividad_activa,
    prestamos_sin_abono_reciente,
  };
}

async function matrizAhorro(): Promise<Matriz> {
  const filas = await q<any[]>(
    supabase.from("vw_matriz_ahorro").select("*").order("orden_periodo"),
  );
  return armarMatriz(filas);
}

async function matrizActividades(): Promise<Matriz> {
  const filas = await q<any[]>(
    supabase.from("vw_matriz_actividades").select("*").order("orden_periodo"),
  );
  return armarMatriz(filas);
}

function armarMatriz(filas: any[]): Matriz {
  const mesesMap = new Map<string, number>();
  const socios = new Map<number, { socio_id: number; nombre: string; total: number; celdas: Record<string, number> }>();
  for (const f of filas) {
    if (!mesesMap.has(f.periodo)) mesesMap.set(f.periodo, f.orden_periodo);
    const s = socios.get(f.socio_id) ?? {
      socio_id: f.socio_id,
      nombre: f.nombre,
      total: 0,
      celdas: {} as Record<string, number>,
    };
    s.celdas[f.periodo] = f.valor ?? 0;
    s.total += f.valor ?? 0;
    socios.set(f.socio_id, s);
  }
  return {
    meses: Array.from(mesesMap.entries())
      .map(([nombre, orden]) => ({ nombre, orden }))
      .sort((a, b) => a.orden - b.orden),
    socios: Array.from(socios.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

async function matrizPrestamos(): Promise<MatrizPrestamos> {
  const [ps, abonos] = await Promise.all([
    q<any[]>(supabase.from("periodos").select("id, nombre, orden").order("orden")),
    q<any[]>(
      supabase
        .from("abonos_prestamos")
        .select("socio_id, capital_pagado, intereses_pagados, fecha_abono, transaccion_id, socios(nombre)"),
    ),
  ]);
  // Necesitamos el periodo_id de la transacción. Simplificación: por fecha del abono.
  // Aproximación: usar mes/año contra periodos.orden si el nombre incluye ese mes.
  // Solo las transacciones de estos abonos: traer todas pasaba el tope de
  // 1000 filas de la API y se perdían periodos.
  const txIds = [...new Set(abonos.map((a) => a.transaccion_id).filter((id) => id != null))];
  const txPeriodos = txIds.length
    ? await q<any[]>(supabase.from("transacciones").select("id, periodo_id").in("id", txIds))
    : [];
  const periodoDeTx = new Map(txPeriodos.map((t) => [t.id, t.periodo_id]));
  const nombreDePeriodo = new Map(ps.map((p) => [p.id, p.nombre]));

  const socios = new Map<number, MatrizPrestamos["socios"][number]>();
  for (const a of abonos) {
    const periodoId = periodoDeTx.get(a.transaccion_id);
    if (periodoId == null) continue;
    const mesNombre = nombreDePeriodo.get(periodoId);
    if (!mesNombre) continue;
    const cur = socios.get(a.socio_id) ?? {
      socio_id: a.socio_id,
      nombre: a.socios?.nombre ?? "?",
      celdas: {} as Record<string, { abono: number; intereses: number; total: number }>,
      totalAbono: 0,
      totalIntereses: 0,
      total: 0,
    };
    const c = cur.celdas[mesNombre] ?? { abono: 0, intereses: 0, total: 0 };
    c.abono += a.capital_pagado ?? 0;
    c.intereses += a.intereses_pagados ?? 0;
    c.total = c.abono + c.intereses;
    cur.celdas[mesNombre] = c;
    cur.totalAbono += a.capital_pagado ?? 0;
    cur.totalIntereses += a.intereses_pagados ?? 0;
    cur.total = cur.totalAbono + cur.totalIntereses;
    socios.set(a.socio_id, cur);
  }
  return {
    meses: ps.map((p) => ({ nombre: p.nombre, orden: p.orden })),
    socios: Array.from(socios.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

async function liquidacion(): Promise<Liquidacion[]> {
  return q<Liquidacion[]>(
    supabase.from("vw_liquidacion_anual").select("*").order("nombre"),
  );
}

async function socioById(id: number): Promise<HistorialSocio> {
  const [socio] = await Promise.all([
    q<any>(supabase.from("vw_saldo_por_socio").select("*").eq("id", id).limit(1).single()),
  ]);
  const historial = await q<any[]>(
    supabase
      .from("transacciones")
      .select("id, fecha_pago, concepto, tipo, valor, periodo_id, periodos(nombre)")
      .eq("socio_id", id)
      .order("fecha_pago", { ascending: false }),
  );
  return {
    socio: {
      id: socio.id,
      nombre: socio.nombre,
      tipo: socio.tipo,
      estado: socio.estado,
      cuota_sostenimiento: socio.cuota_sostenimiento ?? 0,
      ahorro: socio.ahorro ?? 0,
      actividades: socio.actividades ?? 0,
      rifa_chance: socio.rifa_chance ?? 0,
      intereses_pagados: socio.intereses_pagados ?? 0,
      abonado_a_prestamos: socio.abonado_a_prestamos ?? 0,
      prestamos_recibidos: socio.prestamos_recibidos ?? 0,
      multas_pagadas: socio.multas_pagadas ?? 0,
      total_aportado: socio.total_aportado ?? 0,
      saldo_prestamos: socio.saldo_prestamos ?? 0,
    },
    historial: historial.map((h) => ({
      id: h.id,
      fecha_pago: h.fecha_pago,
      concepto: h.concepto,
      tipo: h.tipo,
      valor: h.valor,
      periodo: h.periodos?.nombre ?? null,
    })),
  };
}

// -------------------- mora (desactivada por defecto) --------------------
// Con MORA_HABILITADA=false en el backend Express respondemos vacío. En
// Supabase no hay backend, así que aplicamos la misma regla en cliente.

const MORA_HABILITADA = false;

async function moraIntereses(_detalle = false): Promise<MoraReporte> {
  return {
    hoy: new Date().toISOString().slice(0, 10),
    regla: {
      habilitada: MORA_HABILITADA,
      mora_por_dia: 500,
      aniversario: "mensual",
      aplica_desde: "2026-08-01",
    },
    totales: { mora_pagada: 0, mora_pendiente: 0, mora_total: 0, sin_pagar: 0 },
    prestamos: [],
  };
}

async function moraAhorros(_detalle = false): Promise<MoraAhorroReporte> {
  return {
    hoy: new Date().toISOString().slice(0, 10),
    regla: {
      habilitada: MORA_HABILITADA,
      mora_por_dia: 500,
      criterio: "fecha_corte_ahorro",
      aplica_desde: "2026-08-01",
    },
    totales: { mora_pagada: 0, mora_pendiente: 0, mora_total: 0, sin_pagar: 0 },
    socios: [],
  };
}

// -------------------- morosos --------------------

async function morosos(dias = 60): Promise<Moroso[]> {
  const [ss, ts] = await Promise.all([
    q<any[]>(
      supabase
        .from("socios")
        .select("id, nombre, cuota_sostenimiento, tipo, estado")
        .eq("tipo", "persona")
        .eq("estado", "activo"),
    ),
    q<any[]>(
      supabase
        .from("transacciones")
        .select("socio_id, fecha_pago, concepto")
        .eq("concepto", "AHORRO"),
    ),
  ]);
  const ultimoPorSocio = new Map<number, string>();
  for (const t of ts) {
    if (!t.fecha_pago) continue;
    const prev = ultimoPorSocio.get(t.socio_id);
    if (!prev || t.fecha_pago > prev) ultimoPorSocio.set(t.socio_id, t.fecha_pago);
  }
  const corte = new Date();
  corte.setDate(corte.getDate() - dias);
  const corteStr = corte.toISOString().slice(0, 10);
  return ss
    .filter((s) => {
      const u = ultimoPorSocio.get(s.id);
      return !u || u < corteStr;
    })
    .map((s) => ({
      id: s.id,
      nombre: s.nombre,
      cuota_sostenimiento: s.cuota_sostenimiento,
      ultimo_aporte: ultimoPorSocio.get(s.id) ?? null,
    }));
}

// -------------------- extractos bancarios --------------------

// Estados que todavía requieren trabajo de tesorería.
const ESTADOS_ABIERTOS: EstadoExtracto[] = ["pendiente", "parcial", "excedido"];

/** Quita los caracteres que rompen la sintaxis de filtros de PostgREST (.or). */
function textoBusqueda(q: string): string {
  return q.replace(/[,()*%\\:"]/g, " ").trim();
}

async function extractos(filtros: FiltrosExtracto = {}): Promise<ExtractosPage> {
  requireSupabaseEnv();
  // vw_extracto_estado es la única fuente del estado de conciliación
  // (tabla conciliaciones; ver scripts/natillera-migracion/supabase-conciliaciones.sql).
  let query = supabase.from("vw_extracto_estado").select("*", { count: "exact" });

  if (filtros.banco) query = query.eq("banco", filtros.banco);
  if (filtros.origen) query = query.eq("detalle_origen", filtros.origen);
  if (filtros.estado) query = query.eq("estado", filtros.estado);
  else if (filtros.conciliado === "true") query = query.eq("estado", "conciliado");
  else if (filtros.conciliado === "false") query = query.in("estado", ESTADOS_ABIERTOS);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);
  const texto = filtros.q ? textoBusqueda(filtros.q) : "";
  if (texto) query = query.or(`descripcion.ilike.*${texto}*,socio_nombre.ilike.*${texto}*`);
  if (filtros.socio_id) query = query.eq("socio_id", filtros.socio_id);

  const limit = filtros.limit ?? 50;
  const offset = filtros.offset ?? 0;
  query = query.order("fecha", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const filas = (data ?? []).map((m: any) => ({
    id: m.id,
    banco: m.banco,
    fecha: m.fecha,
    descripcion: m.descripcion,
    monto: m.monto,
    saldo_cuenta: m.saldo_cuenta,
    detalle_origen: m.detalle_origen,
    dependencia: m.dependencia ?? null,
    socio_id: m.socio_id,
    socio_nombre: m.socio_nombre ?? null,
    transaccion_id: (m.transaccion_ids as number[] | null)?.[0] ?? null,
    estado: m.estado as EstadoExtracto,
    valor_conciliado: Number(m.valor_conciliado ?? 0),
    valor_pendiente: Number(m.valor_pendiente ?? 0),
    n_transacciones: Number(m.n_transacciones ?? 0),
    categoria: (m.categoria ?? null) as CategoriaBanco | null,
  }));
  return { total: count ?? filas.length, limit, offset, filas };
}

// -------------------- conciliación fase 2 --------------------

async function sugerenciasConciliacion(): Promise<SugerenciaConciliacion[]> {
  requireSupabaseEnv();
  const filas = await q<any[]>(
    supabase.from("vw_sugerencias_conciliacion").select("*").order("fecha", { ascending: false }),
  );
  return filas.map((s) => ({
    ...s,
    monto: Number(s.monto),
    socio_id: Number(s.socio_id),
    dias: Number(s.dias),
    transaccion_ids: (s.transaccion_ids ?? []).map(Number),
  }));
}

async function aceptarSugerencias(ids: number[]): Promise<ResultadoSugerencias> {
  requireSupabaseEnv();
  return q<ResultadoSugerencias>(supabase.rpc("natillera_aceptar_sugerencias", { p_extracto_ids: ids }));
}

async function categorizarExtractos(ids: number[], categoria: CategoriaBanco | null) {
  requireSupabaseEnv();
  return q<{ actualizados: number }>(
    supabase.rpc("natillera_categorizar_extractos", { p_ids: ids, p_categoria: categoria }),
  );
}

async function aplicarReglas(): Promise<number> {
  requireSupabaseEnv();
  return q<number>(supabase.rpc("natillera_aplicar_reglas", {}));
}

async function reglasBanco(): Promise<ReglaBanco[]> {
  requireSupabaseEnv();
  return q<ReglaBanco[]>(
    supabase.from("reglas_banco").select("id, nombre, patron, tipo, categoria, activa").order("id"),
  );
}

async function guardarRegla(r: Omit<ReglaBanco, "id" | "activa">): Promise<ReglaBanco> {
  requireSupabaseEnv();
  return q<ReglaBanco>(
    supabase
      .from("reglas_banco")
      .insert({ nombre: r.nombre.trim(), patron: r.patron.trim(), tipo: r.tipo, categoria: r.categoria })
      .select("id, nombre, patron, tipo, categoria, activa")
      .single(),
  );
}

async function cambiarRegla(id: number, patch: Partial<Pick<ReglaBanco, "activa">>) {
  requireSupabaseEnv();
  const { error } = await supabase.from("reglas_banco").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// -------------------- conciliación (RPC, todo o nada) --------------------

interface LineaConciliacion {
  valor: number;
  transaccion_id?: number;
  socio_id?: number;
  concepto?: string;
  periodo_id?: number | null;
  fecha_pago?: string;
  notas?: string;
}

interface ResultadoConciliacion {
  ok: true;
  extracto_id: number;
  creadas: { id: number; socio_id: number; concepto: string; tipo: "ingreso" | "egreso"; valor: number }[];
  vinculadas: number;
  valor_conciliado: number;
  valor_pendiente: number;
  estado: EstadoExtracto;
}

async function conciliarExtracto(extracto_id: number, lineas: LineaConciliacion[]) {
  requireSupabaseEnv();
  return q<ResultadoConciliacion>(
    supabase.rpc("natillera_conciliar_extracto", { p_extracto_id: extracto_id, p_lineas: lineas }),
  );
}

/** Une una transacción existente al movimiento (o quita todas las uniones con null). */
async function vincularExtracto(id: number, transaccion_id: number | null) {
  requireSupabaseEnv();
  if (transaccion_id === null) {
    await q(supabase.rpc("natillera_desconciliar_extracto", { p_extracto_id: id }));
    return { ok: true as const };
  }
  const tx = await q<{ valor: number }>(
    supabase.from("transacciones").select("valor").eq("id", transaccion_id).single(),
  );
  await conciliarExtracto(id, [{ transaccion_id, valor: tx.valor }]);
  return { ok: true as const };
}

async function marcarOrigenExtracto(id: number, detalle_origen: string | null) {
  requireSupabaseEnv();
  const { error } = await supabase
    .from("movimientos_banco")
    .update({ detalle_origen })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function asignarSocioExtracto(id: number, socio_id: number | null) {
  requireSupabaseEnv();
  const payload: Record<string, unknown> = { socio_id };
  if (socio_id !== null) {
    payload.asociado_manual = true;
    payload.asociado_manual_fecha = new Date().toISOString();
  }
  const { error } = await supabase
    .from("movimientos_banco")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function sugerenciasDependencia() {
  requireSupabaseEnv();
  const { data, error } = await supabase
    .from("vw_dependencia_socio")
    .select("dependencia, socio_id, socio_nombre, frecuencia");
  if (error) throw new Error(error.message);
  return { sugerencias: (data ?? []) as any[] };
}

async function crearMovimientoBanco(m: {
  banco: string;
  fecha: string;
  descripcion?: string;
  monto: number;
  saldo_cuenta?: number | null;
  detalle_origen?: string | null;
  socio_id?: number | null;
  dependencia?: string | null;
}) {
  requireSupabaseEnv();
  const fila_origen = -Date.now();
  const depRaw = m.dependencia != null ? String(m.dependencia).trim() : "";
  const dependencia = depRaw && depRaw.toLowerCase() !== "null" ? depRaw : null;
  const { data, error } = await supabase
    .from("movimientos_banco")
    .insert({
      banco: m.banco,
      fecha: m.fecha,
      descripcion: m.descripcion ?? null,
      monto: m.monto,
      saldo_cuenta: m.saldo_cuenta ?? null,
      detalle_origen: m.detalle_origen ?? null,
      socio_id: m.socio_id ?? null,
      dependencia,
      fila_origen,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { creado: true as const, id: data?.id };
}

/**
 * Importa el extracto en bloque en la base (natillera_importar_extracto):
 * omite los movimientos que ya existen y, si una fila es inválida, no
 * importa nada y devuelve los errores por fila.
 */
async function importarExtracto(banco: string, movimientos: unknown[]) {
  requireSupabaseEnv();
  // Pesos enteros: el banco a veces trae centavos (p. ej. intereses).
  const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : v ?? null);
  const filas = movimientos.map((raw) => {
    const m = raw as Record<string, unknown>;
    return {
      fecha: m.fecha ?? null,
      descripcion: m.descripcion ?? null,
      monto: entero(m.monto),
      saldo_cuenta: entero(m.saldo_cuenta ?? m.saldo),
      detalle_origen: m.detalle_origen ?? m.detalle ?? null,
      dependencia: m.dependencia ?? m.cuenta ?? null,
    };
  });
  return q<{ insertados: number; duplicados: number; clasificados?: number; errores: { fila: number; motivo: string }[] }>(
    supabase.rpc("natillera_importar_extracto", { p_banco: banco, p_filas: filas }),
  );
}

async function contarExtractosRango(desde: string, hasta: string, banco?: string | null) {
  requireSupabaseEnv();
  let qTotal = supabase
    .from("movimientos_banco")
    .select("id", { count: "exact", head: true })
    .gte("fecha", desde)
    .lte("fecha", hasta);
  let qConTx = supabase
    .from("vw_extracto_estado")
    .select("id", { count: "exact", head: true })
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .gt("n_transacciones", 0);
  if (banco) {
    qTotal = qTotal.eq("banco", banco);
    qConTx = qConTx.eq("banco", banco);
  }
  const [tot, ct] = await Promise.all([qTotal, qConTx]);
  if (tot.error) throw new Error(tot.error.message);
  if (ct.error) throw new Error(ct.error.message);
  return { total: tot.count ?? 0, con_transaccion: ct.count ?? 0 };
}

async function borrarExtractosRango(desde: string, hasta: string, banco?: string | null) {
  requireSupabaseEnv();
  // Supabase .delete() necesita un filtro; usamos gte/lte + eq opcional.
  let qDelete = supabase
    .from("movimientos_banco")
    .delete({ count: "exact" })
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (banco) qDelete = qDelete.eq("banco", banco);
  const { error, count } = await qDelete;
  if (error) throw new Error(error.message);
  return { borrados: count ?? 0 };
}

// -------------------- transacciones --------------------

function tipoDeConcepto(c: string): "ingreso" | "egreso" {
  return c === "PRESTAMO" ? "egreso" : "ingreso";
}

async function crearTransaccion(t: NuevaTransaccion) {
  requireSupabaseEnv();
  if (t.extracto_id != null) {
    // Ligada a un movimiento del banco: crear + unir en una sola operación.
    const r = await conciliarExtracto(t.extracto_id, [
      {
        socio_id: t.socio_id,
        concepto: t.concepto,
        valor: t.valor,
        periodo_id: t.periodo_id ?? null,
        fecha_pago: t.fecha_pago,
        notas: t.notas,
      },
    ]);
    return r.creadas[0];
  }
  const fila_origen = -Date.now();
  const { data, error } = await supabase
    .from("transacciones")
    .insert({
      socio_id: t.socio_id,
      periodo_id: t.periodo_id ?? null,
      concepto: t.concepto,
      tipo: tipoDeConcepto(t.concepto),
      valor: t.valor,
      fecha_pago: t.fecha_pago ?? null,
      notas: t.notas ?? null,
      fila_origen,
    })
    .select("id, socio_id, concepto, tipo, valor")
    .single();
  if (error) throw new Error(error.message);
  return data!;
}

async function crearDesglose(d: DesglosePago) {
  requireSupabaseEnv();
  if (d.extracto_id != null) {
    // Todas las líneas se crean y se unen al movimiento juntas, o ninguna.
    const r = await conciliarExtracto(
      d.extracto_id,
      d.lineas.map((l) => ({
        socio_id: d.socio_id,
        concepto: l.concepto,
        valor: l.valor,
        periodo_id: d.periodo_id ?? null,
        fecha_pago: d.fecha_pago,
        notas: l.notas ?? d.notas,
      })),
    );
    return {
      ids: r.creadas.map((c) => c.id),
      extracto_id: d.extracto_id,
      total: r.creadas.reduce((s, c) => s + c.valor, 0),
    };
  }
  const ids: number[] = [];
  let total = 0;
  for (const linea of d.lineas) {
    const res = await crearTransaccion({
      socio_id: d.socio_id,
      concepto: linea.concepto,
      valor: linea.valor,
      fecha_pago: d.fecha_pago,
      periodo_id: d.periodo_id,
      notas: linea.notas ?? d.notas,
    });
    ids.push(res.id);
    total += linea.valor;
  }
  return { ids, extracto_id: null, total };
}

async function eliminarTransaccion(id: number) {
  requireSupabaseEnv();
  const { error } = await supabase.from("transacciones").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function buscarTransacciones(params: {
  socio_id?: number;
  concepto?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}): Promise<Transaccion[]> {
  requireSupabaseEnv();
  let query = supabase
    .from("transacciones")
    .select("id, socio_id, concepto, tipo, valor, fecha_pago, periodo_id, socios(nombre), periodos(nombre), fila_origen");
  if (params.socio_id) query = query.eq("socio_id", params.socio_id);
  if (params.concepto) query = query.eq("concepto", params.concepto);
  if (params.desde) query = query.gte("fecha_pago", params.desde);
  if (params.hasta) query = query.lte("fecha_pago", params.hasta);
  query = query.order("fecha_pago", { ascending: false });
  if (params.limit) query = query.limit(params.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((t: any) => ({
    id: t.id,
    socio_id: t.socio_id,
    socio: t.socios?.nombre ?? "?",
    concepto: t.concepto,
    tipo: t.tipo,
    valor: t.valor,
    fecha_pago: t.fecha_pago,
    periodo: t.periodos?.nombre ?? null,
    origen: (t.fila_origen ?? 0) < 0 ? "manual" : "excel",
  }));
}

// -------------------- simulador --------------------

async function simularLiquidacion(params: SimuladorParams): Promise<SimuladorResultado> {
  const base = await q<any[]>(supabase.from("vw_liquidacion_anual").select("*"));

  const aplicarModo = (bruto: number, cfg?: { modo: string; valor?: number }) => {
    const modo = cfg?.modo ?? "cobrar";
    if (modo === "condonar") return 0;
    if (modo === "manual") return Math.max(0, Math.round(Number(cfg?.valor) || 0));
    if (modo === "porcentaje") return Math.round(bruto * (Number(cfg?.valor) || 0));
    return bruto;
  };

  // Con MORA_HABILITADA=false la mora es siempre 0 (regla desactivada).
  const filas = base.map((r: any) => {
    const moraAhorroBruta = 0;
    const moraIntBruta = 0;
    return {
      id: r.id,
      nombre: r.nombre,
      ahorro: r.ahorro ?? 0,
      actividades: r.actividades ?? 0,
      rifa_chance: r.rifa_chance ?? 0,
      intereses_pagados: r.intereses_pagados ?? 0,
      total_aportes: r.total_aportes ?? 0,
      deducc_multas: r.deducc_multas ?? 0,
      deducc_prestamo: r.deducc_prestamo ?? 0,
      mora_ahorro_bruta: moraAhorroBruta,
      mora_intereses_bruta: moraIntBruta,
      deducc_mora_ahorro: aplicarModo(moraAhorroBruta, params.mora_ahorros),
      deducc_mora_intereses: aplicarModo(moraIntBruta, params.mora_intereses),
      deducc_prestamo_aplicada:
        params.prestamos?.modo === "no_descontar" ? 0 : r.deducc_prestamo ?? 0,
      participacion_utilidad: 0,
      proporcion: 0,
      neto_a_recibir: 0,
    };
  });

  const totalIntPagados = filas.reduce((a, f) => a + f.intereses_pagados, 0);
  const totalMultasCobradas = filas.reduce((a, f) => a + f.deducc_multas, 0);
  const totalRifa = filas.reduce((a, f) => a + f.rifa_chance, 0);
  const totalMoraAhCobrada = filas.reduce((a, f) => a + f.deducc_mora_ahorro, 0);
  const totalMoraIntCobrada = filas.reduce((a, f) => a + f.deducc_mora_intereses, 0);

  const utilidadTotal =
    totalIntPagados + totalMoraAhCobrada + totalMoraIntCobrada + totalRifa;

  const cfgUtil = params.utilidad ?? { modo: "toda" as const };
  let utilidadARepartir = utilidadTotal;
  let reserva = 0;
  if (cfgUtil.modo === "no_repartir") utilidadARepartir = 0;
  else if (cfgUtil.modo === "reserva") {
    reserva = Math.max(0, Math.round(Number(cfgUtil.reserva) || 0));
    utilidadARepartir = Math.max(0, utilidadTotal - reserva);
  } else if (cfgUtil.modo === "porcentaje") {
    utilidadARepartir = Math.round(utilidadTotal * (Number(cfgUtil.porcentaje) || 0));
    reserva = utilidadTotal - utilidadARepartir;
  }

  const reparto = params.reparto?.modo || "proporcional_ahorro";
  const totalAhorro = filas.reduce((a, f) => a + f.ahorro, 0);
  const totalAportes = filas.reduce((a, f) => a + f.total_aportes, 0);
  const nSocios = filas.length;

  for (const f of filas) {
    let base = 0;
    let denom = 0;
    if (reparto === "igual") {
      base = 1;
      denom = nSocios;
    } else if (reparto === "proporcional_aportes") {
      base = f.total_aportes;
      denom = totalAportes;
    } else {
      base = f.ahorro;
      denom = totalAhorro;
    }
    const prop = denom > 0 ? base / denom : 0;
    f.participacion_utilidad = Math.round(utilidadARepartir * prop);
    f.proporcion = prop;
    f.neto_a_recibir =
      f.total_aportes +
      f.participacion_utilidad -
      f.deducc_prestamo_aplicada -
      f.deducc_multas -
      f.deducc_mora_ahorro -
      f.deducc_mora_intereses;
  }
  filas.sort((a, b) => b.neto_a_recibir - a.neto_a_recibir);

  const fechaCorte = params.fecha_corte || new Date().toISOString().slice(0, 10);

  return {
    parametros: {
      fecha_corte: fechaCorte,
      mora_ahorros: params.mora_ahorros ?? { modo: "cobrar" },
      mora_intereses: params.mora_intereses ?? { modo: "cobrar" },
      prestamos: params.prestamos ?? { modo: "total" },
      utilidad: cfgUtil,
      reparto: params.reparto ?? { modo: "proporcional_ahorro" },
    },
    totales: {
      total_ahorros: totalAhorro,
      total_aportes: totalAportes,
      utilidad_total: utilidadTotal,
      utilidad_a_repartir: utilidadARepartir,
      reserva,
      total_prestamos: filas.reduce((a, f) => a + f.deducc_prestamo_aplicada, 0),
      total_multas: totalMultasCobradas,
      total_mora_ahorro_bruta: filas.reduce((a, f) => a + f.mora_ahorro_bruta, 0),
      total_mora_intereses_bruta: filas.reduce((a, f) => a + f.mora_intereses_bruta, 0),
      total_mora_ahorro_cobrada: totalMoraAhCobrada,
      total_mora_intereses_cobrada: totalMoraIntCobrada,
      total_neto: filas.reduce((a, f) => a + f.neto_a_recibir, 0),
      socios_negativos: filas.filter((f) => f.neto_a_recibir < 0).length,
      socios_positivos: filas.filter((f) => f.neto_a_recibir > 0).length,
    },
    socios: filas,
  };
}

// -------------------- totales sin nombres (RPC de supabase-acceso.sql) --------------------

async function totalesGenerales(): Promise<TotalesGenerales> {
  return q<TotalesGenerales>(supabase.rpc("nat_totales_generales"));
}

// -------------------- health --------------------

async function health() {
  requireSupabaseEnv();
  const { error } = await supabase.from("socios").select("id", { head: true, count: "exact" }).limit(1);
  if (error) throw new Error(error.message);
  return { ok: true as const, db: "supabase" };
}

// -------------------- actividades --------------------

async function listarActividades(): Promise<ActividadResumen[]> {
  const filas = await q<any[]>(
    supabase
      .from("vw_actividades_resumen")
      .select("*")
      .order("fecha_evento", { ascending: false, nullsFirst: false }),
  );
  return filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    descripcion: r.descripcion ?? null,
    fecha_evento: r.fecha_evento ?? null,
    valor_boleta: r.valor_boleta ?? 0,
    total_boletas: r.total_boletas ?? null,
    premios: r.premios ?? {},
    estado: r.estado,
    notas: r.notas ?? null,
    boletas_asignadas: Number(r.boletas_asignadas ?? 0),
    boletas_pagadas: Number(r.boletas_pagadas ?? 0),
    boletas_pendientes: Number(r.boletas_pendientes ?? 0),
    participantes: Number(r.participantes ?? 0),
    recaudado: Number(r.recaudado ?? 0),
    por_cobrar: Number(r.por_cobrar ?? 0),
  }));
}

async function actividadDetalle(id: number): Promise<ActividadDetalle> {
  const resumen = await q<any>(
    supabase.from("vw_actividades_resumen").select("*").eq("id", id).limit(1).single(),
  );
  const boletas = await q<any[]>(
    supabase
      .from("actividad_boletas")
      .select("*, socios(nombre)")
      .eq("actividad_id", id)
      .order("numero", { ascending: true }),
  );
  return {
    actividad: {
      id: resumen.id,
      nombre: resumen.nombre,
      tipo: resumen.tipo,
      descripcion: resumen.descripcion ?? null,
      fecha_evento: resumen.fecha_evento ?? null,
      valor_boleta: resumen.valor_boleta ?? 0,
      total_boletas: resumen.total_boletas ?? null,
      premios: resumen.premios ?? {},
      estado: resumen.estado,
      notas: resumen.notas ?? null,
      boletas_asignadas: Number(resumen.boletas_asignadas ?? 0),
      boletas_pagadas: Number(resumen.boletas_pagadas ?? 0),
      boletas_pendientes: Number(resumen.boletas_pendientes ?? 0),
      participantes: Number(resumen.participantes ?? 0),
      recaudado: Number(resumen.recaudado ?? 0),
      por_cobrar: Number(resumen.por_cobrar ?? 0),
    },
    boletas: boletas.map((b: any) => ({
      id: b.id,
      actividad_id: b.actividad_id,
      numero: b.numero,
      socio_id: b.socio_id,
      socio_nombre: b.socios?.nombre ?? null,
      nombre_externo: b.nombre_externo ?? null,
      pagada: !!b.pagada,
      fecha_pago: b.fecha_pago ?? null,
      transaccion_id: b.transaccion_id,
      es_ganadora: !!b.es_ganadora,
      premio_tipo: b.premio_tipo ?? null,
      notas: b.notas ?? null,
    })) as ActividadBoleta[],
  };
}

async function marcarBoletaPagada(id: number, pagada: boolean) {
  requireSupabaseEnv();
  const { error } = await supabase
    .from("actividad_boletas")
    .update({
      pagada,
      fecha_pago: pagada ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function marcarBoletaGanadora(id: number, premio: "mayor" | "segundo" | null) {
  requireSupabaseEnv();
  const { error } = await supabase
    .from("actividad_boletas")
    .update({
      es_ganadora: premio !== null,
      premio_tipo: premio,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function actualizarActividad(id: number, patch: ActividadPatch) {
  requireSupabaseEnv();
  // Solo mandar los campos que vienen definidos para no sobrescribir con null por accidente.
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) payload[k] = v;
  }
  if (Object.keys(payload).length === 0) return { ok: true as const };
  const { error } = await supabase.from("actividades").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

// -------------------- exports --------------------

export const apiSupabase = {
  resumen,
  panel,
  prestamosReferidos,
  referidos,
  crearReferido,
  tasasPrestamo,
  guardarTasa,
  crearPrestamo,
  egresosPendientes,
  sugerenciasConciliacion,
  aceptarSugerencias,
  categorizarExtractos,
  aplicarReglas,
  reglasBanco,
  guardarRegla,
  cambiarRegla,
  totalesGenerales,
  socios,
  socioById,
  matrizAhorro,
  matrizActividades,
  matrizPrestamos,
  moraIntereses,
  moraAhorros,
  liquidacion,
  bancos,
  ahorrosPorPeriodo,
  deudores,
  morosos,
  health,
  periodos,
  extractos,
  vincularExtracto,
  marcarOrigenExtracto,
  asignarSocioExtracto,
  sugerenciasDependencia,
  crearTransaccion,
  crearDesglose,
  crearMovimientoBanco,
  importarExtracto,
  contarExtractosRango,
  borrarExtractosRango,
  simularLiquidacion,
  eliminarTransaccion,
  buscarTransacciones,
  listarActividades,
  actividadDetalle,
  marcarBoletaPagada,
  marcarBoletaGanadora,
  actualizarActividad,
};
