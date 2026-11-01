import type { CategoriaTipo } from "@/lib/supabase/database.types";

// Categorías con las que se siembra la cuenta de un usuario la primera vez que
// entra a Billetera. El usuario las puede renombrar o borrar libremente.
export const CATEGORIAS_POR_DEFECTO: { nombre: string; tipo: CategoriaTipo; icono: string }[] = [
  // Ingresos
  { nombre: "Salario", tipo: "ingreso", icono: "briefcase" },
  { nombre: "Honorarios", tipo: "ingreso", icono: "file-text" },
  { nombre: "Ventas", tipo: "ingreso", icono: "shopping-bag" },
  { nombre: "Préstamo recibido", tipo: "ingreso", icono: "hand-coins" },
  { nombre: "Otros ingresos", tipo: "ingreso", icono: "plus-circle" },
  // Egresos
  { nombre: "Alimentación", tipo: "egreso", icono: "utensils" },
  { nombre: "Transporte", tipo: "egreso", icono: "car" },
  { nombre: "Vivienda", tipo: "egreso", icono: "home" },
  { nombre: "Servicios públicos", tipo: "egreso", icono: "zap" },
  { nombre: "Salud", tipo: "egreso", icono: "heart-pulse" },
  { nombre: "Educación", tipo: "egreso", icono: "graduation-cap" },
  { nombre: "Entretenimiento", tipo: "egreso", icono: "clapperboard" },
  { nombre: "Compras", tipo: "egreso", icono: "shopping-cart" },
  { nombre: "Otros egresos", tipo: "egreso", icono: "minus-circle" },
];
