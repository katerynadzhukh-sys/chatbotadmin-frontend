import { Link } from "react-router-dom";
import { Icon } from "./Icon";

export function AddWidgetCard() {
  return (
    <Link
      to="/widgets/new"
      className="border-2 border-dashed border-outline-variant rounded-xl p-4 flex flex-col items-center justify-center text-on-surface-variant hover:border-primary hover:text-primary transition-all cursor-pointer group bg-surface-container-low/50"
    >
      <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <Icon name="add" className="text-[28px]" />
      </div>
      <span className="font-headline-md text-base font-bold">Konnektor hinzufügen</span>
      <p className="text-xs mt-1 opacity-70 text-center">Neuen Front (Widget) anlegen</p>
    </Link>
  );
}
