import {
  Bot,
  Languages,
  LineChart,
  Headset,
  MessageSquare,
  Brain,
  Sparkles,
  Headphones,
  Globe,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { WidgetPosition } from "../types/widget";

export const POSITION_OPTIONS: { value: WidgetPosition; label: string }[] = [
  { value: "bottom-right", label: "Unten rechts" },
  { value: "bottom-left", label: "Unten links" },
  { value: "top-right", label: "Oben rechts" },
  { value: "top-left", label: "Oben links" },
];

/**
 * Auswählbare Widget-Icons aus der Lucide-Bibliothek (https://lucide.dev).
 * Gespeichert wird der String-Schlüssel (z. B. "Bot") im Feld `widget.icon`.
 */
export const WIDGET_ICONS: Record<string, LucideIcon> = {
  Bot,
  Languages,
  LineChart,
  Headset,
  MessageSquare,
  Brain,
  Sparkles,
  Headphones,
  Globe,
  MessageCircle,
};

export const ICON_OPTIONS = Object.keys(WIDGET_ICONS);
