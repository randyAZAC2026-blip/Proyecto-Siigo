# Módulo Natillera

Control mensual de aportes para una natillera. Todos los datos se guardan en el `localStorage` del navegador — no viajan a Supabase ni a la Edge Function. Ruta: `/natillera` (requiere sesión iniciada).

## Uso rápido

1. Entra a **Natillera** desde el menú superior.
2. En **Configuración** define nombre, cuota base mensual y año activo. Guarda.
3. En **Miembros** agrega uno a uno. Si dejas la cuota vacía, se usa la cuota base.
4. En **Pagos {año}** haz clic en cualquier celda de la matriz miembros × meses para registrar, editar o eliminar un pago (monto, fecha, notas opcionales).
5. Arriba a la derecha usa **Exportar JSON** para respaldar; **Importar JSON** para restaurar en otro equipo o navegador; **Reiniciar** borra toda la natillera.

## Estados de la matriz

| Celda | Significado |
| --- | --- |
| ✓ (verde) | Pago completo (`monto >= cuota mensual del miembro`) |
| ◐ (ámbar) | Pago parcial (`monto < cuota mensual`) |
| — (gris) | Sin registro (pendiente) |

## Tarjetas de resumen

- **Recaudado** — suma de todos los pagos del año activo.
- **Esperado (año)** — `Σ (cuota mensual × 12)` sobre miembros activos.
- **Pendiente** — `Esperado − Recaudado` (mínimo 0).
- **Miembros activos** — cuenta de miembros con estado activo.
- **Al día** — miembros cuyo total pagado en el año ≥ `cuota × mes de corte`. El mes de corte es el mes actual si el año activo es el corriente; si no, es diciembre.
- **Con mora** — `Activos − Al día`.

## Estructura de datos

Persistido bajo la clave `natillera:v1` en `localStorage`:

```json
{
  "version": 1,
  "nombre": "Mi natillera",
  "cuotaBase": 50000,
  "anioActivo": 2026,
  "miembros": [
    {
      "id": "uuid",
      "nombre": "Juan Pérez",
      "cuotaMensual": 50000,
      "activo": true,
      "notas": "opcional",
      "creadoEn": "2026-09-05T00:00:00.000Z"
    }
  ],
  "pagos": [
    {
      "id": "uuid",
      "miembroId": "uuid del miembro",
      "anio": 2026,
      "mes": 1,
      "monto": 50000,
      "fechaPago": "2026-01-10",
      "notas": "opcional"
    }
  ]
}
```

Los schemas Zod (`src/lib/natillera/types.ts`) validan tanto la carga desde `localStorage` como el JSON importado — si el archivo no cumple, se rechaza y se preservan los datos actuales.

## Archivos

```
src/
├── pages/
│   └── NatilleraPage.tsx              # composición de la vista
├── components/natillera/
│   ├── ConfigNatillera.tsx            # nombre, cuota base, año activo
│   ├── MiembrosManager.tsx            # CRUD de miembros
│   ├── PagosMatriz.tsx                # tabla miembros × 12 meses
│   ├── PagoDialog.tsx                 # modal de registrar/editar pago
│   ├── ResumenNatillera.tsx           # tarjetas de KPIs
│   └── BackupPanel.tsx                # export/import/reset
└── lib/natillera/
    ├── types.ts                       # Miembro, Pago, NatilleraState + Zod
    ├── storage.ts                     # hook useNatillera + helpers
    └── format.ts                      # formatCOP / parseCOP
```

## Limitaciones actuales

- **Un solo navegador.** Los datos no se sincronizan entre dispositivos — usa export/import para migrar.
- **Una sola natillera** por instalación. Si necesitas varias, exporta la actual antes de reiniciar.
- **Sin historial de auditoría.** Editar un pago sobreescribe el anterior.
- **Sin cuentas por miembro.** No modela retiros ni intereses — solo aportes mensuales.

## Cómo extender

- **Multi-natillera:** cambiar la clave de storage a `natillera:v1:${slug}` y agregar un selector.
- **Persistir en Supabase:** crear tablas `natillera_miembros` / `natillera_pagos` con RLS por `user_id`, y reemplazar `useNatillera` por hooks basados en `@tanstack/react-query`.
- **Reporte PDF:** aprovechar la skill `pdf` para exportar la matriz + resumen del año.
