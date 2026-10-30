import { supabase } from "@/lib/supabase/client";
import type {
  Categoria,
  CategoriaTipo,
  Cuenta,
  CuentaPorCobrar,
  CuentaPorPagar,
  CuentaTipo,
  Movimiento,
  MovimientoTipo,
  SaldoCuenta,
} from "@/lib/supabase/database.types";
import { CATEGORIAS_POR_DEFECTO } from "@/lib/billetera/defaults";

// Cast acotado para operaciones de escritura. Mismo patrón que DataTableEditor:
// el `Database` manual no extiende el `GenericSchema` estricto de supabase-js
// (los `Partial<T>` del schema original no extienden `Record<string, unknown>`),
// así que `.insert()/.update()` tipados caen a `never`. Para selects usamos el
// cliente tipado; para mutaciones, este cast. Si en el futuro se regeneran los
// types con `supabase gen types typescript --linked`, este cast se puede quitar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

export interface MovimientoConRelaciones extends Movimiento {
  cuenta: Pick<Cuenta, "id" | "nombre" | "tipo"> | null;
  cuenta_destino: Pick<Cuenta, "id" | "nombre" | "tipo"> | null;
  categoria: Pick<Categoria, "id" | "nombre" | "tipo" | "icono"> | null;
}

// Cuentas

export async function listCuentas(userId: string): Promise<Cuenta[]> {
  const { data, error } = await supabase
    .from("cuentas")
    .select("*")
    .eq("user_id", userId)
    .order("archivada", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listSaldos(userId: string): Promise<SaldoCuenta[]> {
  const { data, error } = await supabase
    .from("saldos_cuentas")
    .select("*")
    .eq("user_id", userId)
    .order("archivada", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SaldoCuenta[];
}

export interface CrearCuentaInput {
  nombre: string;
  tipo: CuentaTipo;
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  color?: string | null;
}

export async function crearCuenta(userId: string, input: CrearCuentaInput): Promise<Cuenta> {
  const { data, error } = await db
    .from("cuentas")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Cuenta;
}

export async function actualizarCuenta(id: string, patch: Partial<Cuenta>): Promise<void> {
  const { error } = await db.from("cuentas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archivarCuenta(id: string, archivada: boolean): Promise<void> {
  await actualizarCuenta(id, { archivada });
}

export async function eliminarCuenta(id: string): Promise<void> {
  const { error } = await supabase.from("cuentas").delete().eq("id", id);
  if (error) throw error;
}

// Categorías

export async function listCategorias(userId: string): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .eq("user_id", userId)
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sembrarCategoriasPorDefecto(userId: string): Promise<void> {
  const existentes = await listCategorias(userId);
  if (existentes.length > 0) return;
  const rows = CATEGORIAS_POR_DEFECTO.map((c) => ({ ...c, user_id: userId }));
  const { error } = await db.from("categorias").insert(rows);
  if (error) throw error;
}

export async function crearCategoria(
  userId: string,
  input: { nombre: string; tipo: CategoriaTipo; icono?: string | null },
): Promise<Categoria> {
  const { data, error } = await db
    .from("categorias")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Categoria;
}

export async function actualizarCategoria(id: string, patch: Partial<Categoria>): Promise<void> {
  const { error } = await db.from("categorias").update(patch).eq("id", id);
  if (error) throw error;
}

export async function eliminarCategoria(id: string): Promise<void> {
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) throw error;
}

// Movimientos

export interface ListMovimientosOpts {
  cuentaId?: string;
  tipo?: MovimientoTipo;
  categoriaId?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}

export async function listMovimientos(
  userId: string,
  opts: ListMovimientosOpts = {},
): Promise<MovimientoConRelaciones[]> {
  let q = supabase
    .from("movimientos")
    .select(
      `
      *,
      cuenta:cuentas!movimientos_cuenta_id_fkey (id, nombre, tipo),
      cuenta_destino:cuentas!movimientos_cuenta_destino_id_fkey (id, nombre, tipo),
      categoria:categorias (id, nombre, tipo, icono)
    `,
    )
    .eq("user_id", userId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.cuentaId) q = q.or(`cuenta_id.eq.${opts.cuentaId},cuenta_destino_id.eq.${opts.cuentaId}`);
  if (opts.tipo) q = q.eq("tipo", opts.tipo);
  if (opts.categoriaId) q = q.eq("categoria_id", opts.categoriaId);
  if (opts.desde) q = q.gte("fecha", opts.desde);
  if (opts.hasta) q = q.lte("fecha", opts.hasta);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as MovimientoConRelaciones[];
}

export interface CrearMovimientoInput {
  cuenta_id: string;
  cuenta_destino_id?: string | null;
  tipo: MovimientoTipo;
  monto: number;
  fecha: string;
  descripcion?: string | null;
  categoria_id?: string | null;
  contraparte?: string | null;
  cxp_id?: string | null;
  cxc_id?: string | null;
}

export async function crearMovimiento(
  userId: string,
  input: CrearMovimientoInput,
): Promise<Movimiento> {
  const { data, error } = await db
    .from("movimientos")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Movimiento;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const { error } = await supabase.from("movimientos").delete().eq("id", id);
  if (error) throw error;
}

// Cuentas por pagar / por cobrar

export async function listCxP(userId: string): Promise<CuentaPorPagar[]> {
  const { data, error } = await supabase
    .from("cuentas_por_pagar")
    .select("*")
    .eq("user_id", userId)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("fecha_registro", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listCxC(userId: string): Promise<CuentaPorCobrar[]> {
  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("*")
    .eq("user_id", userId)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("fecha_registro", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CrearCxPInput {
  acreedor: string;
  concepto: string;
  monto_total: number;
  fecha_registro: string;
  fecha_vencimiento?: string | null;
  nota?: string | null;
}

export async function crearCxP(userId: string, input: CrearCxPInput): Promise<CuentaPorPagar> {
  const { data, error } = await db
    .from("cuentas_por_pagar")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as CuentaPorPagar;
}

export interface CrearCxCInput {
  deudor: string;
  concepto: string;
  monto_total: number;
  fecha_registro: string;
  fecha_vencimiento?: string | null;
  nota?: string | null;
}

export async function crearCxC(userId: string, input: CrearCxCInput): Promise<CuentaPorCobrar> {
  const { data, error } = await db
    .from("cuentas_por_cobrar")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as CuentaPorCobrar;
}

export async function eliminarCxP(id: string): Promise<void> {
  const { error } = await supabase.from("cuentas_por_pagar").delete().eq("id", id);
  if (error) throw error;
}

export async function eliminarCxC(id: string): Promise<void> {
  const { error } = await supabase.from("cuentas_por_cobrar").delete().eq("id", id);
  if (error) throw error;
}
