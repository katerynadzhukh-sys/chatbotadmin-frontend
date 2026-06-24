import { Icon } from "./Icon";

interface BottomNavItem {
  label: string;
  icon: string;
  active?: boolean;
}

const navItems: BottomNavItem[] = [
  { label: "Widgets", icon: "grid_view", active: true },
  { label: "Statistiken", icon: "bar_chart" },
  { label: "Einstellungen", icon: "settings" },
];

export function BottomNavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant px-6 py-3 flex justify-between items-center z-50 lg:hidden">
      {navItems.map((item) => (
        <button
          key={item.label}
          className={
            item.active
              ? "flex flex-col items-center gap-1 text-primary"
              : "flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
          }
        >
          <Icon name={item.icon} />
          <span className="font-label-sm text-[10px]">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
