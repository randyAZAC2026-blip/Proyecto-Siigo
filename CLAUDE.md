# Asesor Tributario IA

App web que clasifica actividad económica descrita en lenguaje natural y calcula IVA, Retención en la Fuente e ICA (Medellín) usando Claude como motor de clasificación.

## Comandos

- `pnpm dev` — Servidor de desarrollo
- `pnpm build` — Build de producción (`tsc -b && vite build`)
- `pnpm lint` — Linter (oxlint)
- `pnpm seed` — Poblar tablas de referencia. Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en el entorno (no en `.env` del frontend — son secrets separados, ver Sección Variables de Entorno)
- `supabase db push` — Aplicar migraciones (`supabase/migrations/0001_init.sql`)
- `supabase functions deploy classify-tax` — Deploy de la Edge Function

## Stack Tecnológico

React 19 + Vite 8 + TypeScript strict + Tailwind CSS v4 + shadcn/ui (estilo "new-york") + Supabase (Postgres, Auth, Edge Functions) + Claude API (`claude-sonnet-5`, vía `@supabase/server`) + Vercel (hosting sugerido)

## Arquitectura

### Estructura de Directorios

- `src/pages/` — LoginPage, CalculatorPage, admin/TablasAdminPage, admin/TablaEditorPage
- `src/components/calculator/` — formulario, preguntas de aclaración, cards de resultado
- `src/components/admin/DataTableEditor.tsx` — editor CRUD genérico reutilizado por las 5 tablas fiscales (configuradas en `src/lib/tablasConfig.ts`)
- `src/components/layout/` — AppLayout, ProtectedRoute, AdminRoute, ErrorBoundary
- `src/lib/supabase/` — cliente browser + tipos manuales del schema (`database.types.ts`)
- `src/lib/api/classifyTax.ts` — wrapper tipado de la Edge Function
- `src/lib/types/tax.ts` — schemas Zod del request/response de clasificación (fuente de verdad del contrato)
- `src/hooks/useAuth.tsx` — sesión + perfil (rol) vía contexto
- `supabase/functions/classify-tax/` — Edge Function (Deno) que llama Claude
- `supabase/migrations/0001_init.sql` — schema completo + RLS + trigger de perfil
- `scripts/seed.ts` + `scripts/data/*.json` — carga inicial de las tablas fiscales (datos extraídos del xlsx de retenciones y de los PDFs de IVA canasta familiar / ICA Medellín)

### Flujo de Datos

Cliente → Supabase Auth (sesión) → CalculatorPage arma request → `supabase.functions.invoke("classify-tax")` → Edge Function (Deno, `auth: 'user'` vía `@supabase/server`) → lee tablas de referencia con el cliente de usuario (RLS ya permite lectura a cualquier autenticado, no hace falta service role aquí) → arma prompt con contexto tributario → Claude API (tool use forzado, `submit_classification`) → responde `resolved` o `needs_clarification` → frontend renderiza.

Panel admin: cliente → Supabase client directo (PostgREST) → RLS valida `role='superuser'` en la tabla `profiles` → tablas fiscales.

### Patrones Clave

- Toda lectura/escritura de tablas fiscales pasa por RLS, nunca se valida el rol solo en el frontend.
- La Edge Function nunca confía en `tipo_persona`/`regimen_tributario` del cliente para saltarse la clasificación — son inputs para el prompt, no bypass de lógica.
- Resultados de cálculo NUNCA se persisten — solo viven en el estado de React de la sesión activa.
- Un solo componente genérico `DataTableEditor` para las 5 tablas fiscales — no crear un editor por tabla. Usa un cast `any` acotado y documentado al cliente Supabase porque opera sobre nombres de tabla dinámicos; el resto de la app usa el cliente completamente tipado.
- `src/index.css` define el set completo de tokens semánticos de shadcn (`--background`, `--card`, `--popover`, `--primary`, etc., mapeados vía `@theme inline`) además de alias propios (`--color-primary`, `--color-surface`, etc.) usados en los componentes hechos a mano. Si agregas un componente shadcn nuevo, sus clases (`bg-popover`, `text-muted-foreground`, etc.) ya están cubiertas — no definir tokens nuevos sin revisar que no dupliquen estos.

## Reglas de Organización de Código

1. **Un componente por archivo.** Máximo 300 líneas. Si es más largo, extraer subcomponentes.
2. **Alias de path:** usar `@/` para imports desde `src/`.
3. **Sin barrel exports.** Importar directo del archivo fuente.
4. **Toda llamada a Supabase pasa por `src/lib/supabase/client.ts`** (frontend) — nunca instanciar el cliente en otro lugar. La Edge Function usa `@supabase/server` (`withSupabase`), no `createClient` manual.
5. **Validar con Zod** en el límite del sistema: `src/lib/types/tax.ts` en el frontend, schema duplicado (a propósito — la función corre en Deno, runtime separado) en `supabase/functions/classify-tax/index.ts`. Si cambias el contrato, actualiza ambos.

## Sistema de Diseño

### Colores (definidos en `src/index.css`)

- Primary: `#3f7a5c` / Primary Hover: `#2e5c44`
- Background: `#faf9f5` / Surface (card/popover): `#ffffff`
- Text: `#1f2a24` / Muted: `#6b7a70` / Border: `#e4e7e1`
- Destructive: `#c1443a` / Success: `#6fa980` / Warning: `#c98a2e`

### Tipografía

- Headings: Inter, 600
- Body: Inter, 400
- Montos: Inter tabular-nums, 600

### Estilo

- Border radius: 10px (inputs/botones), 14px (cards)
- Sombras sutiles, sin gradientes, mucho aire entre secciones
- Verde usado con moderación (acentos), blanco pastel domina el fondo
- Mobile-first: grids colapsan a 1 columna por defecto, `sm:` agrega columnas

## Variables de Entorno

**Frontend (`.env`, prefijo `VITE_`):**

| Variable                 | Descripción                  |
| ------------------------ | ---------------------------- |
| `VITE_SUPABASE_URL`      | URL del proyecto Supabase    |
| `VITE_SUPABASE_ANON_KEY` | Anon/publishable key pública |

**Edge Function (`supabase secrets set`, nunca en el cliente):**

| Variable            | Descripción             |
| ------------------- | ----------------------- |
| `ANTHROPIC_API_KEY` | Key de la API de Claude |

`@supabase/server` inyecta automáticamente las credenciales del proyecto dentro de la Edge Function — no hace falta configurar manualmente ni `SUPABASE_URL` ni ninguna key de Supabase ahí.

**Script `seed.ts` (entorno del script, no del proyecto Vite):**

| Variable                    | Descripción                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`              | URL del proyecto                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key — el seed necesita bypasear RLS para la carga inicial |

## Reglas No Negociables

1. **`ANTHROPIC_API_KEY` solo vive en la Edge Function.** Nunca en el bundle del cliente, nunca en un componente React.
2. **TypeScript strict, cero `any` fuera de `DataTableEditor.tsx`** (documentado ahí, único punto necesario por el diseño genérico del editor de tablas).
3. **Todo resultado de la calculadora debe mostrar el disclaimer**: "Esta herramienta es orientativa, no reemplaza asesoría contable formal." — ya implementado en `ResultadoDetallado.tsx`, no quitar.
4. **RLS es la única fuente de verdad de autorización.** El chequeo de rol en el frontend (`AdminRoute`) es solo UX, nunca seguridad.
5. **Ninguna tabla fiscal se hardcodea en el frontend o en el prompt de la Edge Function.** Todo valor de tarifa/base sale de Postgres, para que el superusuario pueda actualizarlas sin tocar código.
6. **El primer superusuario se promueve manualmente por SQL** (`update profiles set role='superuser' where id='<uuid>'`) — no hay flujo de auto-promoción por seguridad.
