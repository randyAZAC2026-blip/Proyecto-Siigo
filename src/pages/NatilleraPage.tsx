import { PiggyBank } from "lucide-react";
import { useNatillera } from "@/lib/natillera/storage";
import { ConfigNatillera } from "@/components/natillera/ConfigNatillera";
import { MiembrosManager } from "@/components/natillera/MiembrosManager";
import { PagosMatriz } from "@/components/natillera/PagosMatriz";
import { ResumenNatillera } from "@/components/natillera/ResumenNatillera";
import { BackupPanel } from "@/components/natillera/BackupPanel";

export function NatilleraPage() {
  const {
    state,
    setNombre,
    setCuotaBase,
    setAnioActivo,
    addMiembro,
    updateMiembro,
    removeMiembro,
    upsertPago,
    removePago,
    resetTodo,
    exportarJSON,
    importarJSON,
  } = useNatillera();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-6 text-[var(--color-primary)]" />
            {state.nombre}
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Control mensual de aportes. Los datos viven solo en este navegador (localStorage) —
            exporta un JSON si quieres respaldar o pasar a otro equipo.
          </p>
        </div>
        <BackupPanel onExport={exportarJSON} onImport={importarJSON} onReset={resetTodo} />
      </div>

      <ResumenNatillera
        miembros={state.miembros}
        pagos={state.pagos}
        anio={state.anioActivo}
        cuotaBase={state.cuotaBase}
      />

      <ConfigNatillera
        nombre={state.nombre}
        cuotaBase={state.cuotaBase}
        anioActivo={state.anioActivo}
        onSave={({ nombre, cuotaBase, anioActivo }) => {
          setNombre(nombre);
          setCuotaBase(cuotaBase);
          setAnioActivo(anioActivo);
        }}
      />

      <MiembrosManager
        miembros={state.miembros}
        cuotaBase={state.cuotaBase}
        onAdd={addMiembro}
        onUpdate={updateMiembro}
        onRemove={removeMiembro}
      />

      <PagosMatriz
        miembros={state.miembros}
        pagos={state.pagos}
        anio={state.anioActivo}
        cuotaBase={state.cuotaBase}
        onUpsert={upsertPago}
        onRemove={removePago}
      />
    </div>
  );
}
