import { supabase } from "@/lib/supabase/client";
import {
  classificationResponseSchema,
  type ClassificationRequest,
  type ClassificationResponse,
} from "@/lib/types/tax";

export async function classifyTax(input: ClassificationRequest): Promise<ClassificationResponse> {
  const { data, error } = await supabase.functions.invoke("classify-tax", {
    body: input,
  });

  if (error) {
    throw new Error(error.message ?? "No se pudo clasificar la actividad.");
  }

  const parsed = classificationResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("La respuesta del servidor no tuvo el formato esperado.");
  }

  return parsed.data;
}
