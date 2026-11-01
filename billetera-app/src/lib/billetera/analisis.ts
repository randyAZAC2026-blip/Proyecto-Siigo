// Cálculos del módulo Análisis: cómo se mueve la plata mes a mes. Funciones puras sobre los movimientos
// (las transferencias entre cuentas no son gasto ni ingreso y se ignoran).

export interface MovimientoAnalisis {
  id: string;
  tipo: "ingreso" | "egreso" | "transferencia";
  monto: number | string;
  fecha: string; // AAAA-MM-DD
  cuenta_id: string;
  categoria_id: string | null;
  categoria?: { nombre: string } | null;
  cxp_id?: string | null;
  cxc_id?: string | null;
  descripcion?: string | null;
  contraparte?: string | null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const monto = (m: MovimientoAnalisis) => Number(m.monto) || 0;
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** 'AAAA-MM' corrido n meses (n negativo hacia atrás). */
export function desplazarMes(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function diasDelMes(mes: string): number {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** «octubre 2026» o, corto, «oct». */
export function etiquetaMes(mes: string, corto = false): string {
  const [y, m] = mes.split("-").map(Number);
  return corto ? MESES[m - 1].slice(0, 3) : `${MESES[m - 1]} ${y}`;
}

/** Nombre del grupo de un movimiento: su categoría o, sin categoría, si es pago de una deuda o un cobro. */
export function grupoDe(m: MovimientoAnalisis): string {
  if (m.categoria?.nombre) return m.categoria.nombre;
  if (m.cxp_id) return "Pago de deudas";
  if (m.cxc_id) return "Cobros";
  return "Sin categoría";
}

const delMes = (movs: MovimientoAnalisis[], mes: string) => movs.filter((m) => mesDe(m.fecha) === mes);
const gastos = (movs: MovimientoAnalisis[]) => movs.filter((m) => m.tipo === "egreso");

export interface ResumenMes {
  gastos: number;
  ingresos: number;
  balance: number;
  nGastos: number;
}

export function resumenMes(movs: MovimientoAnalisis[], mes: string): ResumenMes {
  let g = 0; let i = 0; let n = 0;
  for (const m of delMes(movs, mes)) {
    if (m.tipo === "egreso") { g += monto(m); n++; }
    else if (m.tipo === "ingreso") i += monto(m);
  }
  return { gastos: g, ingresos: i, balance: i - g, nGastos: n };
}

/** Variación porcentual; null si no hay base para comparar. */
export const variacion = (actual: number, anterior: number) => (anterior > 0 ? ((actual - anterior) / anterior) * 100 : null);

export interface GastoCategoria {
  nombre: string;
  total: number;
  porcentaje: number;
  n: number;
}

/** Gastos del mes por categoría, de mayor a menor. Pasadas `maximo` categorías, el resto va en «Otras». */
export function gastosPorCategoria(movs: MovimientoAnalisis[], mes: string, maximo = 8): GastoCategoria[] {
  const mapa = new Map<string, { total: number; n: number }>();
  for (const m of gastos(delMes(movs, mes))) {
    const g = mapa.get(grupoDe(m)) ?? { total: 0, n: 0 };
    g.total += monto(m); g.n++;
    mapa.set(grupoDe(m), g);
  }
  const total = [...mapa.values()].reduce((s, g) => s + g.total, 0);
  const lista = [...mapa.entries()].map(([nombre, g]) => ({ nombre, total: g.total, n: g.n })).sort((a, b) => b.total - a.total);
  const cabeza = lista.length > maximo ? lista.slice(0, maximo - 1) : lista;
  const cola = lista.length > maximo ? lista.slice(maximo - 1) : [];
  if (cola.length) cabeza.push({ nombre: "Otras", total: cola.reduce((s, c) => s + c.total, 0), n: cola.reduce((s, c) => s + c.n, 0) });
  return cabeza.map((c) => ({ ...c, porcentaje: total ? (c.total / total) * 100 : 0 }));
}

export interface PuntoRitmo {
  dia: number;
  actual: number | null;
  anterior: number | null;
}

/**
 * Gasto acumulado día a día del mes contra el mes anterior, para ver el ritmo. Si el mes es el actual, la línea
 * del mes llega hasta hoy (no se dibuja el futuro).
 */
export function ritmoDelMes(movs: MovimientoAnalisis[], mes: string, hoy: string): PuntoRitmo[] {
  const anterior = desplazarMes(mes, -1);
  const porDia = (m: string) => {
    const d = new Array(diasDelMes(m) + 1).fill(0);
    for (const x of gastos(delMes(movs, m))) d[Number(x.fecha.slice(8, 10))] += monto(x);
    return d;
  };
  const a = porDia(mes); const b = porDia(anterior);
  const tope = mesDe(hoy) === mes ? Number(hoy.slice(8, 10)) : diasDelMes(mes);
  const largo = Math.max(diasDelMes(mes), diasDelMes(anterior));
  const puntos: PuntoRitmo[] = [];
  let sa = 0; let sb = 0;
  for (let dia = 1; dia <= largo; dia++) {
    sa += a[dia] ?? 0; sb += b[dia] ?? 0;
    puntos.push({ dia, actual: dia <= tope && dia <= diasDelMes(mes) ? sa : null, anterior: dia <= diasDelMes(anterior) ? sb : null });
  }
  return puntos;
}

export interface Proyeccion {
  diasTranscurridos: number;
  promedioDiario: number;
  proyeccion: number | null; // solo para el mes en curso, mientras queden días
}

/** Promedio de gasto diario y, si el mes está en curso, a cuánto llegaría a fin de mes a ese ritmo. */
export function proyeccionMes(movs: MovimientoAnalisis[], mes: string, hoy: string): Proyeccion {
  const total = resumenMes(movs, mes).gastos;
  const enCurso = mesDe(hoy) === mes;
  const dias = enCurso ? Number(hoy.slice(8, 10)) : diasDelMes(mes);
  const promedio = dias ? total / dias : 0;
  // El último día del mes ya no hay nada que proyectar: el total es el cierre.
  const quedanDias = enCurso && dias < diasDelMes(mes);
  return { diasTranscurridos: dias, promedioDiario: promedio, proyeccion: quedanDias ? promedio * diasDelMes(mes) : null };
}

export interface PuntoMensual {
  mes: string;
  etiqueta: string;
  ingresos: number;
  gastos: number;
}

/** Ingresos y gastos de los últimos `n` meses, terminando en `mesFinal`. */
export function serieMensual(movs: MovimientoAnalisis[], mesFinal: string, n = 6): PuntoMensual[] {
  return Array.from({ length: n }, (_, i) => {
    const mes = desplazarMes(mesFinal, i - n + 1);
    const r = resumenMes(movs, mes);
    return { mes, etiqueta: etiquetaMes(mes, true), ingresos: r.ingresos, gastos: r.gastos };
  });
}

export interface GastoDiaSemana {
  dia: string;
  total: number;
  promedio: number; // por cada día de ese tipo en el rango
}

const diaSemana = (fecha: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lunes
};

/** Cuánto se gasta, en promedio, cada día de la semana entre dos fechas (incluidas). */
export function gastoPorDiaSemana(movs: MovimientoAnalisis[], desde: string, hasta: string): GastoDiaSemana[] {
  const totales = new Array(7).fill(0);
  const cuenta = new Array(7).fill(0);
  const [y, m, d] = desde.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso > hasta) break;
    cuenta[diaSemana(iso)]++;
  }
  for (const x of gastos(movs)) if (x.fecha >= desde && x.fecha <= hasta) totales[diaSemana(x.fecha)] += monto(x);
  return DIAS_SEMANA.map((dia, i) => ({ dia, total: totales[i], promedio: cuenta[i] ? totales[i] / cuenta[i] : 0 }));
}

/** Los gastos más grandes del mes. */
export function mayoresGastos(movs: MovimientoAnalisis[], mes: string, n = 5): MovimientoAnalisis[] {
  return gastos(delMes(movs, mes)).sort((a, b) => monto(b) - monto(a)).slice(0, n);
}

export interface CambioCategoria {
  nombre: string;
  actual: number;
  anterior: number;
  diferencia: number;
  variacion: number | null;
}

/** Categorías que más cambiaron frente al mes anterior (por diferencia en pesos). */
export function cambiosCategorias(movs: MovimientoAnalisis[], mes: string, n = 3): CambioCategoria[] {
  const suma = (m: string) => {
    const mapa = new Map<string, number>();
    for (const x of gastos(delMes(movs, m))) mapa.set(grupoDe(x), (mapa.get(grupoDe(x)) ?? 0) + monto(x));
    return mapa;
  };
  const a = suma(mes); const b = suma(desplazarMes(mes, -1));
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((nombre) => {
      const actual = a.get(nombre) ?? 0; const anterior = b.get(nombre) ?? 0;
      return { nombre, actual, anterior, diferencia: actual - anterior, variacion: variacion(actual, anterior) };
    })
    .filter((c) => c.diferencia !== 0)
    .sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia))
    .slice(0, n);
}

/**
 * Movimientos de gasto de una categoría en el mes, del más reciente al más antiguo. «Otras» trae los de las
 * categorías que no entraron en el gráfico (usar el mismo `maximo` que en gastosPorCategoria).
 */
export function gastosDeCategoria(movs: MovimientoAnalisis[], mes: string, nombre: string, maximo = 8): MovimientoAnalisis[] {
  const cola = nombre === "Otras" ? null : nombre;
  const principales = new Set(gastosPorCategoria(movs, mes, maximo).map((c) => c.nombre));
  return gastos(delMes(movs, mes))
    .filter((m) => (cola ? grupoDe(m) === cola : !principales.has(grupoDe(m))))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || monto(b) - monto(a));
}
