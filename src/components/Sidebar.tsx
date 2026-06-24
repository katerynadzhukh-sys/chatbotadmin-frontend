import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";

interface NavItem {
  label: string;
  icon: string;
  to?: string;
}

interface SidebarProps {
  onLogout: () => void;
}

const navItems: NavItem[] = [
  { label: "Widgets", icon: "grid_view", to: "/" },
  { label: "Statistiken", icon: "bar_chart", to: "/statistiken" },
];

export function Sidebar({ onLogout }: SidebarProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 p-4 bg-surface dark:bg-inverse-surface border-r border-outline-variant z-50">
      <div className="flex items-center gap-3 mb-10 px-2">
        <Icon name="smart_toy" className="text-primary" style={{ fontSize: 32 }} />
        <h1 className="text-headline-md font-bold text-primary">ChatBot Admin</h1>
      </div>
      <nav className="flex flex-col gap-2 flex-grow">
        {navItems.map((item) => {
          const active =
            (item.to === "/" && (location.pathname === "/" || location.pathname.startsWith("/widgets"))) ||
            (item.to !== "/" && !!item.to && location.pathname.startsWith(item.to));
          const className = active
            ? "flex items-center gap-4 px-4 py-3 bg-primary text-on-primary rounded-full transition-all duration-200 ease-in-out"
            : "flex items-center gap-4 px-4 py-3 text-on-surface-variant dark:text-surface-variant hover:bg-secondary-container dark:hover:bg-secondary rounded-full transition-all duration-200 ease-in-out";

          if (item.to) {
            return (
              <Link key={item.label} to={item.to} className={className}>
                <Icon name={item.icon} />
                <span className={active ? "font-label-sm" : "font-body-base"}>{item.label}</span>
              </Link>
            );
          }

          return (
            <button key={item.label} className={className}>
              <Icon name={item.icon} />
              <span className="font-body-base">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-outline-variant relative">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-2 right-2 mb-2 z-50 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg overflow-hidden">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-error hover:bg-secondary-container transition-colors"
              >
                <Icon name="logout" style={{ fontSize: 18 }} />
                Abmelden
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-3 px-2 py-1 w-full rounded-lg hover:bg-secondary-container transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden border-2 border-surface shadow-sm shrink-0">
            <span className="text-on-primary-container text-sm font-semibold">AU</span>
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-sm font-semibold">Admin User</span>
            <span className="text-xs text-on-surface-variant">online</span>
          </div>
          <Icon name="expand_more" className="text-on-surface-variant shrink-0" style={{ fontSize: 18 }} />
        </button>
      </div>
    </aside>
  );
}
