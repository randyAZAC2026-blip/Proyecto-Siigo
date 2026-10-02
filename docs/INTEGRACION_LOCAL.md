# Integración de Gravimentes y Proyecto-Siigo

Fecha: 2026-10-01. Rama local: `integracion/gravimentes`.
Base: rama del PR #3, `claude/artifacts-webpage-creation-7p87ez`.

## Contenido

- `src/`: asesor tributario React con acceso a Gravimentes desde la navegación.
- `gravimentes-local/`: conversor Python, interfaz, pruebas y distribución Docker conservados del proyecto local.
- `docs/gravimentes_consolidado.md` y `supabase/migrations/0002_conciliacion_bancaria.sql`: aportes del PR #3 conservados sin ejecutar migraciones.

Esta integración reúne el código y facilita el acceso entre aplicaciones. No migra SQLite a Supabase ni comparte identidades, empresas o sesiones. La conciliación SQL todavía no es una función operativa conectada al conversor.

## Inicio

Conversor: `gravimentes-local\Iniciar conversor.cmd` (Python 3.10 o posterior).
Web: `pnpm install --frozen-lockfile`, configurar las variables públicas de Supabase según `.env.example`, y ejecutar `pnpm dev`.

La copia integrada empieza con una base vacía. Los datos originales siguen en `C:\DATABLIN_RANDY\Gravimentes` y no se han copiado, convertido ni subido. Para continuar trabajando con esos datos usa su lanzador original. No ejecutes ambos conversores en el mismo puerto.

## Verificación

Desde `gravimentes-local`: `python -B -m unittest discover -s conversor/tests -p "test_*.py"` con `conversor` en PYTHONPATH.
Desde la raíz: `pnpm build`.

Resultado comprobado: 58 pruebas Python aprobadas y compilación TypeScript/Vite correcta. La navegación autenticada no se verificó con una sesión real de Supabase. No se ejecutaron pruebas visuales del conversor en esta copia.

## Siguiente integración funcional

Definir migración y correspondencia de empresas/usuarios antes de compartir datos. Conectar conciliación con documentos y validar permisos por empresa. Mantener plantillas TXT de Contai diferenciadas: el conversor documenta 13 columnas y la especificación del PR menciona 18; no son intercambiables sin validación.

Las bases, credenciales y paquetes de traslado quedan excluidos mediante `.gitignore`. Revisar cualquier fixture y documentación antes de publicar. No se ha fusionado el PR ni desplegado Supabase.
