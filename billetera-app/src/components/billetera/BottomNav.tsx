import { NavLink } from "react-router-dom";
import { Wallet, ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, BarChart3 } from "lucide-react";

const items = [
  { to: "/", label: "Inicio", icon: Wallet, end: true },
  { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, end: false },
  { to: "/analisis", label: "Análisis", icon: BarChart3, end: false },
  { to: "/por-pagar", label: "Por pagar", icon: ArrowUpCircle, end: false },
  { to: "/por-cobrar", label: "Por cobrar", icon: ArrowDownCircle, end: false },
];

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-[960px]">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                ].join(" ")
              }
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
