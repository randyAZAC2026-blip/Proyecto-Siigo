# Actualizaciones — Natillera App

Resumen de los cambios aplicados en la rama
`claude/natillera-monthly-payments-f1kdo8`.

---

## 1. Mora desactivada por defecto

La regla de mora ($500/día por atraso) queda **apagada** hasta que se
active explícitamente.

- Nueva variable de entorno del backend: **`MORA_HABILITADA`**
  - `MORA_HABILITADA=false` (default) → todas las moras salen en **$0**.
  - `MORA_HABILITADA=true` → activa el cobro.
- En **Mora ahorros** y **Mora intereses** aparece un banner amarillo
  ⚠️ *"Regla de mora DESACTIVADA. No se cobra mora en este momento."*
- La liquidación no descuenta mora mientras la regla esté apagada.

**Cómo reactivarla:**

```powershell
$env:MORA_HABILITADA="true"; pnpm dev  # temporal
```

O ponerla en el `.env` del backend de forma permanente.

---

## 2. Panel principal más limpio

- Se quitó la grilla de **"Módulos"** del Panel — ya no duplicaba lo
  que ya está en el menú lateral.
- El Panel ahora solo muestra los **KPIs del ciclo actual**.
- La navegación entre módulos se hace desde el menú lateral izquierdo.

---

## 3. Módulo único de Préstamos

Antes había dos vistas separadas (`Préstamos activos` + `Matriz de
préstamos`). Ahora hay **una sola pantalla**: **Préstamos**.

**Estructura:**

1. **5 indicadores generales** arriba (tiles):
   Total prestado · Saldo capital pendiente · Intereses cobrados ·
   Mora pendiente · Socios con préstamo.
2. **Filtros:** buscador por socio + ordenamiento (por saldo, por
   mora, por nombre).
3. **Tabla principal** — **una fila por socio** con los totales
   acumulados de todos sus préstamos:
   - Columnas: Socio · Préstamos (nº) · Capital inicial · Saldo
     capital · Int. pagados · Mora pendiente · Deuda total · Estado.
   - Estados: **Al día** (verde) · **En mora** (rojo) · **Cancelado**
     (gris).
4. **Fila desplegable** (clic en cualquier socio):
   - Sub-tabla con **los préstamos individuales** (solo si tiene más
     de uno; para casos como Randy con varios préstamos).
   - **Matriz mensual** del socio: mes × (abono capital + intereses +
     total).
   - **Vencimientos de intereses** por cada préstamo con su estado.

**Matriz de préstamos:** se removió el modo "Abono + Intereses". Ahora
solo alterna entre **"Solo capital"** y **"Solo intereses"** (modo por
defecto: capital).

---

## 4. Módulo único de Banco

Antes había `Conciliación` + `Extracto detallado` en el menú. Ahora
hay **una sola pantalla**: **Banco** (solo Bancolombia).

**Estructura:**

1. **4 tiles arriba** con el resumen de Bancolombia:
   Movimientos · Ingresos totales · Egresos totales · Ingresos
   natillera.
2. **Filtros:** Origen · Conciliado · Desde · Hasta · Buscar. (Ya no
   hay selector de banco.)
3. **Tabla de movimientos** (5 columnas): Fecha · Descripción · Socio
   · Monto · Origen.
   - Se quitó la columna **"Conciliado"** (los botones de
     vincular/desvincular).
   - Se quitó la columna **"Banco"** (siempre es Bancolombia).
4. **Acciones:** *Agregar movimiento* · *Importar extracto* ·
   *Actualizar* · *Volver*.
5. **Registrar pago:** sigue funcionando **haciendo clic en el
   monto** de cualquier movimiento.

**Nequi** ya no aparece en la lista — el filtro fuerza siempre
Bancolombia. Sigue existiendo en la BD por si algún día se reactiva.

---

## 5. Menú lateral reorganizado

**Antes:**

```txt
INICIO      → Panel
SOCIOS      → Socios y aportes, Estado de cuenta
AHORROS     → Matriz de ahorros, Control de pagos, Mora ahorros
PRÉSTAMOS   → Préstamos activos, Matriz de préstamos, Mora intereses,
              Liquidación, Simulador cierre
BANCO       → Conciliación, Extracto detallado
OTROS       → Local (offline)
```

**Ahora:**

```txt
INICIO      → Panel, Banco
SOCIOS      → Socios y aportes, Estado de cuenta
AHORROS     → Matriz de ahorros, Control de pagos, Mora ahorros
PRÉSTAMOS   → Préstamos, Mora intereses, Liquidación, Simulador cierre
OTROS       → Local (offline)
```

- **Banco** subió al grupo `Inicio` para acceso rápido.
- Los dos módulos duplicados (`Préstamos activos` y `Matriz de
  préstamos`) se unificaron en **Préstamos**.
- Los dos módulos duplicados (`Conciliación` y `Extracto detallado`)
  se unificaron en **Banco**.
- El grupo `BANCO` como cabecera separada desapareció.

---

## 6. Soporte para leer de Supabase

La app puede alternar entre el backend Express local y Supabase con
solo cambiar una variable.

**Variables en `natillera-app/.env.local`:**

```env
# Elige la fuente de datos
VITE_NAT_DATA_SOURCE=supabase    # o "express"

# Solo si es "express"
VITE_NAT_API=http://localhost:4000

# Solo si es "supabase" (usa la ANON key, nunca la service_role)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

**Modo `express`:** usa `natillera-backend` en `http://localhost:4000`
(hay que arrancarlo con `pnpm dev` en `natillera-backend`).

**Modo `supabase`:** el frontend habla directamente con Supabase — **no
se necesita arrancar el backend**. Requiere:

- Que las 8 tablas estén migradas a Supabase (ya hecho).
- Que las 7 vistas SQL estén creadas
  (`scripts/natillera-migracion/supabase-vistas.sql`).
- Que RLS permita lectura anónima y escritura de transacciones y
  movimientos bancarios (mismo archivo).

**Endpoints portados a Supabase:** todos los de lectura (panel,
socios, matrices, préstamos, liquidación, banco, mora) y los de
escritura básicos (registrar pago, desglose, movimiento manual,
vincular/desvincular).

**Aún no portados** (usar modo `express` para estos):

- **Simulador de liquidación** (cálculo complejo).
- **Importar extracto masivo** desde Excel (requiere lógica de
  deduplicación server-side).

---

## Archivos que se eliminaron

Quedaron obsoletos al unificar módulos:

- `natillera-app/src/pages/PrestamosActivosPage.tsx`
- `natillera-app/src/pages/MatrizPrestamosPage.tsx`
- `natillera-app/src/components/dashboard/DeudoresCard.tsx`
- `natillera-app/src/components/dashboard/MatrizPrestamosView.tsx`
- `natillera-app/src/pages/ConciliacionPage.tsx`
- `natillera-app/src/pages/ExtractoPage.tsx` (renombrado a `BancoPage.tsx`)
- `natillera-app/src/components/dashboard/BancosCard.tsx`

---

## Archivos nuevos

- `natillera-app/src/pages/PrestamosPage.tsx` — módulo Préstamos.
- `natillera-app/src/pages/BancoPage.tsx` — módulo Banco.
- `natillera-app/src/lib/supabase/client.ts` — cliente Supabase.
- `natillera-app/src/lib/dashboard/apiSupabase.ts` — adapter Supabase
  con la misma interfaz que el API Express.
- `natillera-app/.env.example` — plantilla de variables de entorno.
- `scripts/natillera-migracion/supabase-vistas.sql` — SQL para crear
  las 7 vistas + policies RLS en Supabase.
- `ACTUALIZACIONES.md` — este documento.

---

## Cómo actualizar tu PC

```powershell
cd C:\Users\ronz8\Proyecto-Siigo
git pull

cd natillera-app
pnpm install    # trae la nueva dependencia @supabase/supabase-js
pnpm dev
```

Refresca el navegador con **Ctrl+F5** para forzar recarga de la
versión nueva.

---

## Commits que trajeron estos cambios

```txt
7742a78  chore: actualizar pnpm-lock.yaml con @supabase/supabase-js
32be468  docs(supabase): script SQL con vistas y RLS
1b6e1de  feat: soporte para leer de Supabase como fuente alterna
0d39371  chore(nav): mover 'Banco' al grupo Inicio
1400e87  feat(banco): unificar Conciliación + Extracto (solo Bancolombia)
d6ffa41  refactor(extracto): quitar columna Conciliado
9cd2d71  refactor(prestamos): agrupar por socio, no por préstamo
090bc33  feat(prestamos): unificar Préstamos activos + Matriz
bfbdcbb  refactor(matriz-prestamos): quitar modo Abono + Intereses
8f96ba7  feat(natillera): quitar la sección de Módulos del panel
c96d03e  feat(natillera): desactivar mora por defecto con MORA_HABILITADA
```
