import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileText,
  HandCoins,
  HardDrive,
  Home,
  Landmark,
  PiggyBank,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";

export type Vista =
  | "dashboard"
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

export const GRUPOS_ADMIN: Grupo[] = [
  {
    titulo: "Inicio",
    items: [
      { key: "dashboard", label: "Panel", corto: "Inicio", Icon: Home },
      { key: "banco", label: "Banco", Icon: Landmark },
    ],
  },
  {
    titulo: "Socios",
    items: [
      { key: "socios", label: "Socios y aportes", Icon: Users },
      { key: "estado", label: "Estado de cuenta", Icon: FileText },
    ],
  },
  {
    titulo: "Ahorros",
    items: [
      { key: "matriz", label: "Matriz de ahorros", corto: "Ahorros", Icon: BarChart3 },
      { key: "control", label: "Control de pagos", Icon: CheckCircle2 },
      { key: "mora-ahorros", label: "Mora ahorros", Icon: AlertTriangle },
    ],
  },
  {
    titulo: "Préstamos",
    items: [
      { key: "prestamos", label: "Préstamos", Icon: HandCoins },
      { key: "mora-intereses", label: "Mora intereses", Icon: AlertTriangle },
      { key: "liquidacion", label: "Liquidación", Icon: Wallet },
      { key: "simulador", label: "Simulador cierre", Icon: Wallet },
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
export const PESTANAS_ADMIN = buscar(GRUPOS_ADMIN, ["dashboard", "matriz", "prestamos", "banco"]);
export const MAS_ADMIN = todos(GRUPOS_ADMIN).filter((m) => !PESTANAS_ADMIN.includes(m));
export const PESTANAS_SOCIO = todos(GRUPOS_SOCIO);
