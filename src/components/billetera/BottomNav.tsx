import { NavLink } from "react-router-dom";
import { Wallet, ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, Calculator } from "lucide-react";

const items = [
  { to: "/", label: "Inicio", icon: Wallet, end: true },
  { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, end: false },
  { to: "/por-pagar", label: "Por pagar", icon: ArrowUpCircle, end: false },
  { to: "/por-cobrar", label: "Por cobrar", icon: ArrowDownCircle, end: false },
  { to: "/asesor", label: "Tributario", icon: Calculator, end: false },
];

export function BottomNav() {
  return (
    <nav
      className="sticky bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
      style={{
        background: "var(--glass-bg)",
        borderTop: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <ul className="mx-auto flex max-w-[960px]">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  isActive
                    ? "text-[var(--neon-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="pointer-events-none absolute inset-x-6 top-0 h-px"
                      style={{
                        background:
                          "linear-gradient(to right, transparent, var(--neon-primary), transparent)",
                      }}
                    />
                  )}
                  <Icon className="size-5" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
