# Gravimentes

## Plan visual y uso local

Ejecuta **`Iniciar conversor.cmd`**. Este es el punto de entrada principal: inicia el servidor Python local y abre la aplicación en **http://127.0.0.1:8765**. Las mejoras se integran en `conversor/`, sobre su interfaz y base SQLite existentes.

El selector **Contable / Dashboard** alterna entre trabajo y resumen de la empresa activa. El botón ☰ pliega los módulos; en móvil los abre como panel lateral. En Facturas puedes filtrar por mes y revisión, y usar **Anterior / Siguiente** en el detalle para recorrer el listado filtrado. Cambiar de espacio conserva el filtro durante la sesión.

El detalle muestra **Lista**, **Revisar** o **Error**, con motivos procedentes del motor Python, sus advertencias y las cuentas pendientes. Usa **Revisar incidencias** para recorrer los documentos observados del listado filtrado. Se conserva el estado operativo del conversor (por asignar, lista para generar o plano generado). La generación respeta los filtros y, si has marcado facturas, la selección dentro del listado filtrado.

**[Plan visual: Contable / Dashboard](PLAN_VISUAL.md)** · **[Roadmap de ejecución](PLAN_EJECUCION.md)**

**[Funciones implementadas y pendientes del CMD](ESTADO_PLAN_CMD.md)**. Incluye instrucciones de cuenta predeterminada por tercero, preview, ajustes contables, sugerencias, revisión Excel y deshacer cambios.

## Ejecutar con Docker o llevar al trabajo

Ejecuta **`Preparar traslado.cmd`** para crear un ZIP con la aplicación y tus datos. En el equipo destino, instala Docker Desktop, extrae el ZIP y ejecuta **`Iniciar Docker.cmd`**. Abre **http://localhost:8765**.

**[Guía Docker, almacenamiento persistente y traslado sin Internet](README_DOCKER.md)**

## Nuevo conversor independiente

Inicia **`Iniciar conversor.cmd`** para usar la aplicación local de compras XML/ZIP → Contai.

Incluye motor Python, base de datos SQLite, reglas por empresa, revisión de asientos, paquetes descargables, historial y reconversión de lotes. También procesa carpetas sin navegador.

**[Instrucciones del conversor](conversor/README.md)**

## Aplicación HTML anterior

Aplicación local: abrir `gravimentes.html` con Chrome o Microsoft Edge.

## Compras XML/ZIP → plano Contai

1. En **Facturas**, abrir **Compras XML/ZIP → Contai**.
2. Escribir el **NIT del comprador sin dígito de verificación**. Debe coincidir con la empresa activa. Si aún no hay empresa configurada, se toma el nombre del receptor del primer XML coincidente.
3. Mantener marcada **Preparar plano del lote automáticamente**.
4. Seleccionar o arrastrar XML/ZIP de proveedores. Admite ZIP anidados y `AttachedDocument` con XML en CDATA.
5. Revisar el resumen y pulsar **Descargar plano Contai**. El archivo TXT contiene las 13 columnas tabuladas del generador existente, con fecha ISO y cuatro decimales. **Informe del lote** descarga un JSON con resultados, incidencias y parámetros PUC utilizados.

El procesamiento se inicia al seleccionar archivos. Solo se incluyen documentos presentes en ese lote; no se mezclan con otras compras o ventas guardadas. Reimportar un CUFE no crea otra factura. Un documento duplicado pendiente puede volver a generar su plano; los ya causados o pagados se excluyen. Descargar un plano no cambia el estado contable de las facturas.

### Configuración contable

Antes del primer lote, ajustar cuentas PUC, comprobante de compras, centro de costo y reglas de retenciones de la empresa desde las pantallas existentes. Se aprovechan las categorías por descripción y las cuentas aprendidas por proveedor. El contexto PUC debe corresponder al NIT del comprador.

Si se carga un maestro de cuentas en **Parametrización**, se comprueba que cada cuenta del asiento exista, esté activa y reciba movimientos. Sin maestro, el informe indica que solo se comprobó el formato de las cuentas.

### Validaciones del lote

- Comprador coincidente, proveedor identificado y CUFE presente.
- XML válido, fecha y número de documento, moneda COP.
- Totales de líneas, subtotal e IVA consistentes. El IVA se lee de la cabecera, sin volver a sumar el de las líneas.
- Facturas, notas débito y notas crédito; estas últimas generan el asiento reverso de compra.
- Cuentas e importes válidos y débitos iguales a créditos, con tolerancia de medio peso sobre los importes redondeados del motor existente.
- Los documentos con cargos, anticipos, descuentos globales o impuestos adicionales que requieren otro mapeo quedan fuera del plano automático y se detallan en el informe.
- Un fallo de guardado bloquea la descarga del lote.

Los documentos contablemente observados pueden quedar importados para revisión. Un XML de otro comprador o no reconocido no se incorpora como compra. Las incidencias no impiden preparar el plano de los demás documentos válidos.

### Persistencia y dependencias

El último lote y la nómina se guardan en el navegador y, si hay una carpeta vinculada, en `compras-lote.json` y `nomina.json`. También se incluyen en la exportación de JSON de Configuración. El informe conserva una instantánea del PUC utilizado; las demás configuraciones existentes siguen almacenadas por NIT en el navegador.

Los XML sueltos pueden procesarse sin conexión. ZIP utiliza JSZip desde CDN; las exportaciones Excel existentes utilizan SheetJS desde CDN. La descarga del TXT del lote no necesita SheetJS.

## Pruebas

Requieren Node.js y Microsoft Edge. Instalar dependencias de prueba y ejecutar:

```powershell
npm install --no-save playwright jszip
node --test tests/compras.cjs
```

Las pruebas usan un navegador aislado, sin acceso a los datos del perfil habitual. Cubren importación, IVA, ZIP anidado, duplicados, notas crédito, exclusiones, maestro de cuentas, descarga, recarga y errores de almacenamiento. La aceptación del TXT en una instalación concreta de Contai debe verificarse con su configuración de importación.
