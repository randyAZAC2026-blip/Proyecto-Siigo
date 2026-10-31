import { z } from "zod";

export const miembroSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1, "El nombre es obligatorio").max(80),
  cuotaMensual: z.number().nonnegative(),
  activo: z.boolean(),
  notas: z.string().max(300).optional(),
  creadoEn: z.string().datetime(),
});

export type Miembro = z.infer<typeof miembroSchema>;

export const pagoSchema = z.object({
  id: z.string().uuid(),
  miembroId: z.string().uuid(),
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
  monto: z.number().nonnegative(),
  fechaPago: z.string().date(),
  notas: z.string().max(300).optional(),
});

export type Pago = z.infer<typeof pagoSchema>;

export const natilleraStateSchema = z.object({
  version: z.literal(1),
  nombre: z.string().max(80),
  cuotaBase: z.number().nonnegative(),
  anioActivo: z.number().int().min(2000).max(2100),
  miembros: z.array(miembroSchema),
  pagos: z.array(pagoSchema),
});

export type NatilleraState = z.infer<typeof natilleraStateSchema>;

export const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export const MESES_LARGOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;
