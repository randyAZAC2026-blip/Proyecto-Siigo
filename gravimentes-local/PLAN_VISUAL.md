# Plan visual · Gravimentes local

## Destino confirmado: aplicación iniciada por CMD

El usuario confirmó que el destino es **`Iniciar conversor.cmd` → `conversor/servidor.py` → http://127.0.0.1:8765**, con SQLite. Los cambios posteriores se desarrollan sobre el conversor existente. `gravimentes.html` fue un destino inicial equivocado; sus implementaciones históricas descritas más abajo no implican que todas estén disponibles en el conversor.

Trasladado y verificado en el CMD: selector Contable/Dashboard con métricas de la empresa activa, navegación plegable, filtros mensual y de revisión, detalle lineal existente, recorrido de facturas y cola de incidencias, preservación de cambios pendientes al navegar, selección y filtros al generar planos. La revisión usa errores y advertencias del motor Python y detecta cuentas pendientes; no copia el motor tributario del HTML anterior.

Actualización: el conversor ya incorpora cuenta por tercero, panel del asiento individual en vivo, editor de CxP/retenciones, revisión tabular, sugerencias e historial reversible. **El estado vigente del conversor y sus límites está en [ESTADO_PLAN_CMD.md](ESTADO_PLAN_CMD.md)**; las tablas históricas de este documento no sustituyen ese inventario.

Referencia: imagen compartida por el usuario, con barra superior, navegación lateral estrecha y selector central. Fecha: 2026-09-27.

## Estructura propuesta

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Gravimentes   [Empresa activa ▾]    [Contable | Dashboard]   Buscar  Tema  │
├─────┬──────────────────┬──────────────────────────────────────────────────┤
│ ⌂   │ CONTABLE         │ Facturas                       [Importar]        │
│     │                  │ Revisa tus documentos y prepara el plano.       │
│ ▤   │ Facturas         │                                                  │
│ ♙   │ Terceros         │ [Buscar factura, tercero o NIT…] [Mes] [Estado] │
│ ▦   │ Nómina           │                                                  │
│     │                  │ Factura  Tercero    Base    IVA   Total  Estado  │
│ ⋯   │ Más herramientas │ FE1003   Proveedor  …       …     …      Lista  │
│     │                  │ FE1004   Proveedor  …       …     …      Revisar│
│     │                  │                                                  │
│     │                  │                     [Preparar plano]             │
│ ⚙   │ Guardado local   │                                                  │
└─────┴──────────────────┴──────────────────────────────────────────────────┘
```

Los iconos del boceto representan accesos: la implementación deberá acompañarlos de etiquetas accesibles y ayuda al pasar el cursor o enfocarlos.

## 1. Barra superior

- Nombre Gravimentes y selector de empresa activa a la izquierda.
- Selector centrado **Contable / Dashboard**, equivalente al selector Chat / Work de la referencia.
- Buscar (Ctrl+K) y cambio de tema a la derecha.
- Mostrar el estado real del guardado: local, guardando o error. No presentar una escritura fallida como guardada.
- Los controles de ventana y menús del navegador siguen a cargo del navegador; no se simulan botones de minimizar o cerrar en el HTML.

## 2. Navegación lateral

Dos niveles:

1. **Barra compacta**, aproximadamente 56 px: inicio, accesos principales y configuración al pie.
2. **Panel de módulos**, aproximadamente 220 px, plegable: Facturas, Terceros, Nómina y Más herramientas.

Más herramientas agrupa Proyección IVA, Categorización de compras y Parametrización. Se reutilizan las vistas y rutas actuales de `gravimentes.html`.

El selector Contable restaura el último módulo contable abierto. Dashboard abre el Panel general existente. Cambiar de espacio no debe modificar la empresa ni perder filtros o cambios pendientes.

## 3. Espacio Contable

### Facturas: un solo módulo

Se amplía la vista existente `#v-facturas`, con los datos, terceros, retenciones y generación de planos actuales.

- **Importar** agrupa XML/ZIP y token DIAN.
- **Preparar plano** es la acción principal antes de generar; **Bajar plano** lo será cuando exista un resultado válido.
- **Más acciones** contiene exportación de token y herramientas menos frecuentes.
- El detalle mantiene una lectura continua: cabecera, productos, retenciones, asiento y acuse desplegable.
- La futura revisión secuencial permite recorrer las facturas observadas sin volver a la tabla.
- El panel de asiento lateral se incorpora después de unificar su fuente de cálculo con la exportación. Debe identificar si representa una factura o un lote.

### Estados visuales propuestos

Una etiqueta de revisión por factura: Lista, Revisar o Error, con texto además del color. Implementada mediante evaluación del tercero, número, fecha, importes, validaciones XML registradas, cuentas, maestro (si existe), cuadre y advertencias de retención/régimen. Lista significa que estas comprobaciones no encontraron incidencias; la exportación mantiene sus validaciones específicas.

El estado contable original y el acuse siguen consultables en el detalle. No deben alterarse al cambiar la presentación.

## 4. Espacio Dashboard

Reutiliza el Panel general: resumen de facturas, pendientes y totales disponibles. Cada indicador debe mostrar empresa, período y origen del cálculo. Los valores de demostración no pueden presentarse como métricas reales.

Los indicadores permiten entrar al listado correspondiente con un filtro visible. El diseño visual no presupone que todas estas conexiones estén implementadas.

## 5. Apariencia y adaptación

- Referencia oscura: fondo gris pizarra, panel lateral algo más oscuro, superficies con contraste moderado.
- Conservar también el tema claro existente.
- Una tipografía sans serif, bordes de 8 px y espaciado basado en múltiplos de 4 px.
- Verde para correcto y acción principal; ámbar para revisión; rojo para error; gris para estructura.
- Foco de teclado visible, botones con nombres accesibles y menús que puedan cerrarse sin ratón.
- Escritorio: ambos laterales disponibles; panel de asiento solo si hay anchura suficiente.
- Tablet: panel de módulos plegable.
- Móvil: navegación en panel desplegable y asiento debajo del detalle; tablas con desplazamiento interno, sin desbordar la página.

## 6. Orden de implementación

| Paso | Entregable | Estado |
|---|---|---|
| 1 | Facturas: Importar, Preparar plano y Más acciones | Implementado localmente |
| 2 | Detalle lineal desplegable, refresco de asiento al cambiar CxP/retenciones | Implementado localmente |
| 3 | Estructura global de la referencia: barra compacta, panel plegable y Contable/Dashboard | Implementado localmente |
| 4 | Filtros por período y estados derivados de validaciones | Implementado: mes y revisión Lista/Revisar/Error |
| 5 | Revisión secuencial y panel lateral de asiento | Recorrido general y cola de incidencias implementados; panel lateral pendiente |
| 6 | Importación con detección de formatos, aprendizaje y deshacer global | Pendiente del plan funcional |

## 7. Verificación de lo implementado

`tests/compras.cjs`: 13 pruebas aprobadas en Microsoft Edge con perfil aislado. Cubren el nuevo menú, detalle sin pestañas, actualización de CxP, persistencia, ancho del modal en móvil y el flujo existente de importación/exportación. También verifican Contable/Dashboard, conservación del filtro al cambiar de espacio, filtrado mensual, recorrido de facturas, navegación plegable, ausencia de desbordamiento horizontal móvil y cola de incidencias. Incluyen errores de cuentas, tercero ausente, fecha imposible e importes inválidos, además del bloqueo de causación con errores.

Entrada de uso local: **`Iniciar conversor.cmd`**. La navegación secuencial recorre el listado filtrado y no genera documentos automáticamente. La cola de incidencias es una instantánea al iniciarla; permite guardar las cuentas y revisar el resultado antes de pasar al siguiente documento.

Plan funcional relacionado: [PLAN_EJECUCION.md](PLAN_EJECUCION.md).
