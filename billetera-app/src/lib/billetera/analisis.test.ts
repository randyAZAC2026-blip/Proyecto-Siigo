import { describe, expect, test } from "vitest";
import {
  cambiosCategorias, desplazarMes, diasDelMes, etiquetaMes, gastoPorDiaSemana, gastosDeCategoria, gastosPorCategoria,
  grupoDe, mayoresGastos, proyeccionMes, resumenMes, ritmoDelMes, serieMensual, variacion, type MovimientoAnalisis,
} from "./analisis";

let n = 0;
const mov = (tipo: MovimientoAnalisis["tipo"], monto: number, fecha: string, categoria?: string, extra: Partial<MovimientoAnalisis> = {}): MovimientoAnalisis => ({
  id: `m${++n}`, tipo, monto, fecha, cuenta_id: "c1", categoria_id: categoria ? categoria : null,
  categoria: categoria ? { nombre: categoria } : null, ...extra,
});

const movs = [
  mov("ingreso", 5000000, "2026-10-01", "Salario"),
  mov("egreso", 1200000, "2026-10-02", "Vivienda"),
  mov("egreso", 300000, "2026-10-05", "Alimentación"),
  mov("egreso", 250000, "2026-10-12", "Alimentación"),
  mov("egreso", 80000, "2026-10-12", "Transporte"),
  mov("egreso", 400000, "2026-10-20", undefined, { cxp_id: "d1" }),
  mov("transferencia", 999999, "2026-10-15"),
  mov("ingreso", 4800000, "2026-09-01", "Salario"),
  mov("egreso", 1200000, "2026-09-02", "Vivienda"),
  mov("egreso", 200000, "2026-09-10", "Alimentación"),
  mov("egreso", "150000" as unknown as number, "2026-09-11", "Entretenimiento"),
];

describe("fechas", () => {
  test("meses, días y etiquetas", () => {
    expect(desplazarMes("2026-01", -1)).toBe("2025-12");
    expect(desplazarMes("2026-11", 3)).toBe("2027-02");
    expect(diasDelMes("2026-02")).toBe(28);
    expect(diasDelMes("2028-02")).toBe(29);
    expect(etiquetaMes("2026-10")).toBe("octubre 2026");
    expect(etiquetaMes("2026-10", true)).toBe("oct");
  });
});

describe("resumen y categorías", () => {
  test("el resumen ignora las transferencias y acepta montos como texto", () => {
    expect(resumenMes(movs, "2026-10")).toEqual({ gastos: 2230000, ingresos: 5000000, balance: 2770000, nGastos: 5 });
    expect(resumenMes(movs, "2026-09").gastos).toBe(1550000);
    expect(variacion(2230000, 1550000)).toBeCloseTo(43.87, 1);
    expect(variacion(10, 0)).toBeNull();
  });

  test("grupo: la categoría, o pago de deudas, cobros o sin categoría", () => {
    expect(grupoDe(movs[1])).toBe("Vivienda");
    expect(grupoDe(movs[5])).toBe("Pago de deudas");
    expect(grupoDe(mov("ingreso", 1, "2026-10-01", undefined, { cxc_id: "x" }))).toBe("Cobros");
    expect(grupoDe(mov("egreso", 1, "2026-10-01"))).toBe("Sin categoría");
  });

  test("gastos por categoría de mayor a menor con su porcentaje", () => {
    const c = gastosPorCategoria(movs, "2026-10");
    expect(c.map((x) => x.nombre)).toEqual(["Vivienda", "Alimentación", "Pago de deudas", "Transporte"]);
    expect(c[1]).toMatchObject({ total: 550000, n: 2 });
    expect(c.reduce((s, x) => s + x.porcentaje, 0)).toBeCloseTo(100);
  });

  test("pasadas las máximas, el resto va en Otras y se puede abrir", () => {
    const c = gastosPorCategoria(movs, "2026-10", 3);
    expect(c.map((x) => x.nombre)).toEqual(["Vivienda", "Alimentación", "Otras"]);
    expect(c[2]).toMatchObject({ total: 480000, n: 2 });
    expect(gastosDeCategoria(movs, "2026-10", "Otras", 3).map((m) => grupoDe(m)).sort()).toEqual(["Pago de deudas", "Transporte"]);
    expect(gastosDeCategoria(movs, "2026-10", "Alimentación").map((m) => m.fecha)).toEqual(["2026-10-12", "2026-10-05"]);
  });
});

describe("ritmo, proyección y tendencia", () => {
  test("acumulado diario contra el mes anterior, cortado en hoy", () => {
    const r = ritmoDelMes(movs, "2026-10", "2026-10-15");
    expect(r).toHaveLength(31);
    expect(r[1]).toEqual({ dia: 2, actual: 1200000, anterior: 1200000 });
    expect(r[11]).toMatchObject({ dia: 12, actual: 1830000 });
    expect(r[14].actual).toBe(1830000);
    expect(r[15].actual).toBeNull();                   // día 16: futuro
    expect(r[30].anterior).toBeNull();                 // septiembre tiene 30 días
    expect(r[29].anterior).toBe(1550000);
  });

  test("proyección a fin de mes solo en el mes en curso", () => {
    const p = proyeccionMes(movs, "2026-10", "2026-10-15");
    expect(p.diasTranscurridos).toBe(15);
    expect(p.promedioDiario).toBeCloseTo(2230000 / 15);
    expect(p.proyeccion).toBeCloseTo((2230000 / 15) * 31);
    expect(proyeccionMes(movs, "2026-09", "2026-10-15")).toMatchObject({ diasTranscurridos: 30, proyeccion: null });
    expect(proyeccionMes(movs, "2026-10", "2026-10-31").proyeccion).toBeNull();   // último día: el total ya es el cierre
  });

  test("serie de seis meses", () => {
    const s = serieMensual(movs, "2026-10");
    expect(s.map((x) => x.etiqueta)).toEqual(["may", "jun", "jul", "ago", "sep", "oct"]);
    expect(s.at(-1)).toMatchObject({ ingresos: 5000000, gastos: 2230000 });
    expect(s[0]).toMatchObject({ ingresos: 0, gastos: 0 });
  });
});

describe("comportamiento", () => {
  test("promedio por día de la semana", () => {
    const d = gastoPorDiaSemana(movs, "2026-10-01", "2026-10-31");   // 1 de octubre de 2026: jueves
    expect(d.map((x) => x.dia)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(d[0].total).toBe(630000);                  // lunes 5 y 12
    expect(d[0].promedio).toBeCloseTo(630000 / 4);    // octubre 2026 tiene 4 lunes
    expect(d[4].total).toBe(1200000);                 // viernes 2
  });

  test("los gastos más grandes y lo que más cambió", () => {
    expect(mayoresGastos(movs, "2026-10", 2).map((m) => Number(m.monto))).toEqual([1200000, 400000]);
    const c = cambiosCategorias(movs, "2026-10");
    expect(c[0]).toMatchObject({ nombre: "Pago de deudas", diferencia: 400000, variacion: null });
    expect(c[1]).toMatchObject({ nombre: "Alimentación", actual: 550000, anterior: 200000, diferencia: 350000 });
    expect(c[1].variacion).toBeCloseTo(175);
    expect(c[2]).toMatchObject({ nombre: "Entretenimiento", diferencia: -150000 });
  });
});
