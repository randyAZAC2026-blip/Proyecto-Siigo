import { z } from "zod";

export const classificationRequestSchema = z.object({
  descripcion_actividad: z.string().min(5, "Describe con un poco más de detalle qué vendes o a qué te dedicas."),
  valor_servicio: z.number().positive("El valor debe ser mayor a 0."),
  ciudad: z.string().optional().default("Medellín"),
  tipo_persona: z.enum(["natural", "juridica"]).optional(),
  regimen_tributario: z.string().optional(),
  respuestas_aclaracion: z.record(z.string(), z.string()).optional(),
});

export type ClassificationRequest = z.infer<typeof classificationRequestSchema>;

const ivaResultSchema = z.object({
  aplica: z.boolean(),
  tarifa: z.number(),
  tipo: z.enum(["gravado", "exento", "excluido"]),
  justificacion: z.string(),
  monto_cop: z.number(),
});

const retefteResultSchema = z.object({
  aplica: z.boolean(),
  concepto: z.string(),
  tarifa: z.number(),
  base_minima_cop: z.number(),
  monto_cop: z.number(),
  justificacion: z.string(),
});

const icaResultSchema = z.object({
  aplica: z.boolean(),
  clase_ciiu: z.string(),
  tarifa_por_mil: z.number(),
  monto_cop: z.number(),
  justificacion: z.string(),
});

export const clarifyingQuestionSchema = z.object({
  campo: z.string(),
  pregunta: z.string(),
  opciones: z.array(z.string()).optional(),
});

export const classificationResolvedSchema = z.object({
  status: z.literal("resolved"),
  iva: ivaResultSchema,
  retefte: retefteResultSchema,
  ica: icaResultSchema,
  resumen: z.string(),
});

export const classificationNeedsClarificationSchema = z.object({
  status: z.literal("needs_clarification"),
  preguntas: z.array(clarifyingQuestionSchema),
});

export const classificationResponseSchema = z.discriminatedUnion("status", [
  classificationResolvedSchema,
  classificationNeedsClarificationSchema,
]);

export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;
export type ClassificationResolved = z.infer<typeof classificationResolvedSchema>;
export type ClassificationNeedsClarification = z.infer<typeof classificationNeedsClarificationSchema>;
export type ClassificationResponse = z.infer<typeof classificationResponseSchema>;
