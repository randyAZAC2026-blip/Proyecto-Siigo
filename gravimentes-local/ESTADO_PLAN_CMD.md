# Estado verificable del plan · aplicación CMD

Entrada: **`Iniciar conversor.cmd`**, servidor `conversor/servidor.py`, base `conversor/datos/gravimentes.sqlite3`. La aplicación HTML independiente no es el destino de desarrollo.

## Implementado en el conversor

| Capacidad | Alcance real |
|---|---|
| Contable / Dashboard | Navegación plegable y resumen de datos reales de la empresa activa. |
| Filtros y revisión | Mes, búsqueda, estado operativo, Lista/Revisar/Error y recorrido de incidencias. |
| Detalle continuo | Productos, cuentas, terceros, totales y ajustes en una vista. |
| Cuenta por tercero | Predeterminada por **empresa + NIT de contraparte**. Aplica automáticamente a nuevas facturas. En una existente se puede rellenar solo vacíos o reemplazar todas las cuentas explícitamente; las excepciones por ítem son posibles. |
| CxP y retenciones manuales | Ajustes por factura, separados del XML. Retenciones con base, tarifa porcentual y cuenta explícitas; tarifa 0 excluye, desmarcar restaura XML. |
| Vista previa en vivo | Asiento de la factura abierta y consolidado del lote listo según filtros/selección (máximo 200), con el mismo motor de exportación. Panel lateral en escritorio; debajo del detalle en pantallas estrechas. Distingue borrador/guardado y muestra errores parciales sin declarar todo el lote listo. |
| Revisión tabular | Columnas por factura, IVA 5/19, retenciones y tarifa efectiva de ReteFuente, total XML y neto del asiento separados. Cabecera de impuestos preferida; detalle como respaldo, sin sumar ambos. Orden por columna y filtros propios por régimen, retenciones y tarifas mixtas. Excel OOXML del conjunto filtrado sin dependencias. |
| Sugerencias de cuenta | Aprendizaje desde asignaciones guardadas de otras facturas de la misma empresa. Normalización, similitud ponderada y confianza. Aceptación por línea o de sugerencias >=60% en vacíos. Panel con las 20 palabras más frecuentes, cuentas asociadas, ejemplos buscables/paginados y exclusiones reversibles. No se guardan silenciosamente. |
| Historial y deshacer | Últimos 20 cambios de cuentas/ajustes, cuenta habitual del tercero y exclusiones de aprendizaje visibles, persistidos en SQLite. Reversión por acción y Ctrl+Z fuera de campos. Conserva planos anteriores; evita pisar cambios posteriores sobre el mismo recurso, incluso desde otra factura del mismo tercero. |
| Búsqueda y tema | Ctrl+K busca facturas o acciones del conversor. Tema oscuro/claro persistido en el navegador. |
| Exportación | Respeta selección y filtros. Reconversión de documentos con cuentas o ajustes modificados genera una versión nueva. El panel lateral ofrece TXT/ZIP del último resultado guardado de la empresa, también tras recargar. |

## Cuenta por tercero: uso

1. Abre una factura y busca **Cuenta habitual del tercero** en la ficha de la contraparte.
2. Escribe la cuenta de gasto/inventario.
3. **Aplicar a factura** rellena los ítems vacíos. Marca «Reemplazar también…» solo si quieres sustituir todas las cuentas de esta factura.
4. Puedes modificar cualquier ítem individual después.
5. **Guardar cuentas** confirma la factura y sus ajustes.
6. **Recordar tercero** guarda el valor para futuras importaciones de ese proveedor, solo en la empresa activa. No modifica las facturas anteriores. Para quitarlo, deja el valor vacío y vuelve a recordar.

La cuenta de gasto/inventario y la cuenta por pagar son campos distintos: CxP se edita en Ajustes contables.

Los cambios de **Recordar tercero** figuran en Últimos cambios. Deshacerlos modifica la regla para futuras importaciones, no las cuentas que ya tienen las facturas.

## Depurar el aprendizaje

En **Más herramientas → Aprendizaje de cuentas** se muestran las 20 palabras normalizadas más frecuentes y las cuentas asociadas a ellas en la empresa activa. Debajo, busca por factura, descripción, cuenta o palabra; los ejemplos se paginan de 50 en 50.

**Excluir** impide que un ítem guardado se use como ejemplo del predictor. No cambia su cuenta ni su XML ni su plano. **Restaurar** vuelve a incluirlo. Ambas acciones quedan en el historial reversible. Las exclusiones están vinculadas al ítem original y se mantienen al recargar; nunca afectan a otra empresa.

## Pendientes: no se consideran implementados

| Parte del plan | Qué falta / dependencia concreta |
|---|---|
| Importación universal | El conversor admite XML/ZIP fiscales. Faltan pipelines de nómina, JSON token y XLSX de maestros/históricos. Se necesitan formatos de entrada y su mapeo al modelo Python, no solo un selector de archivos. |
| Onboarding por históricos | Falta aprender y revisar comprobantes, CxP, IVA, centros y retenciones desde un plano histórico. Requiere ejemplos representativos del formato usado. |
| Aprobación masiva automática | Existen generación de listas y recorrido de incidencias. Falta política explícita de aprobación de advertencias y sugerencias desde la propia bandeja. |
| Deshacer universal | Cubre cuentas por ítem, CxP, retenciones de factura, cuenta habitual de tercero y exclusiones de aprendizaje. No revierte importaciones, eliminación de lotes ni cambios de configuración de empresa. |
| Alertas normativas | No se incorporó el ejemplo que equipara gran contribuyente y autorretenedor como una regla automática. Faltan reglas verificadas, vigencias y fuentes para la decisión tributaria. |
| Supabase / terceros compartidos | Falta esquema, aislamiento por empresa, sincronización y configuración del servicio. No hay sincronización remota activa. |
| DIAN / resoluciones | Falta importador oficial, vigencias, historial y conciliación de banderas fiscales. |
| Fase 2 SaaS | Next.js/FastAPI, usuarios, permisos, despliegue y demás hitos siguen fuera de la implementación local actual. |
| Métricas UX | Los objetivos de minutos, porcentajes y NPS del roadmap son objetivos, no resultados medidos. Falta evaluación con contadores. |

## Pruebas

- `python -B -m unittest discover -s conversor/tests -p "test_*.py"`
- `conversor/tests/browser_facturas.py` con `PYTHONPATH=conversor`, Playwright y Chromium de desarrollo.

Las pruebas crean bases temporales. Cubren reglas por tercero aisladas por empresa, excepciones por ítem, identidad entre preview y exportación, reconversión, reversión persistente, conflictos entre ventanas, tasas mixtas sin duplicación, XLSX, sugerencias y recorrido UI local.

También se comprueba el consolidado de lote (sin escrituras, parcial, duplicados, límite y aislamiento por empresa), filtros avanzados, tarifa efectiva, edición concurrente durante la exportación y arranque cuando `/flujo.js` no está disponible. En ese último caso se pide reiniciar el CMD en vez de permitir operar con un módulo incompleto.

Última verificación: **41 pruebas backend aprobadas** y recorrido de navegador aprobado, incluyendo descarga lateral tras recarga, exclusión/restauración de ejemplos con Ctrl+Z, regla del tercero reversible y protección frente a cambios posteriores desde otra factura.
