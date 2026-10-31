import { Users } from "lucide-react";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOPCompacto } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import { SociosTabla } from "@/components/dashboard/SociosTabla";

export function SociosAportesPage({ onVolver: _onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.socios(), []);
  const socios = (data ?? []).filter((s) => s.tipo === "persona");
  const suma = (k: "ahorro" | "actividades" | "rifa_chance" | "total_aportado" | "saldo_prestamos") =>
    socios.reduce((t, s) => t + (s[k] ?? 0), 0);
  const conDeuda = socios.filter((s) => s.saldo_prestamos > 0).length;

  return (
    <InformeLayout
      titulo="Socios y aportes"
      descripcion="Lo que ha aportado cada socio en el ciclo y lo que debe en préstamos. Clic en un encabezado para ordenar."
      Icon={Users}
      cargando={loading}
      error={error}
      listo={!!data}
      onActualizar={reload}
      resumen={[
        { label: "Socios", valor: String(socios.length), detalle: `${socios.filter((s) => s.estado === "activo").length} activos` },
        { label: "Total aportado", valor: formatCOPCompacto(suma("total_aportado")) },
        { label: "Ahorro", valor: formatCOPCompacto(suma("ahorro")) },
        {
          label: "Deuda en préstamos",
          valor: formatCOPCompacto(suma("saldo_prestamos")),
          detalle: `${conDeuda} socios con saldo`,
          tono: conDeuda > 0 ? "alerta" : "bueno",
        },
      ]}
      excel={() => [
        {
          nombre: "Socios y aportes",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 32 },
            { titulo: "Estado", tipo: "texto", ancho: 10 },
            { titulo: "Ahorro", tipo: "moneda" },
            { titulo: "Actividades", tipo: "moneda" },
            { titulo: "Rifa", tipo: "moneda" },
            { titulo: "Intereses pagados", tipo: "moneda" },
            { titulo: "Total aportado", tipo: "moneda" },
            { titulo: "Deuda préstamos", tipo: "moneda" },
          ],
          filas: [...socios]
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .map((s) => [
              s.nombre,
              s.estado,
              s.ahorro,
              s.actividades,
              s.rifa_chance,
              s.intereses_pagados,
              s.total_aportado,
              s.saldo_prestamos,
            ]),
          totales: [
            "TOTAL",
            "",
            suma("ahorro"),
            suma("actividades"),
            suma("rifa_chance"),
            socios.reduce((t, s) => t + s.intereses_pagados, 0),
            suma("total_aportado"),
            suma("saldo_prestamos"),
          ],
        },
      ]}
    >
      <SociosTabla socios={socios} />
    </InformeLayout>
  );
}
