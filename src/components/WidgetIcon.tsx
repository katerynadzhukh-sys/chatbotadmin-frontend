import { Bot } from "lucide-react";
import { WIDGET_ICONS } from "./widgetOptions";

/**
 * Rendert ein Widget-Icon aus der Lucide-Bibliothek anhand seines Schlüssels.
 * Fällt auf `Bot` zurück, falls der Name unbekannt ist.
 */
export function WidgetIcon({
  name,
  className,
  size = 24,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  const Cmp = WIDGET_ICONS[name] ?? Bot;
  return <Cmp className={className} size={size} aria-hidden />;
}
