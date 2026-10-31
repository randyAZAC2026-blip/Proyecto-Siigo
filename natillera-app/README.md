# Natillera

App web para llevar el control mensual de aportes a una natillera. **Standalone**: sin backend, sin login, sin base de datos remota. Todos los datos viven en el `localStorage` del navegador y se pueden exportar/importar como JSON.

## Correr localmente

```powershell
cd natillera-app
pnpm install       # o npm install / yarn
pnpm dev
```

Abre http://localhost:5173

## Build de producción

```powershell
pnpm build
pnpm preview       # sirve el build en http://localhost:4173
```

El bundle en `dist/` es HTML + JS + CSS estáticos. Se puede subir a Vercel, Netlify, GitHub Pages o cualquier servidor de archivos estáticos — no requiere backend.

## Cómo usar

1. **Configuración** — nombre de la natillera, cuota base mensual y año activo.
2. **Miembros** — agrega uno por uno. Si tienen cuota distinta, la pones en su columna; si dejas vacío, se usa la base.
3. **Pagos {año}** — clic en cualquier celda del mes/miembro para registrar pago (monto, fecha, notas). Verde ✓ = pagado completo, ámbar ◐ = parcial, — = pendiente.
4. **Resumen** — tarjetas con recaudado, esperado, pendiente, al día, con mora.
5. **Backup** — botones arriba a la derecha:
   - **Exportar JSON**: baja un archivo `natillera-YYYY-MM-DD.json` con todos tus datos.
   - **Importar JSON**: sube un backup previo.
   - **Reiniciar**: borra todo (con confirmación).

## Persistencia

Todos los datos se guardan en `localStorage` bajo la clave `natillera:v1`. Esto significa:

- Los datos son privados de ese navegador — no van a la nube.
- Si limpias el historial o cambias de PC, se pierden. **Exporta el JSON con frecuencia.**
- Para pasarlos a otro equipo: exportar en el viejo → importar en el nuevo.

## Stack

- React 19 + TypeScript strict
- Vite 8
- Tailwind CSS v4 + shadcn/ui (subset)
- Zod (validación del JSON persistido e importado)
- `lucide-react` (íconos)

Cero deps de red, cero servicios externos.
