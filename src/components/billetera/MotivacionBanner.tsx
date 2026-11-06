import { useMemo } from "react";
import { Music2 } from "lucide-react";

// Frases ORIGINALES escritas al estilo del corrido norteño: trabajo honrado,
// disciplina con el dinero, familia, perseverancia. NO son letras literales
// de ningún grupo o canción — se evita cualquier problema de copyright.
const FRASES = [
  "El billete no se encuentra en la calle, se levanta con el sudor del día.",
  "No le tema al trabajo, tema a contar lo que no ganó.",
  "Cada peso que entra tiene nombre: respeto.",
  "Pa'lante, mi gente, que las cuentas claras no engañan a nadie.",
  "Hoy se trabaja pa' que mañana no toque pedir prestado.",
  "La plata honrada no grita, pero se ve en los hechos.",
  "El que no lleva cuenta no sabe cuándo está perdiendo.",
  "Al que se cae le dicen caído; al que se levanta le dicen hombre.",
  "Las deudas se pagan, las promesas también.",
  "No se trata de tener más, se trata de no perder lo que ya se tiene.",
  "Los sueños no se compran, se van ahorrando moneda a moneda.",
  "El que anota lo que gasta, no se engaña solo.",
  "Pa' llegar lejos hay que empezar temprano y no soltar el paso.",
  "Dinero bien ganado alcanza más que dinero mal contado.",
  "La familia come antes que el capricho.",
  "Donde hay disciplina, no falta el pan.",
  "El que planea el mes, no se asusta en el día veinte.",
  "Un peso guardado hoy es una preocupación menos mañana.",
  "No hay enemigo más grande del progreso que la pereza.",
  "Las cuentas en orden son la mejor armadura.",
];

function fraseDelDia(): string {
  // Índice determinista por día: la frase cambia cada 24h pero es estable
  // dentro del mismo día (no "parpadea" al navegar entre pantallas).
  const dias = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return FRASES[dias % FRASES.length];
}

export function MotivacionBanner() {
  const frase = useMemo(() => fraseDelDia(), []);

  return (
    <div className="glass-card relative overflow-hidden rounded-[var(--radius-card)] px-5 py-4">
      {/* Línea luminosa decorativa arriba */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--neon-primary)] to-transparent opacity-60" />
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--neon-primary)]/15 text-[var(--neon-primary)]">
          <Music2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Al estilo del corrido norteño
          </p>
          <p className="mt-1 text-base font-medium leading-snug text-[var(--color-text)]">
            «{frase}»
          </p>
        </div>
      </div>
    </div>
  );
}
