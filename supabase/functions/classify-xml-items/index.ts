// Edge Function: classify-xml-items
// Recibe los ítems (descripción + valor) de un documento XML DIAN previamente
// parseado en el cliente y los categoriza: compra / venta / honorarios /
// flete / arrendamiento / servicio / otro, con la tarifa de retención en la
// fuente sugerida contra la tabla retefte_concepts.
//
// Reusa el mismo patrón que classify-tax: @supabase/server con auth:'user',
// lectura de tablas de referencia vía RLS, Claude con tool use forzado.
import { withSupabase } from "npm:@supabase/server";
import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod@4";

const ITEM_CATEGORIES = [
  "compra",
  "venta",
  "honorarios",
  "flete",
  "arrendamiento",
  "servicio",
  "otro",
] as const;

const itemInputSchema = z.object({
  linea: z.number(),
  descripcion: z.string(),
  valor_total_cop: z.number(),
});

const requestSchema = z.object({
  kind: z.enum([
    "factura_venta",
    "factura_compra",
    "nota_credito",
    "nota_debito",
    "documento_soporte",
  ]),
  // El emisor marca si la factura es compra o venta desde el punto de vista
  // del usuario. "mi_rol" lo manda el frontend según quién sea el usuario
  // autenticado respecto al documento.
  mi_rol: z.enum(["emisor", "receptor"]).optional(),
  emisor_nombre: z.string().optional(),
  receptor_nombre: z.string().optional(),
  items: z.array(itemInputSchema).min(1).max(50),
});

const categorizedItemSchema = z.object({
  linea: z.number(),
  categoria: z.enum(ITEM_CATEGORIES),
  concepto_retefte: z.string().optional(),
  tarifa_retefte_sugerida: z.number().optional(),
  justificacion: z.string(),
});

const responseSchema = z.object({
  items: z.array(categorizedItemSchema).min(1),
  resumen: z.string(),
});

const CLASSIFY_ITEMS_TOOL = {
  name: "submit_item_categorization",
  description:
    "Devuelve la categorización de cada ítem del documento XML: compra, venta, honorarios, flete, arrendamiento, servicio u otro, con la tarifa de retención en la fuente sugerida contra retefte_concepts cuando aplique.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            linea: { type: "number" },
            categoria: { type: "string", enum: [...ITEM_CATEGORIES] },
            concepto_retefte: { type: "string" },
            tarifa_retefte_sugerida: { type: "number" },
            justificacion: { type: "string" },
          },
          required: ["linea", "categoria", "justificacion"],
        },
      },
      resumen: { type: "string" },
    },
    required: ["items", "resumen"],
  },
};

function buildSystemPrompt(context: {
  uvtYear: number;
  uvtValue: number;
  retefte: unknown[];
}): string {
  return `Eres un asesor tributario colombiano. Recibes los ítems de un documento electrónico DIAN (factura, nota crédito/débito o documento soporte) y debes categorizar cada línea.

Categorías válidas:
- compra: adquisición de bienes para reventa o insumo.
- venta: enajenación de mercancía o producto propio.
- honorarios: servicios personales calificados (profesionales, técnicos, consultoría).
- flete: transporte de carga o servicios logísticos.
- arrendamiento: alquiler de bienes muebles o inmuebles.
- servicio: cualquier otro servicio no calificado (mano de obra, mantenimiento, etc.).
- otro: cuando ninguna de las anteriores aplica claramente.

Para cada ítem indica además, si aplica retención en la fuente:
- concepto_retefte: el "concepto" de la tabla retefte_concepts que mejor encaje.
- tarifa_retefte_sugerida: la tarifa decimal (ej. 0.11 para 11%). Si el valor es menor a la base mínima del concepto, omite tarifa_retefte_sugerida.

Reglas:
- Usa el tipo de documento (kind) y el rol del usuario (mi_rol) para decidir si es compra o venta cuando el ítem lo permita.
- Si el emisor es una persona natural y el ítem describe servicios profesionales, inclínate por "honorarios" aunque la factura no lo diga explícitamente.
- Para transporte de carga nacional usa "flete" y concepto_retefte "Servicio de transporte nacional de carga" si existe.
- Para arrendamiento de inmuebles usa "arrendamiento" y concepto_retefte con la tarifa de inmuebles; para muebles, la tarifa general de arriendos.
- Responde SIEMPRE usando submit_item_categorization. Devuelve una entrada por cada ítem recibido.

Año fiscal: ${context.uvtYear} (1 UVT = $${context.uvtValue} COP).

Tabla retefte_concepts (año ${context.uvtYear}):
${JSON.stringify(context.retefte)}`;
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

    const [{ data: uvtRows }, { data: retefte }] = await Promise.all([
      ctx.supabase.from("uvt_rates").select("*").order("year", { ascending: false }).limit(1),
      ctx.supabase.from("retefte_concepts").select("*"),
    ]);

    const currentUvt = uvtRows?.[0];
    if (!currentUvt) {
      return Response.json(
        { error: "No hay UVT configurada. Un superusuario debe cargar la tabla uvt_rates." },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const userMessage = `Tipo de documento: ${input.kind}
Rol del usuario: ${input.mi_rol ?? "no especificado"}
Emisor: ${input.emisor_nombre ?? "no especificado"}
Receptor: ${input.receptor_nombre ?? "no especificado"}
Ítems:
${JSON.stringify(input.items)}`;

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: buildSystemPrompt({
        uvtYear: currentUvt.year,
        uvtValue: currentUvt.value_cop,
        retefte: retefte ?? [],
      }),
      tools: [CLASSIFY_ITEMS_TOOL],
      tool_choice: { type: "tool", name: "submit_item_categorization" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = completion.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "El modelo no devolvió la categorización." }, { status: 502 });
    }

    const result = responseSchema.safeParse(toolUse.input);
    if (!result.success) {
      return Response.json(
        {
          error: "La respuesta del modelo no cumplió el formato esperado.",
          details: result.error.flatten(),
        },
        { status: 502 },
      );
    }

    return Response.json(result.data);
  }),
);
