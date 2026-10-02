# Gravimentes Conversor

Conversor local independiente: **compras XML/ZIP → asientos Contai**, con historial SQLite y versiones de cada lote.

## Inicio

Requiere Python 3.10 o superior. No necesita instalar paquetes.

Desde la carpeta del proyecto, haz doble clic en **`Iniciar conversor.cmd`**. Se inicia el servidor y abre `http://127.0.0.1:8765`.

### Interfaz local actual

- **Contable / Dashboard**: cambia entre el trabajo y los indicadores de la empresa activa.
- **☰**: muestra u oculta el panel de módulos, también en móvil.
- **Mes / Revisión**: filtra las facturas; los filtros se conservan al cambiar de espacio.
- **Revisar incidencias**: recorre únicamente las observadas del listado filtrado. Los motivos provienen del motor y las cuentas pendientes.
- **Anterior / Siguiente**: recorre el conjunto abierto; pregunta antes de descartar cuentas sin guardar.
- **Generar plano**: usa las listas del listado filtrado o las marcadas dentro de ese listado. Los documentos generados siguen disponibles en Historial.
- **Cuenta habitual del tercero** en la ficha del proveedor: recordar una cuenta de gasto/inventario por empresa y NIT. Nuevas facturas la heredan; las existentes se rellenan con Aplicar a factura, conservando excepciones salvo que marques reemplazar.
- **Asiento propuesto**: panel con el motor de exportación. Se recalcula al editar cuentas o ajustes manuales de CxP/retenciones. Los borradores no se guardan hasta pulsar Guardar cuentas.
- **Plano del lote**: al cerrar el detalle se muestra el consolidado de las facturas listas del filtro/selección (hasta 200), con débitos/créditos, resumen por cuenta y generación desde el panel. La vista previa no guarda ni exporta documentos.
- **Revisión tabular**: además de los filtros de la bandeja, admite régimen, con/sin retenciones y mezcla de IVA 5/19; incluye tarifa efectiva de ReteFuente y descarga solo las filas visibles.
- **Más herramientas**: revisión tabular con IVA 5/19 y Excel, últimos cambios y deshacer. Ctrl+Z fuera de los campos revierte el último cambio de cuentas/ajustes guardado. No borra planos históricos.
- **Sugerencias**: cuentas aprendidas de otras facturas de la empresa, con porcentaje de confianza; se pueden aceptar por ítem o en vacíos para confianza alta.
- **Aprendizaje de cuentas** en Más herramientas: 20 palabras frecuentes y sus cuentas, búsqueda de ejemplos y paginación. Excluir/Restaurar un ejemplo modifica únicamente las sugerencias futuras; no cambia sus asientos.
- **Últimos cambios** también incluye la cuenta habitual del tercero y exclusiones del aprendizaje. Deshacer una regla de tercero no reescribe las cuentas de facturas ya importadas.
- **Descargas laterales**: TXT y ZIP del último resultado guardado de la empresa activa, disponibles también después de recargar.
- **Ctrl+K / Tema**: buscador de facturas/acciones y tema claro/oscuro.

El motor conserva las retenciones XML por defecto. Las modificaciones de base/tarifa/cuenta son explícitas y quedan separadas del original. En el editor todas las tarifas se expresan en porcentaje; desmarcar restaura el XML y una tarifa manual 0 excluye esa retención.

Inventario completo y límites actuales: [Estado del plan CMD](../ESTADO_PLAN_CMD.md).

Para verificar esta interfaz en desarrollo: `python -B conversor/tests/browser_facturas.py` con `conversor` en `PYTHONPATH`, Playwright Python y su navegador Chromium instalados. Usa una base temporal, sin alterar datos reales.

1. Completa NIT, nombre de empresa, cuentas y códigos de Contai. Las cuentas iniciales son ejemplos editables; se valida su formato, no su existencia en Contai.
2. Opcionalmente agrega reglas por descripción: `PAPEL → 519515`. Se usa la primera coincidencia; las demás líneas van a la cuenta predeterminada.
3. Selecciona XML/ZIP y pulsa **Convertir y generar lote**.
4. Revisa los documentos y usa **Ver asiento** para consultar débitos y créditos.
5. Descarga el TXT o el paquete ZIP.

**Arranque sin reglas:** no es necesario alimentar este apartado para convertir el primer lote. Con cero reglas se utiliza la cuenta de compra predeterminada. Las filas de reglas completamente vacías se ignoran; una fila parcialmente completada muestra qué falta. Las reglas actuales son manuales: no hay todavía un modelo de aprendizaje automático que las genere.

El paquete incluye:

- `CONT_AI_<NIT>.txt`: 13 columnas tabuladas, encabezado, fecha ISO y cuatro decimales, siguiendo el formato del generador del proyecto.
- `documentos.csv`: resumen para Excel.
- `informe.json`: resultados, errores, CUFE, asientos y clasificación de líneas.
- `configuracion.json`: configuración utilizada, reutilizable por la CLI.
- `fuentes/`: copia de los archivos seleccionados.

Un lote sin documentos válidos ofrece informe y fuentes, sin TXT vacío.

## Revisión XML

La pestaña **«Revisión XML»** abre cualquier lote, incluidos los documentos que quedaron con error, y permite:

- **Resumen y controles:** clasificación fiscal (compra, nota, **documento soporte** o **ajuste de soporte**), partes XML (proveedor/receptor), NIT de empresa, totales informados, fecha, moneda, CUFE y cada comprobación con su motivo de error.
- **Todos los campos:** árbol completo del XML paginado, con ruta, valor, atributos y namespace; búsqueda por cualquier dato.
- **XML original:** descarga o visualización del archivo tal como se recibió; si viene en AttachedDocument se muestra también el UBL embebido.
- **Asiento calculado:** reconstruido con la configuración del lote para ver cómo quedaría contabilizado.

Un documento puede estar **con error en el lote y ser válido con el motor actual** (por ejemplo, documentos soporte rechazados por versiones anteriores); en ese caso la revisión lo señala y permite abrir el lote para reconvertirlo.

## Documentos soporte y notas de ajuste

Los documentos con código DIAN **05 (Documento Soporte)** y **95 (Nota de Ajuste DS)** se convierten como **gasto**, no como venta:

- Se identifican por código DIAN y por cuál de las partes coincide con el NIT de la empresa, no solo por la posición emisor/receptor.
- La **cuenta por pagar del proveedor** usa la cuenta específica `proveedor_ds` (por defecto `233595`), distinta de la compra normal.
- Cada tipo tiene su código de comprobante: `comprobante_ds` y `comprobante_ajuste_ds`.
- El ajuste (95) genera el asiento reverso: créditos al gasto y débito a la cuenta por pagar.

## Corregir y reconvertir

En **Historial de lotes**, abre un resultado. Se recupera su configuración. Cambia cuentas, reglas o códigos y pulsa **Reconvertir con cuentas actuales**. Se procesan las fuentes guardadas, se genera otra versión y se conserva el lote anterior. Descarga la versión que deseas importar.

Una carga normal no vuelve a convertir CUFE ya registrados: enlaza con el lote original. La reconversión explícita permite corregir la contabilización sin duplicar documentos en el registro fiscal.

## Procesamiento automático de carpetas

Guarda el `configuracion.json` del paquete descargado y ejecuta:

```powershell
python conversor/servidor.py --entrada "C:\Compras\Entrada" --config "C:\Compras\configuracion.json" --salida "C:\Compras\Salida"
```

Recorre subcarpetas, procesa XML/ZIP, guarda el historial y escribe un ZIP de resultados en salida. Se puede ejecutar desde el Programador de tareas de Windows con esas mismas opciones. Los CUFE anteriores se omiten. Código de salida `0`: lote sin errores; `2`: lote con incidencias. La carpeta de salida debe ser distinta de la entrada.

## Persistencia

- Base de datos: `conversor/datos/gravimentes.sqlite3`.
- Incluye empresas, configuraciones, registro de CUFE, informes y paquetes originales.
- Para respaldar todo, detén el servidor y copia la base de datos.
- Para detenerlo: `Ctrl+C` en la consola.
- Puerto alternativo: `python conversor/servidor.py --puerto 8766`.

## Alcance contable

- Facturas, notas crédito (asiento reverso) y notas débito de compras recibidas en COP.
- ZIP anidados y AttachedDocument con XML en CDATA.
- IVA de cabecera a 19% y 5%, con cuentas independientes; valores decimales sin redondeo entero al peso.
- Descuentos y cargos globales reflejados en la cuenta predeterminada.
- Retenciones exclusivamente informadas en el XML. **No se calculan retenciones ausentes**: pueden requerir ajuste según las obligaciones del comprador.
- Validación de NIT comprador, proveedor, fechas, importes, totales y balance débito/crédito.
- Incidencias individualizadas: un XML inválido no impide convertir otros válidos del lote.
- Documentos soporte, otras monedas, impuestos adicionales, anticipos y redondeos explícitos quedan pendientes de un mapeo específico; no se fuerzan asientos.

La herramienta genera archivos; la aceptación en una instalación concreta de Contai debe comprobarse con sus códigos y formato de importación. No envía información a DIAN ni registra automáticamente operaciones en Contai.

## Pruebas

Motor, API, persistencia, concurrencia, versiones y CLI (sin dependencias):

```powershell
python -B -m unittest discover -s conversor/tests -p "test_*.py" -v
```

Interfaz en Microsoft Edge (solo para desarrollo):

```powershell
npm install --no-save playwright
node --test conversor/tests/interfaz.cjs
```

Las pruebas usan bases temporales y el XML sintético `tests/factura.xml`, identificado como documento de prueba. No requieren datos de la empresa del usuario.

## Estructura

- `motor.py`: parseo, validaciones, asientos, ZIP, SQLite y versionado.
- `servidor.py`: API HTTP local y comando de procesamiento por carpeta.
- `interfaz.html`: interfaz sin dependencias de red.
- `tests/`: pruebas del motor y del recorrido completo en navegador.
