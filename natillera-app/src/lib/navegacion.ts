import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  LayoutGrid,
  FileText,
  HandCoins,
  HardDrive,
  Home,
  Landmark,
  PiggyBank,
  Receipt,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

export type Vista =
  | "dashboard"
  | "informes"
  | "socios"
  | "estado"
  | "matriz"
  | "control"
  | "mora-ahorros"
  | "prestamos"
  | "mora-intereses"
  | "liquidacion"
  | "simulador"
  | "banco"
  | "actividades"
  | "local"
  // Vistas del socio (solo lo suyo)
  | "mi-inicio"
  | "mis-ahorros"
  | "mis-prestamos"
  | "mi-liquidacion";

export interface Modulo {
  key: Vista;
  label: string;
  /** Nombre corto para la barra inferior del celular. */
  corto?: string;
  Icon: typeof Home;
}

export interface Grupo {
  titulo: string;
  items: Modulo[];
}

// Operación = donde se registra y se concilia. Informes = solo lectura,
// todos con el mismo formato (InformeLayout): totales, Excel e impresión.
export const GRUPOS_ADMIN: Grupo[] = [
  {
    titulo: "Inicio",
    items: [{ key: "dashboard", label: "Panel", corto: "Inicio", Icon: Home }],
  },
  {
    titulo: "Operación",
    items: [
      { key: "banco", label: "Banco", Icon: Landmark },
      { key: "control", label: "Control de pagos", Icon: CheckCircle2 },
      { key: "prestamos", label: "Préstamos", Icon: HandCoins },
      { key: "actividades", label: "Actividades", corto: "Rifas", Icon: Sparkles },
    ],
  },
  {
    titulo: "Informes",
    items: [
      { key: "informes", label: "Todos los informes", corto: "Informes", Icon: LayoutGrid },
      { key: "socios", label: "Socios y aportes", Icon: Users },
      { key: "estado", label: "Estado de cuenta", Icon: FileText },
      { key: "matriz", label: "Matriz de ahorros", corto: "Ahorros", Icon: BarChart3 },
      { key: "mora-ahorros", label: "Mora de ahorros", Icon: AlertTriangle },
      { key: "mora-intereses", label: "Mora de intereses", Icon: AlertTriangle },
      { key: "liquidacion", label: "Liquidación", Icon: Wallet },
      { key: "simulador", label: "Simulador de cierre", Icon: Calculator },
    ],
  },
  {
    titulo: "Otros",
    items: [{ key: "local", label: "Local (offline)", Icon: HardDrive }],
  },
];

export const GRUPOS_SOCIO: Grupo[] = [
  {
    titulo: "Mi natillera",
    items: [
      { key: "mi-inicio", label: "Inicio", Icon: Home },
      { key: "mis-ahorros", label: "Mis ahorros", corto: "Ahorros", Icon: PiggyBank },
      { key: "mis-prestamos", label: "Mis préstamos", corto: "Préstamos", Icon: HandCoins },
      { key: "mi-liquidacion", label: "Mi liquidación", corto: "Liquidación", Icon: Receipt },
    ],
  },
];

const todos = (grupos: Grupo[]) => grupos.flatMap((g) => g.items);
const buscar = (grupos: Grupo[], keys: Vista[]) =>
  keys.map((k) => todos(grupos).find((m) => m.key === k)!);

/** Pestañas fijas de la barra inferior; el resto del admin va en "Más". */
export const PESTANAS_ADMIN = buscar(GRUPOS_ADMIN, ["dashboard", "banco", "informes", "prestamos"]);
export const MAS_ADMIN = todos(GRUPOS_ADMIN).filter((m) => !PESTANAS_ADMIN.includes(m));
export const PESTANAS_SOCIO = todos(GRUPOS_SOCIO);
