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

// ============================================================
// Módulo Agenda / Programador de Impuestos (migración 0002)
// ============================================================

export type TipoPersona = "natural" | "juridica";
export type FrecuenciaObligacion =
  | "mensual"
  | "bimestral"
  | "trimestral"
  | "cuatrimestral"
  | "semestral"
  | "anual"
  | "unica";
export type PrioridadTarea = "baja" | "media" | "alta" | "urgente";
export type EstadoTarea = "pendiente" | "en_proceso" | "en_revision" | "entregada" | "no_aplica";

export interface Cliente {
  id: string;
  owner_id: string;
  razon_social: string;
  nit: string | null;
  ultimo_digito_nit: number | null;
  tipo_persona: TipoPersona;
  regimen: string | null;
  responsabilidades: string[];
  notas: string | null;
  created_at: string;
}

export interface ObligacionDian {
  id: string;
  codigo: string;
  nombre: string;
  entidad: string;
  frecuencia: FrecuenciaObligacion;
  descripcion: string | null;
  activo: boolean;
}

export interface ObligacionVencimiento {
  id: string;
  obligacion_id: string;
  year: number;
  periodo: number | null;
  ultimo_digito: number;
  fecha_vencimiento: string;
}

export interface Tarea {
  id: string;
  owner_id: string;
  cliente_id: string | null;
  obligacion_id: string | null;
  titulo: string;
  descripcion: string | null;
  periodo_year: number | null;
  periodo_numero: number | null;
  fecha_vencimiento: string | null;
  fecha_entrega_interna: string | null;
  prioridad: PrioridadTarea;
  estado: EstadoTarea;
  notas: string | null;
  completada_at: string | null;
  created_at: string;
  updated_at: string;
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
      clientes: {
        Row: Cliente;
        Insert: Partial<Cliente> & { owner_id: string; razon_social: string };
        Update: Partial<Cliente>;
        Relationships: [];
      };
      obligaciones_dian: {
        Row: ObligacionDian;
        Insert: Partial<ObligacionDian> & { codigo: string; nombre: string; frecuencia: FrecuenciaObligacion };
        Update: Partial<ObligacionDian>;
        Relationships: [];
      };
      obligaciones_vencimientos: {
        Row: ObligacionVencimiento;
        Insert: Partial<ObligacionVencimiento> & {
          obligacion_id: string;
          year: number;
          ultimo_digito: number;
          fecha_vencimiento: string;
        };
        Update: Partial<ObligacionVencimiento>;
        Relationships: [];
      };
      tareas: {
        Row: Tarea;
        Insert: Partial<Tarea> & { owner_id: string; titulo: string };
        Update: Partial<Tarea>;
        Relationships: [];
      };
    };
  };
}
