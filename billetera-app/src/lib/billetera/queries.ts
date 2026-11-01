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

// Cast acotado para operaciones de escritura. El schema manual del Asesor
// Tributario usa `Partial<T>` en Insert/Update, lo cual no extiende el
// GenericSchema estricto de supabase-js — eso tira `.insert()/.update()`
// tipados a `never`. Para selects usamos el cliente tipado; para mutaciones,
// este cast local acotado (mismo patrón que DataTableEditor). Al regenerar los
// tipos del schema completo con `supabase gen types typescript --linked`, el
// cast se podrá quitar.
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
  /** Recibo del pago (PDF o foto). No es columna: se sube a Storage después de crear el movimiento. */
  recibo?: File | null;
}

export async function crearMovimiento(
  userId: string,
  input: CrearMovimientoInput,
): Promise<Movimiento & { reciboError?: string }> {
  const { recibo, ...fila } = input;
  const { data, error } = await db
    .from("movimientos")
    .insert({ ...fila, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  const mov = data as Movimiento & { reciboError?: string };
  if (recibo) {
    // Si el recibo falla, el movimiento ya quedó: no se lanza el error (el formulario seguiría abierto y un segundo
    // «Registrar» lo duplicaría); se devuelve para avisar y adjuntarlo después con el clip.
    try {
      mov.recibo_path = await subirRecibo(userId, mov.id, recibo, null);
    } catch (e) {
      mov.reciboError = e instanceof Error ? e.message : String(e);
    }
  }
  return mov;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const { data, error } = await db.from("movimientos").delete().eq("id", id).select("recibo_path");
  if (error) throw error;
  const ruta = (data as { recibo_path: string | null }[] | null)?.[0]?.recibo_path;
  if (ruta) await supabase.storage.from(BUCKET_RECIBOS).remove([ruta]);   // si falla, queda un archivo huérfano privado
}

// Recibos (bucket privado «recibos», carpeta <user_id>/<movimiento_id>/)

export const BUCKET_RECIBOS = "recibos";
export const TIPOS_RECIBO = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const TAMANO_MAXIMO_RECIBO = 10 * 1024 * 1024;

/** Mensaje si el archivo no sirve como recibo; null si está bien. */
export function validarRecibo(archivo: File): string | null {
  if (!TIPOS_RECIBO.includes(archivo.type)) return "El recibo debe ser un PDF o una foto (JPG, PNG o WebP).";
  if (archivo.size > TAMANO_MAXIMO_RECIBO) return "El recibo pesa más de 10 MB.";
  return null;
}

const nombreSeguro = (nombre: string) =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "recibo";

/** Sube (o reemplaza) el recibo de un movimiento y guarda su ruta. Devuelve la ruta nueva. */
export async function subirRecibo(userId: string, movimientoId: string, archivo: File, rutaAnterior: string | null): Promise<string> {
  const problema = validarRecibo(archivo);
  if (problema) throw new Error(problema);
  const ruta = `${userId}/${movimientoId}/${Date.now()}-${nombreSeguro(archivo.name)}`;
  const { error } = await supabase.storage.from(BUCKET_RECIBOS).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw error;
  const { error: errorFila } = await db.from("movimientos").update({ recibo_path: ruta }).eq("id", movimientoId);
  if (errorFila) {
    await supabase.storage.from(BUCKET_RECIBOS).remove([ruta]);
    throw errorFila;
  }
  if (rutaAnterior) await supabase.storage.from(BUCKET_RECIBOS).remove([rutaAnterior]);
  return ruta;
}

/** Enlace temporal (5 minutos) para abrir un recibo privado. */
export async function enlaceRecibo(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_RECIBOS).createSignedUrl(ruta, 300);
  if (error || !data) throw error ?? new Error("No se pudo abrir el recibo.");
  return data.signedUrl;
}

/** Quita el recibo de un movimiento (borra el archivo y la ruta). */
export async function quitarRecibo(movimientoId: string, ruta: string): Promise<void> {
  const { error } = await db.from("movimientos").update({ recibo_path: null }).eq("id", movimientoId);
  if (error) throw error;
  await supabase.storage.from(BUCKET_RECIBOS).remove([ruta]);
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
