// Cliente HTTP tipado para la API de natillera-backend.

const BASE = import.meta.env.VITE_NAT_API || "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? " — " + body : ""}`);
  }
  return res.json() as Promise<T>;
}

export interface Resumen {
  socios_activos: number;
  cuentas_admin: number;
  n_transacciones: number;
  n_bancos: number;
  ahorros: number;
  actividades: number;
  rifa: number;
  intereses: number;
  prestamos_desembolsados: number;
  abonos_prestamos: number;
  multas: number;
  deuda_pendiente: number;
  utilidad_ciclo: number;
  total_aportado: number;
}

export interface Socio {
  id: number;
  nombre: string;
  tipo: "persona" | "cuenta_admin";
  estado: "activo" | "inactivo";
  cuota_sostenimiento: number;
  ahorro: number;
  actividades: number;
  rifa_chance: number;
  intereses_pagados: number;
  abonado_a_prestamos: number;
  prestamos_recibidos: number;
  multas_pagadas: number;
  total_aportado: number;
  saldo_prestamos: number;
}

export interface Liquidacion {
  id: number;
  nombre: string;
  cuota_sostenimiento: number;
  ahorro_socio: number;
  proporcion: number;
  utilidad_estimada: number;
  neto_a_pagar_estimado: number;
}

export interface Matriz {
  meses: { nombre: string; orden: number }[];
  socios: {
    socio_id: number;
    nombre: string;
    total: number;
    celdas: Record<string, number>;
  }[];
}

export interface Banco {
  banco: string;
  n_movs: number;
  ingresos: number;
  egresos: number;
  ingresos_natillera: number;
}

export interface PeriodoResumen {
  id: number;
  nombre: string;
  orden: number;
  fecha_corte_ahorro: string | null;
  ahorro: number;
  n_pagos: number;
}

export interface Deudor {
  id: number;
  nombre: string;
  prestamo_id: number;
  monto_prestado: number;
  saldo: number;
  intereses_pagados: number;
  fecha_desembolso: string | null;
}

export interface Moroso {
  id: number;
  nombre: string;
  cuota_sostenimiento: number;
  ultimo_aporte: string | null;
}

export interface HistorialSocio {
  socio: Socio;
  historial: {
    id: number;
    fecha_pago: string | null;
    concepto: string;
    tipo: "ingreso" | "egreso";
    valor: number;
    periodo: string | null;
  }[];
}

export const api = {
  resumen: () => get<Resumen>("/api/resumen"),
  socios: () => get<Socio[]>("/api/socios"),
  socioById: (id: number) => get<HistorialSocio>(`/api/socios/${id}`),
  matrizAhorro: () => get<Matriz>("/api/matriz-ahorro"),
  matrizActividades: () => get<Matriz>("/api/matriz-actividades"),
  liquidacion: () => get<Liquidacion[]>("/api/liquidacion"),
  bancos: () => get<Banco[]>("/api/bancos"),
  ahorrosPorPeriodo: () => get<PeriodoResumen[]>("/api/ahorros-por-periodo"),
  deudores: () => get<Deudor[]>("/api/deudores"),
  morosos: (dias = 60) => get<Moroso[]>(`/api/morosos?dias=${dias}`),
  health: () => get<{ ok: boolean; db: string }>("/api/health"),
};
