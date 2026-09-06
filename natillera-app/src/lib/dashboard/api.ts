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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? " — " + text : ""}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? " — " + text : ""}`);
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
  ahorro: number;
  actividades: number;
  rifa_chance: number;
  intereses_pagados: number;
  total_aportes: number;
  deducc_prestamo: number;
  deducc_multas: number;
  neto_a_recibir: number;
}

export interface MatrizPrestamos {
  meses: { nombre: string; orden: number }[];
  socios: {
    socio_id: number;
    nombre: string;
    celdas: Record<string, { abono: number; intereses: number; total: number }>;
    totalAbono: number;
    totalIntereses: number;
    total: number;
  }[];
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

export interface Periodo {
  id: number;
  nombre: string;
  orden: number;
  fecha_corte_ahorro: string | null;
  fecha_corte_actividad: string | null;
  estado: "abierto" | "cerrado";
}

export interface Extracto {
  id: number;
  banco: "Bancolombia" | "Nequi";
  fecha: string | null;
  descripcion: string | null;
  monto: number;
  saldo_cuenta: number | null;
  detalle_origen: string | null;
  socio_id: number | null;
  socio_nombre: string | null;
  transaccion_id: number | null;
}

export interface ExtractosPage {
  total: number;
  limit: number;
  offset: number;
  filas: Extracto[];
}

export interface FiltrosExtracto {
  banco?: string;
  origen?: string;
  conciliado?: "true" | "false";
  desde?: string;
  hasta?: string;
  q?: string;
  socio_id?: number;
  limit?: number;
  offset?: number;
}

export interface Transaccion {
  id: number;
  socio_id: number;
  socio: string;
  concepto: string;
  tipo: "ingreso" | "egreso";
  valor: number;
  fecha_pago: string | null;
  periodo: string | null;
  origen: "excel" | "manual";
}

export interface NuevaTransaccion {
  socio_id: number;
  concepto: string;
  valor: number;
  fecha_pago?: string;
  periodo_id?: number | null;
  notas?: string;
  extracto_id?: number | null;
}

export const api = {
  resumen: () => get<Resumen>("/api/resumen"),
  socios: () => get<Socio[]>("/api/socios"),
  socioById: (id: number) => get<HistorialSocio>(`/api/socios/${id}`),
  matrizAhorro: () => get<Matriz>("/api/matriz-ahorro"),
  matrizActividades: () => get<Matriz>("/api/matriz-actividades"),
  matrizPrestamos: () => get<MatrizPrestamos>("/api/matriz-prestamos"),
  liquidacion: () => get<Liquidacion[]>("/api/liquidacion"),
  bancos: () => get<Banco[]>("/api/bancos"),
  ahorrosPorPeriodo: () => get<PeriodoResumen[]>("/api/ahorros-por-periodo"),
  deudores: () => get<Deudor[]>("/api/deudores"),
  morosos: (dias = 60) => get<Moroso[]>(`/api/morosos?dias=${dias}`),
  health: () => get<{ ok: boolean; db: string }>("/api/health"),

  periodos: () => get<Periodo[]>("/api/periodos"),
  extractos: (filtros: FiltrosExtracto = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const query = qs.toString();
    return get<ExtractosPage>(`/api/extractos${query ? "?" + query : ""}`);
  },
  vincularExtracto: (id: number, transaccion_id: number | null) =>
    post<{ ok: true }>(`/api/extractos/${id}/vincular`, { transaccion_id }),
  marcarOrigenExtracto: (id: number, detalle_origen: string | null) =>
    post<{ ok: true }>(`/api/extractos/${id}/origen`, { detalle_origen }),
  crearTransaccion: (t: NuevaTransaccion) =>
    post<{ id: number; socio_id: number; concepto: string; tipo: string; valor: number }>(
      "/api/transacciones",
      t,
    ),
  eliminarTransaccion: (id: number) => del<{ ok: true }>(`/api/transacciones/${id}`),
  buscarTransacciones: (params: {
    socio_id?: number;
    concepto?: string;
    desde?: string;
    hasta?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const query = qs.toString();
    return get<Transaccion[]>(`/api/transacciones${query ? "?" + query : ""}`);
  },
};
