import { useCurrentUser } from "../hooks/useCurrentUser";
import { Icon } from "./Icon";

interface TopAppBarProps {
  title: string;
}

export function TopAppBar({ title }: TopAppBarProps) {
  const user = useCurrentUser();

  return (
    <header className="bg-surface-container-lowest dark:bg-inverse-surface border-b border-outline-variant dark:border-outline shadow-sm dark:shadow-none top-0 z-40 sticky">
      <div className="flex justify-between items-center px-gutter py-4 w-full max-w-container-max mx-auto">
        <div className="flex items-center gap-3 lg:hidden">
          <Icon name="smart_toy" className="text-primary dark:text-primary-fixed" style={{ fontSize: 28 }} />
          <h1 className="text-headline-md-mobile font-headline-md-mobile font-bold text-on-surface dark:text-inverse-on-surface">
            ChatBot Admin
          </h1>
        </div>
        <div className="hidden lg:block">
          <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
            <Icon name="notifications" />
          </button>
          <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden border-2 border-surface shadow-sm transition-transform scale-95 active:scale-90 lg:hidden">
            <span className="text-on-primary-container text-xs font-semibold">
              {user?.initials ?? "?"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
