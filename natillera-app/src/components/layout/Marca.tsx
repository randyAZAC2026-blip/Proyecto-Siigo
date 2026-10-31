import { PiggyBank } from "lucide-react";

/** Logo de la natillera: alcancía sobre un cuadro verde. */
export function Marca({ chica = false }: { chica?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#3f9a6c] to-[#2e6b4c] text-white shadow-sm ring-1 ring-white/10 ${
        chica ? "size-8" : "size-9"
      }`}
      aria-hidden
    >
      <PiggyBank className={chica ? "size-4" : "size-[18px]"} />
    </span>
  );
}

/** Círculo con las iniciales de la persona (máximo dos letras). */
export function Iniciales({ nombre, chica = false }: { nombre: string; chica?: boolean }) {
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-white/10 font-semibold text-white ring-1 ring-white/15 ${
        chica ? "size-7 text-[10px]" : "size-8 text-[11px]"
      }`}
      aria-hidden
    >
      {letras || "?"}
    </span>
  );
}
