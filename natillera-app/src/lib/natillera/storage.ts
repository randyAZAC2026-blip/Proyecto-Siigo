import { useCallback, useEffect, useState } from "react";
import {
  natilleraStateSchema,
  type Miembro,
  type NatilleraState,
  type Pago,
} from "@/lib/natillera/types";

const STORAGE_KEY = "natillera:v1";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function initialState(): NatilleraState {
  const anio = new Date().getFullYear();
  return {
    version: 1,
    nombre: "Mi natillera",
    cuotaBase: 50000,
    anioActivo: anio,
    miembros: [],
    pagos: [],
  };
}

function loadFromStorage(): NatilleraState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = natilleraStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return initialState();
    return parsed.data;
  } catch {
    return initialState();
  }
}

function saveToStorage(state: NatilleraState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useNatillera() {
  const [state, setState] = useState<NatilleraState>(() => loadFromStorage());

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const setNombre = useCallback((nombre: string) => {
    setState((prev) => ({ ...prev, nombre }));
  }, []);

  const setCuotaBase = useCallback((cuotaBase: number) => {
    setState((prev) => ({ ...prev, cuotaBase }));
  }, []);

  const setAnioActivo = useCallback((anioActivo: number) => {
    setState((prev) => ({ ...prev, anioActivo }));
  }, []);

  const addMiembro = useCallback(
    (input: { nombre: string; cuotaMensual: number; notas?: string }) => {
      setState((prev) => {
        const miembro: Miembro = {
          id: makeId(),
          nombre: input.nombre.trim(),
          cuotaMensual: input.cuotaMensual,
          activo: true,
          notas: input.notas?.trim() || undefined,
          creadoEn: new Date().toISOString(),
        };
        return { ...prev, miembros: [...prev.miembros, miembro] };
      });
    },
    [],
  );

  const addMiembrosBulk = useCallback(
    (
      inputs: { nombre: string; cuotaMensual: number; notas?: string }[],
    ): { agregados: number; omitidos: number } => {
      let agregados = 0;
      let omitidos = 0;
      setState((prev) => {
        const nombresExistentes = new Set(
          prev.miembros.map((m) => m.nombre.trim().toLowerCase()),
        );
        const nuevos: Miembro[] = [];
        for (const input of inputs) {
          const nombreLimpio = input.nombre.trim();
          const claveNombre = nombreLimpio.toLowerCase();
          if (!nombreLimpio || nombresExistentes.has(claveNombre)) {
            omitidos++;
            continue;
          }
          nombresExistentes.add(claveNombre);
          nuevos.push({
            id: makeId(),
            nombre: nombreLimpio,
            cuotaMensual: input.cuotaMensual,
            activo: true,
            notas: input.notas?.trim() || undefined,
            creadoEn: new Date().toISOString(),
          });
          agregados++;
        }
        if (nuevos.length === 0) return prev;
        return { ...prev, miembros: [...prev.miembros, ...nuevos] };
      });
      return { agregados, omitidos };
    },
    [],
  );

  const updateMiembro = useCallback(
    (id: string, patch: Partial<Omit<Miembro, "id" | "creadoEn">>) => {
      setState((prev) => ({
        ...prev,
        miembros: prev.miembros.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
    },
    [],
  );

  const removeMiembro = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      miembros: prev.miembros.filter((m) => m.id !== id),
      pagos: prev.pagos.filter((p) => p.miembroId !== id),
    }));
  }, []);

  const upsertPago = useCallback(
    (input: {
      miembroId: string;
      anio: number;
      mes: number;
      monto: number;
      fechaPago?: string;
      notas?: string;
    }) => {
      setState((prev) => {
        const existente = prev.pagos.find(
          (p) => p.miembroId === input.miembroId && p.anio === input.anio && p.mes === input.mes,
        );
        const fechaPago = input.fechaPago ?? new Date().toISOString().slice(0, 10);
        const pago: Pago = existente
          ? {
              ...existente,
              monto: input.monto,
              fechaPago,
              notas: input.notas?.trim() || existente.notas,
            }
          : {
              id: makeId(),
              miembroId: input.miembroId,
              anio: input.anio,
              mes: input.mes,
              monto: input.monto,
              fechaPago,
              notas: input.notas?.trim() || undefined,
            };
        const pagos = existente
          ? prev.pagos.map((p) => (p.id === existente.id ? pago : p))
          : [...prev.pagos, pago];
        return { ...prev, pagos };
      });
    },
    [],
  );

  const removePago = useCallback((miembroId: string, anio: number, mes: number) => {
    setState((prev) => ({
      ...prev,
      pagos: prev.pagos.filter(
        (p) => !(p.miembroId === miembroId && p.anio === anio && p.mes === mes),
      ),
    }));
  }, []);

  const resetTodo = useCallback(() => {
    setState(initialState());
  }, []);

  const exportarJSON = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importarJSON = useCallback((raw: string) => {
    const parsed = natilleraStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error("El archivo no tiene el formato esperado.");
    }
    setState(parsed.data);
  }, []);

  return {
    state,
    setNombre,
    setCuotaBase,
    setAnioActivo,
    addMiembro,
    addMiembrosBulk,
    updateMiembro,
    removeMiembro,
    upsertPago,
    removePago,
    resetTodo,
    exportarJSON,
    importarJSON,
  };
}

export function findPago(pagos: Pago[], miembroId: string, anio: number, mes: number) {
  return pagos.find((p) => p.miembroId === miembroId && p.anio === anio && p.mes === mes);
}
