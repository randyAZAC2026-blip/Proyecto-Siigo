// Edge Function: classify-tax
// Recibe una descripción de actividad económica + valor del servicio y
// devuelve la clasificación de IVA, Retención en la Fuente e ICA (Medellín),
// o preguntas de aclaración si la IA no tiene información suficiente.
//
// auth: 'user' — cualquier usuario autenticado puede llamarla. Usa el cliente
// de usuario (ctx.supabase), no el admin: las 5 tablas de referencia ya son
// legibles por cualquier autenticado vía RLS (ver supabase/migrations/0001_init.sql),
// así que no hace falta la secret key aquí — principio de menor privilegio.
import { withSupabase } from "npm:@supabase/server";
import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod@4";

const requestSchema = z.object({
  descripcion_actividad: z.string().min(5),
  valor_servicio: z.number().positive(),
  ciudad: z.string().optional().default("Medellín"),
  tipo_persona: z.enum(["natural", "juridica"]).optional(),
  regimen_tributario: z.string().optional(),
  respuestas_aclaracion: z.record(z.string(), z.string()).optional(),
});

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

const clarifyingQuestionSchema = z.object({
  campo: z.string(),
  pregunta: z.string(),
  opciones: z.array(z.string()).optional(),
});

const claudeOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    iva: ivaResultSchema,
    retefte: retefteResultSchema,
    ica: icaResultSchema,
    resumen: z.string(),
  }),
  z.object({
    status: z.literal("needs_clarification"),
    preguntas: z.array(clarifyingQuestionSchema).min(1),
  }),
]);

const CLASSIFY_TOOL = {
  name: "submit_classification",
  description:
    "Devuelve la clasificación tributaria de la actividad descrita, o una lista de preguntas de aclaración si falta información para clasificar con confianza.",
  input_schema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["resolved", "needs_clarification"] },
      iva: {
        type: "object",
        properties: {
          aplica: { type: "boolean" },
          tarifa: { type: "number" },
          tipo: { type: "string", enum: ["gravado", "exento", "excluido"] },
          justificacion: { type: "string" },
          monto_cop: { type: "number" },
        },
        required: ["aplica", "tarifa", "tipo", "justificacion", "monto_cop"],
      },
      retefte: {
        type: "object",
        properties: {
          aplica: { type: "boolean" },
          concepto: { type: "string" },
          tarifa: { type: "number" },
          base_minima_cop: { type: "number" },
          monto_cop: { type: "number" },
          justificacion: { type: "string" },
        },
        required: ["aplica", "concepto", "tarifa", "base_minima_cop", "monto_cop", "justificacion"],
      },
      ica: {
        type: "object",
        properties: {
          aplica: { type: "boolean" },
          clase_ciiu: { type: "string" },
          tarifa_por_mil: { type: "number" },
          monto_cop: { type: "number" },
          justificacion: { type: "string" },
        },
        required: ["aplica", "clase_ciiu", "tarifa_por_mil", "monto_cop", "justificacion"],
      },
      resumen: { type: "string" },
      preguntas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            campo: { type: "string" },
            pregunta: { type: "string" },
            opciones: { type: "array", items: { type: "string" } },
          },
          required: ["campo", "pregunta"],
        },
      },
    },
    required: ["status"],
  },
};

function buildSystemPrompt(context: {
  uvtYear: number;
  uvtValue: number;
  retefte: unknown[];
  iva: unknown[];
  ica: unknown[];
  regimes: unknown[];
}): string {
  return `Eres un asesor tributario colombiano experto, explicando a usuarios SIN conocimientos contables qué impuestos aplican a lo que venden.

Tu tarea: clasificar la actividad económica descrita por el usuario contra las tablas de referencia provistas, y calcular IVA, Retención en la Fuente (Retefte) e ICA de Medellín sobre el valor del servicio dado.

Reglas de clasificación:
- IVA: usa la tabla iva_items como referencia principal (canasta familiar DANE). Si el bien/servicio no aparece explícitamente, aplica la regla general del Estatuto Tributario: 19% gravado, salvo que sea claramente un bien/servicio excluido (Art. 424 ET: salud, educación, transporte público, alimentos básicos) o exento (Art. 477/481 ET: exportaciones, algunos alimentos procesados para exportación).
- Retefte: usa la tabla retefte_concepts. La tarifa depende de tipo_persona (natural/juridica) y si aplica, del régimen tributario (natural declarante vs no declarante). Si valor_servicio es menor a la base mínima (valor_base_cop) del concepto aplicable, retefte.aplica = false.
- ICA: usa la tabla ica_medellin_activities (clasificación CIIU). Solo aplica si ciudad es Medellín o no se especifica ciudad distinta.
- Si la descripción es ambigua entre 2+ categorías con tarifas distintas, o falta tipo_persona/regimen_tributario y eso cambia el resultado, responde con status "needs_clarification" y preguntas específicas — NO adivines.
- Si el usuario ya respondió preguntas de aclaración (respuestas_aclaracion), úsalas para completar la clasificación en este intento.
- Los montos (monto_cop) se calculan como valor_servicio * tarifa (o tarifa_por_mil / 1000 para ICA).
- El campo "resumen" debe explicar el resultado en lenguaje simple, sin jerga contable, para alguien que nunca declaró impuestos.

Año fiscal vigente: ${context.uvtYear} (1 UVT = $${context.uvtValue} COP).

Tabla retefte_concepts (año ${context.uvtYear}):
${JSON.stringify(context.retefte)}

Tabla iva_items (semilla canasta familiar + regla general):
${JSON.stringify(context.iva)}

Tabla ica_medellin_activities (CIIU → tarifa por mil):
${JSON.stringify(context.ica)}

Tabla tax_regimes:
${JSON.stringify(context.regimes)}

Responde SIEMPRE usando la herramienta submit_classification.`;
}

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Solicitud inválida", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Tablas de referencia — lectura permitida a cualquier autenticado (RLS).
    const [{ data: uvtRows }, { data: retefte }, { data: iva }, { data: ica }, { data: regimes }] =
      await Promise.all([
        ctx.supabase.from("uvt_rates").select("*").order("year", { ascending: false }).limit(1),
        ctx.supabase.from("retefte_concepts").select("*"),
        ctx.supabase.from("iva_items").select("*"),
        ctx.supabase.from("ica_medellin_activities").select("*"),
        ctx.supabase.from("tax_regimes").select("*"),
      ]);

    const currentUvt = uvtRows?.[0];
    if (!currentUvt) {
      return Response.json(
        { error: "No hay UVT configurada. Un superusuario debe cargar la tabla uvt_rates." },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const userMessage = `Descripción de actividad: "${input.descripcion_actividad}"
Valor del servicio: $${input.valor_servicio} COP
Ciudad: ${input.ciudad}
Tipo de persona: ${input.tipo_persona ?? "no especificado"}
Régimen tributario: ${input.regimen_tributario ?? "no especificado"}
${input.respuestas_aclaracion ? `Respuestas a preguntas previas: ${JSON.stringify(input.respuestas_aclaracion)}` : ""}`;

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: buildSystemPrompt({
        uvtYear: currentUvt.year,
        uvtValue: currentUvt.value_cop,
        retefte: retefte ?? [],
        iva: iva ?? [],
        ica: ica ?? [],
        regimes: regimes ?? [],
      }),
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "submit_classification" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = completion.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "El modelo no devolvió una clasificación." }, { status: 502 });
    }

    const result = claudeOutputSchema.safeParse(toolUse.input);
    if (!result.success) {
      return Response.json(
        { error: "La clasificación del modelo no cumplió el formato esperado.", details: result.error.flatten() },
        { status: 502 },
      );
    }

    return Response.json(result.data);
  }),
);
