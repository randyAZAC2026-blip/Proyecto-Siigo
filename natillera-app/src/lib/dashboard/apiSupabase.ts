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
  FiltrosExtracto,
  Transaccion,
  NuevaTransaccion,
  DesglosePago,
  SimuladorParams,
  SimuladorResultado,
  TotalesGenerales,
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
  }));
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

async function bancos(): Promise<Banco[]> {
  const movs = await q<any[]>(
    supabase.from("movimientos_banco").select("banco, monto, detalle_origen"),
  );
  const agg = new Map<string, Banco>();
  for (const m of movs) {
    const b = agg.get(m.banco) ?? {
      banco: m.banco,
      n_movs: 0,
      ingresos: 0,
      egresos: 0,
      ingresos_natillera: 0,
    };
    b.n_movs += 1;
    if (m.monto >= 0) b.ingresos += m.monto;
    else b.egresos += -m.monto;
    if (m.monto >= 0 && m.detalle_origen === "NATILLERA") b.ingresos_natillera += m.monto;
    agg.set(m.banco, b);
  }
  return Array.from(agg.values());
}

async function resumen(): Promise<Resumen> {
  const [ss, ts, bs] = await Promise.all([
    q<any[]>(supabase.from("socios").select("id, tipo, estado")),
    q<any[]>(supabase.from("transacciones").select("concepto, tipo, valor")),
    q<any[]>(supabase.from("movimientos_banco").select("banco")),
  ]);
  const totalPorConcepto = (concepto: string) =>
    ts.filter((t) => t.concepto === concepto).reduce((s, t) => s + t.valor, 0);
  const ahorros = totalPorConcepto("AHORRO");
  const actividades = totalPorConcepto("ACTIVIDADES");
  const rifa = totalPorConcepto("RIFA_CHANCE");
  const intereses = totalPorConcepto("INTERESES_PRESTAMO");
  const prestamos_desembolsados = totalPorConcepto("PRESTAMO");
  const abonos_prestamos_tot = totalPorConcepto("ABONO_PRESTAMO");
  const multas_tot = totalPorConcepto("MULTA");
  const deuda_pendiente = prestamos_desembolsados - abonos_prestamos_tot;
  const total_aportado = ts
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + t.valor, 0);
  return {
    socios_activos: ss.filter((s) => s.tipo === "persona" && s.estado === "activo").length,
    cuentas_admin: ss.filter((s) => s.tipo === "cuenta_admin").length,
    n_transacciones: ts.length,
    n_bancos: new Set(bs.map((b) => b.banco)).size,
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
  const txPeriodos = await q<any[]>(
    supabase.from("transacciones").select("id, periodo_id"),
  );
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

async function extractos(filtros: FiltrosExtracto = {}): Promise<ExtractosPage> {
  requireSupabaseEnv();
  let query = supabase
    .from("movimientos_banco")
    .select("*, socios(nombre)", { count: "exact" });

  if (filtros.banco) query = query.eq("banco", filtros.banco);
  if (filtros.origen) query = query.eq("detalle_origen", filtros.origen);
  if (filtros.conciliado === "true") query = query.not("transaccion_id", "is", null);
  if (filtros.conciliado === "false") query = query.is("transaccion_id", null);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);
  if (filtros.q) query = query.or(`descripcion.ilike.%${filtros.q}%,socios.nombre.ilike.%${filtros.q}%`);
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
    socio_id: m.socio_id,
    socio_nombre: m.socios?.nombre ?? null,
    transaccion_id: m.transaccion_id,
  }));
  return { total: count ?? filas.length, limit, offset, filas };
}

async function vincularExtracto(id: number, transaccion_id: number | null) {
  requireSupabaseEnv();
  const { error } = await supabase
    .from("movimientos_banco")
    .update({ transaccion_id })
    .eq("id", id);
  if (error) throw new Error(error.message);
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

async function crearMovimientoBanco(m: {
  banco: string;
  fecha: string;
  descripcion?: string;
  monto: number;
  saldo_cuenta?: number | null;
  detalle_origen?: string | null;
  socio_id?: number | null;
}) {
  requireSupabaseEnv();
  const fila_origen = -Date.now();
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
      fila_origen,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { creado: true as const, id: data?.id };
}

async function importarExtracto(banco: string, movimientos: unknown[]) {
  requireSupabaseEnv();
  const resultado = { insertados: 0, duplicados: 0, errores: [] as { fila: number; motivo: string }[] };
  for (let i = 0; i < movimientos.length; i++) {
    const m = movimientos[i] as Record<string, unknown>;
    try {
      const r = await crearMovimientoBanco({
        banco,
        fecha: String(m.fecha ?? ""),
        descripcion: (m.descripcion as string | undefined) ?? undefined,
        monto: Number(m.monto),
        saldo_cuenta: (m.saldo_cuenta ?? m.saldo) as number | null | undefined,
        detalle_origen: (m.detalle_origen ?? m.detalle) as string | null | undefined,
        socio_id: (m.socio_id as number | null | undefined) ?? null,
      });
      if (r.creado) resultado.insertados++;
      else resultado.duplicados++;
    } catch (err) {
      resultado.errores.push({
        fila: i + 1,
        motivo: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return resultado;
}

// -------------------- transacciones --------------------

function tipoDeConcepto(c: string): "ingreso" | "egreso" {
  return c === "PRESTAMO" ? "egreso" : "ingreso";
}

async function crearTransaccion(t: NuevaTransaccion) {
  requireSupabaseEnv();
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
  if (t.extracto_id != null && data?.id != null) {
    await vincularExtracto(t.extracto_id, data.id);
  }
  return data!;
}

async function crearDesglose(d: DesglosePago) {
  requireSupabaseEnv();
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
  if (d.extracto_id != null && ids.length > 0) {
    await vincularExtracto(d.extracto_id, ids[0]);
  }
  return { ids, extracto_id: d.extracto_id ?? null, total };
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

// -------------------- exports --------------------

export const apiSupabase = {
  resumen,
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
  crearTransaccion,
  crearDesglose,
  crearMovimientoBanco,
  importarExtracto,
  simularLiquidacion,
  eliminarTransaccion,
  buscarTransacciones,
};
