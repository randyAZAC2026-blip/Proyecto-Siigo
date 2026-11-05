import { supabase } from "@/lib/supabase/client";
import {
  categorizeResponseSchema,
  type CategorizeResponse,
  type InvoiceDoc,
} from "@/lib/xml/types";

export type ClassifyXmlItemsInput = {
  kind: InvoiceDoc["kind"];
  mi_rol?: "emisor" | "receptor";
  emisor_nombre?: string;
  receptor_nombre?: string;
  items: Array<{
    linea: number;
    descripcion: string;
    valor_total_cop: number;
  }>;
};

export async function classifyXmlItems(
  input: ClassifyXmlItemsInput,
): Promise<CategorizeResponse> {
  const { data, error } = await supabase.functions.invoke("classify-xml-items", {
    body: input,
  });

  if (error) {
    throw new Error(error.message ?? "No se pudo categorizar los ítems.");
  }

  const parsed = categorizeResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("La respuesta del servidor no tuvo el formato esperado.");
  }
  return parsed.data;
}
