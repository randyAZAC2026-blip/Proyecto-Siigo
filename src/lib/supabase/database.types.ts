// Tipos del schema de Supabase.
// Los Row/Insert/Update de BILLETERA son los generados por
// `supabase gen types typescript --linked` (proyecto `tuzdmlehcgxoiffixccv`).
// Para los tipos del ASESOR TRIBUTARIO (migración 0001) se conservan los types
// manuales originales. Para regenerar: pedir al MCP de Supabase
// `generate_typescript_types` y volver a pegar.

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

// Billetera — tipos de dominio con uniones estrictas donde el DB solo tiene
// `text` con CHECK. En las queries hacemos `as Cuenta` para estrechar el tipo.

export type CuentaTipo = "efectivo" | "banco" | "billetera_digital" | "otro";
export type CategoriaTipo = "ingreso" | "egreso";
export type MovimientoTipo = "ingreso" | "egreso" | "transferencia";
export type FrecuenciaIngreso = "fijo" | "variable";

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
  fuente_ingreso_id: string | null;
  created_at: string;
}

export interface FuenteIngreso {
  id: string;
  user_id: string;
  nombre: string;
  frecuencia: FrecuenciaIngreso;
  monto_esperado_mensual: number | null;
  activa: boolean;
  nota: string | null;
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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; role?: UserRole; full_name?: string | null; created_at?: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      uvt_rates: {
        Row: UvtRate;
        Insert: {
          year: number;
          value_cop: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<UvtRate>;
        Relationships: [];
      };
      retefte_concepts: {
        Row: RetefteConcept;
        Insert: {
          id?: string;
          rubro?: string | null;
          concepto: string;
          uvt_base?: number;
          valor_base_cop?: number;
          tarifa_persona_juridica?: number | null;
          tarifa_natural_declarante?: number | null;
          tarifa_natural_no_declarante?: number | null;
          year: number;
          created_at?: string;
        };
        Update: Partial<RetefteConcept>;
        Relationships: [];
      };
      iva_items: {
        Row: IvaItem;
        Insert: {
          id?: string;
          codigo_dane?: string | null;
          descripcion: string;
          categoria: string;
          tarifa: number;
          tipo: IvaTipo;
          fuente: string;
        };
        Update: Partial<IvaItem>;
        Relationships: [];
      };
      ica_medellin_activities: {
        Row: IcaMedellinActivity;
        Insert: {
          id?: string;
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
        Insert: { code: string; label: string; description?: string | null };
        Update: Partial<TaxRegime>;
        Relationships: [];
      };
      categorias: {
        Row: {
          created_at: string;
          icono: string | null;
          id: string;
          nombre: string;
          tipo: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          icono?: string | null;
          id?: string;
          nombre: string;
          tipo: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          icono?: string | null;
          id?: string;
          nombre?: string;
          tipo?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      cuentas: {
        Row: {
          archivada: boolean;
          color: string | null;
          created_at: string;
          fecha_saldo_inicial: string;
          id: string;
          nombre: string;
          saldo_inicial: number;
          tipo: string;
          user_id: string;
        };
        Insert: {
          archivada?: boolean;
          color?: string | null;
          created_at?: string;
          fecha_saldo_inicial?: string;
          id?: string;
          nombre: string;
          saldo_inicial?: number;
          tipo: string;
          user_id: string;
        };
        Update: {
          archivada?: boolean;
          color?: string | null;
          created_at?: string;
          fecha_saldo_inicial?: string;
          id?: string;
          nombre?: string;
          saldo_inicial?: number;
          tipo?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      cuentas_por_cobrar: {
        Row: {
          concepto: string;
          created_at: string;
          deudor: string;
          fecha_registro: string;
          fecha_vencimiento: string | null;
          id: string;
          monto_cobrado: number;
          monto_total: number;
          nota: string | null;
          user_id: string;
        };
        Insert: {
          concepto: string;
          created_at?: string;
          deudor: string;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          id?: string;
          monto_cobrado?: number;
          monto_total: number;
          nota?: string | null;
          user_id: string;
        };
        Update: {
          concepto?: string;
          created_at?: string;
          deudor?: string;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          id?: string;
          monto_cobrado?: number;
          monto_total?: number;
          nota?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      cuentas_por_pagar: {
        Row: {
          acreedor: string;
          concepto: string;
          created_at: string;
          fecha_registro: string;
          fecha_vencimiento: string | null;
          id: string;
          monto_pagado: number;
          monto_total: number;
          nota: string | null;
          user_id: string;
        };
        Insert: {
          acreedor: string;
          concepto: string;
          created_at?: string;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          id?: string;
          monto_pagado?: number;
          monto_total: number;
          nota?: string | null;
          user_id: string;
        };
        Update: {
          acreedor?: string;
          concepto?: string;
          created_at?: string;
          fecha_registro?: string;
          fecha_vencimiento?: string | null;
          id?: string;
          monto_pagado?: number;
          monto_total?: number;
          nota?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      movimientos: {
        Row: {
          categoria_id: string | null;
          contraparte: string | null;
          created_at: string;
          cuenta_destino_id: string | null;
          cuenta_id: string;
          cxc_id: string | null;
          cxp_id: string | null;
          descripcion: string | null;
          fecha: string;
          fuente_ingreso_id: string | null;
          id: string;
          monto: number;
          tipo: string;
          user_id: string;
        };
        Insert: {
          categoria_id?: string | null;
          contraparte?: string | null;
          created_at?: string;
          cuenta_destino_id?: string | null;
          cuenta_id: string;
          cxc_id?: string | null;
          cxp_id?: string | null;
          descripcion?: string | null;
          fecha?: string;
          fuente_ingreso_id?: string | null;
          id?: string;
          monto: number;
          tipo: string;
          user_id: string;
        };
        Update: {
          categoria_id?: string | null;
          contraparte?: string | null;
          created_at?: string;
          cuenta_destino_id?: string | null;
          cuenta_id?: string;
          cxc_id?: string | null;
          cxp_id?: string | null;
          descripcion?: string | null;
          fecha?: string;
          fuente_ingreso_id?: string | null;
          id?: string;
          monto?: number;
          tipo?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      fuentes_ingreso: {
        Row: {
          activa: boolean;
          created_at: string;
          frecuencia: string;
          id: string;
          monto_esperado_mensual: number | null;
          nombre: string;
          nota: string | null;
          user_id: string;
        };
        Insert: {
          activa?: boolean;
          created_at?: string;
          frecuencia: string;
          id?: string;
          monto_esperado_mensual?: number | null;
          nombre: string;
          nota?: string | null;
          user_id: string;
        };
        Update: {
          activa?: boolean;
          created_at?: string;
          frecuencia?: string;
          id?: string;
          monto_esperado_mensual?: number | null;
          nombre?: string;
          nota?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      saldos_cuentas: {
        Row: {
          archivada: boolean | null;
          color: string | null;
          cuenta_id: string | null;
          nombre: string | null;
          saldo_actual: number | null;
          saldo_inicial: number | null;
          tipo: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
