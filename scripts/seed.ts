// Carga las tablas de referencia fiscal en Supabase.
// Correr una sola vez (o tras un reset de DB): pnpm tsx scripts/seed.ts
// Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en el entorno (NO usar el anon key: RLS bloquearía la escritura).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  console.error("Ejemplo: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/seed.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function loadJSON<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, "data", file), "utf-8"));
}

async function seedTable(table: string, rows: unknown[], conflictKey?: string) {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 filas, saltando`);
    return;
  }
  const { error } = conflictKey
    ? await supabase.from(table).upsert(rows, { onConflict: conflictKey })
    : await supabase.from(table).insert(rows);

  if (error) {
    console.error(`  ${table}: ERROR — ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ${table}: ${rows.length} filas cargadas`);
}

async function main() {
  console.log("Cargando tablas de referencia...\n");

  const uvtRates = loadJSON<unknown[]>("uvt_rates.json");
  await seedTable("uvt_rates", uvtRates, "year");

  const taxRegimes = loadJSON<unknown[]>("tax_regimes.json");
  await seedTable("tax_regimes", taxRegimes, "code");

  // retefte_concepts, iva_items, ica_medellin_activities usan id autogenerado —
  // insert simple. Si se re-corre el seed sobre datos ya cargados, limpiar antes:
  //   delete from retefte_concepts; delete from iva_items; delete from ica_medellin_activities;
  const retefte = loadJSON<unknown[]>("retefte_concepts.json");
  await seedTable("retefte_concepts", retefte);

  const ivaItems = loadJSON<unknown[]>("iva_items.json");
  await seedTable("iva_items", ivaItems);

  const icaMedellin = loadJSON<unknown[]>("ica_medellin_activities.json");
  await seedTable("ica_medellin_activities", icaMedellin);

  console.log("\nListo.");
}

main();
