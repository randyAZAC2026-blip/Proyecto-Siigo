// Tipos manuales del schema (supabase/migrations/0001_init.sql).
// Si el schema cambia, regenerar con: supabase gen types typescript --linked

export type UserRole = "user" | "superuser";
export type IvaTipo = "gravado" | "exento" | "excluido";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
}

export interface UvtRate {
  year: number;
  value_cop: number;
  updated_by: string | null;
  updated_at: string;
}

export interface RetefteConcept {
  id: string;
  rubro: string | null;
  concepto: string;
  uvt_base: number;
  valor_base_cop: number;
  tarifa_persona_juridica: number | null;
  tarifa_natural_declarante: number | null;
  tarifa_natural_no_declarante: number | null;
  year: number;
  created_at: string;
}

export interface IvaItem {
  id: string;
  codigo_dane: string | null;
  descripcion: string;
  categoria: string;
  tarifa: number;
  tipo: IvaTipo;
  fuente: string;
}

export interface IcaMedellinActivity {
  id: string;
  clase_ciiu: string;
  descripcion: string;
  grupo_ica: string;
  sector: string;
  tarifa_por_mil: number;
}

export interface TaxRegime {
  code: string;
  label: string;
  description: string | null;
}

// Billetera (migración 0002_billetera.sql)

export type CuentaTipo = "efectivo" | "banco" | "billetera_digital" | "otro";
export type CategoriaTipo = "ingreso" | "egreso";
export type MovimientoTipo = "ingreso" | "egreso" | "transferencia";

export interface Cuenta {
  id: string;
  user_id: string;
  nombre: string;
  tipo: CuentaTipo;
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  color: string | null;
  archivada: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  user_id: string;
  nombre: string;
  tipo: CategoriaTipo;
  icono: string | null;
  created_at: string;
}

export interface Movimiento {
  id: string;
  user_id: string;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  tipo: MovimientoTipo;
  monto: number;
  fecha: string;
  descripcion: string | null;
  categoria_id: string | null;
  contraparte: string | null;
  cxp_id: string | null;
  cxc_id: string | null;
  created_at: string;
}

export interface CuentaPorPagar {
  id: string;
  user_id: string;
  acreedor: string;
  concepto: string;
  monto_total: number;
  monto_pagado: number;
  fecha_registro: string;
  fecha_vencimiento: string | null;
  nota: string | null;
  created_at: string;
}

export interface CuentaPorCobrar {
  id: string;
  user_id: string;
  deudor: string;
  concepto: string;
  monto_total: number;
  monto_cobrado: number;
  fecha_registro: string;
  fecha_vencimiento: string | null;
  nota: string | null;
  created_at: string;
}

export interface SaldoCuenta {
  cuenta_id: string;
  user_id: string;
  nombre: string;
  tipo: CuentaTipo;
  color: string | null;
  archivada: boolean;
  saldo_inicial: number;
  saldo_actual: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile>; Relationships: [] };
      uvt_rates: { Row: UvtRate; Insert: Partial<UvtRate> & { year: number }; Update: Partial<UvtRate>; Relationships: [] };
      retefte_concepts: {
        Row: RetefteConcept;
        Insert: Partial<RetefteConcept> & { concepto: string; year: number };
        Update: Partial<RetefteConcept>;
        Relationships: [];
      };
      iva_items: {
        Row: IvaItem;
        Insert: Partial<IvaItem> & { descripcion: string; categoria: string; tarifa: number; tipo: IvaTipo; fuente: string };
        Update: Partial<IvaItem>;
        Relationships: [];
      };
      ica_medellin_activities: {
        Row: IcaMedellinActivity;
        Insert: Partial<IcaMedellinActivity> & {
          clase_ciiu: string;
          descripcion: string;
          grupo_ica: string;
          sector: string;
          tarifa_por_mil: number;
        };
        Update: Partial<IcaMedellinActivity>;
        Relationships: [];
      };
      tax_regimes: {
        Row: TaxRegime;
        Insert: Partial<TaxRegime> & { code: string; label: string };
        Update: Partial<TaxRegime>;
        Relationships: [];
      };
      cuentas: {
        Row: Cuenta;
        Insert: {
          id?: string;
          user_id: string;
          nombre: string;
          tipo: CuentaTipo;
          saldo_inicial?: number;
          fecha_saldo_inicial?: string;
          color?: string | null;
          archivada?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nombre?: string;
          tipo?: CuentaTipo;
          saldo_inicial?: number;
          fecha_saldo_inicial?: string;
          color?: string | null;
          archivada?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      categorias: {
        Row: Categoria;
        Insert: {
          id?: string;
          user_id: string;
          nombre: string;
          tipo: CategoriaTipo;
          icono?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nombre?: string;
          tipo?: CategoriaTipo;
          icono?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      movimientos: {
        Row: Movimiento;
        Insert: {
          id?: string;
          user_id: string;
          cuenta_id: string;
          cuenta_destino_id?: string | null;
          tipo: MovimientoTipo;
          monto: number;
          fecha?: string;
          descripcion?: string | null;
          categoria_id?: string | null;
          contraparte?: string | null;
          cxp_id?: string | null;
          cxc_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cuenta_id?: string;
          cuenta_destino_id?: string | null;
          tipo?: MovimientoTipo;
          monto?: number;
          fecha?: string;
          descripcion?: string | null;
          categoria_id?: string | null;
          contraparte?: string | null;
          cxp_id?: string | null;
          cxc_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cuentas_por_pagar: {
        Row: CuentaPorPagar;
        Insert: {
          id?: string;
          user_id: string;
          acreedor: string;
          concepto: string;
          monto_total: number;
          monto_pagado?: number;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          nota?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          acreedor?: string;
          concepto?: string;
          monto_total?: number;
          monto_pagado?: number;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          nota?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cuentas_por_cobrar: {
        Row: CuentaPorCobrar;
        Insert: {
          id?: string;
          user_id: string;
          deudor: string;
          concepto: string;
          monto_total: number;
          monto_cobrado?: number;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          nota?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          deudor?: string;
          concepto?: string;
          monto_total?: number;
          monto_cobrado?: number;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          nota?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      saldos_cuentas: { Row: SaldoCuenta; Relationships: [] };
    };
    Functions: Record<string, { Args: Record<string, never>; Returns: unknown }>;
  };
}
