// Helpers tipados para insert/update/delete que evitan el problema de
// inferencia de `never` en supabase-js cuando el generic Database expone
// múltiples tablas. Punto único de cast documentado — igual filosofía que
// DataTableEditor.tsx pero para operaciones puntuales sobre tablas concretas.

import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type TableName = keyof Database["public"]["Tables"];
type InsertOf<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
type UpdateOf<T extends TableName> = Database["public"]["Tables"][T]["Update"];

// Cliente sin genérico, castado localmente para bypassear la unión que
// resuelve a `never`. Los tipos de entrada siguen siendo verificados
// gracias a InsertOf/UpdateOf en la firma pública.
const db = supabase as unknown as {
  from: (t: string) => {
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    update: (row: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
    delete: () => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function insertInto<T extends TableName>(table: T, row: InsertOf<T>): Promise<void> {
  const { error } = await db.from(table).insert(row);
  if (error) throw new Error(error.message);
}

export async function updateWhere<T extends TableName>(
  table: T,
  id: string | number,
  row: UpdateOf<T>,
  idCol: string = "id",
): Promise<void> {
  const { error } = await db.from(table).update(row).eq(idCol, id);
  if (error) throw new Error(error.message);
}

export async function deleteWhere<T extends TableName>(
  table: T,
  id: string | number,
  idCol: string = "id",
): Promise<void> {
  const { error } = await db.from(table).delete().eq(idCol, id);
  if (error) throw new Error(error.message);
}
