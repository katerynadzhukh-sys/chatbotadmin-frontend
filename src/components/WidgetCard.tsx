import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "./Icon";
import { WidgetIcon } from "./WidgetIcon";
import type { Widget } from "../types/widget";

const accentClasses: Record<Widget["accent"], { iconBg: string; iconText: string }> = {
  primary: { iconBg: "bg-primary/10", iconText: "text-primary" },
  secondary: { iconBg: "bg-secondary/10", iconText: "text-secondary" },
};

const statusClasses: Record<Widget["status"], { badge: string; dot: string; label: string }> = {
  active: { badge: "bg-primary/10 text-primary", dot: "bg-primary", label: "Aktiv" },
  paused: { badge: "bg-surface-container-highest text-on-surface-variant", dot: "bg-on-surface-variant", label: "Pause" },
};

// Die drei identischen Footer-Buttons (Einstellungen / Chatbox / Einbetten).
// `path` wird an `/widgets/${id}` angehängt; `wrap` steuert break-words vs. truncate.
const footerActions: { path: string; icon: string; label: string; wrap: boolean; tight: boolean }[] = [
  { path: "", icon: "settings", label: "Einstellungen", wrap: true, tight: true },
  { path: "/gespraeche", icon: "chat", label: "Chatbox", wrap: false, tight: false },
  { path: "/einbetten", icon: "code", label: "Einbetten", wrap: false, tight: false },
];

interface WidgetCardProps {
  widget: Widget;
  /** Name des verknüpften Agenten (aufgelöst aus agentId). */
  agentName?: string;
}

export function WidgetCard({ widget, agentName }: WidgetCardProps) {
  const accent = accentClasses[widget.accent];
  const status = statusClasses[widget.status];
  const rating = widget.stats.rating.toFixed(1).replace(".", ",");

  return (
    <Card className="p-4 hover:shadow-card-hover hover:-translate-y-1 transition-all flex flex-col">
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 ${accent.iconBg} rounded-xl flex items-center justify-center`}>
          <WidgetIcon name={widget.icon} className={accent.iconText} />
        </div>
        <div className={`flex items-center gap-1.5 ${status.badge} px-2.5 py-1 rounded-full text-label-sm font-bold`}>
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          {status.label}
        </div>
      </div>

      <div className="mb-3">
        <h4 className="font-headline-md text-base font-bold">{widget.name}</h4>
        <div className="flex items-center gap-2 text-on-surface-variant mt-1">
          <Icon name="psychology" className="text-sm" />
          <span className="font-label-sm text-xs truncate">{agentName || "kein Agent"}</span>
        </div>
      </div>

      <div className="border-t border-outline-variant/30 my-3" />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-on-surface-variant truncate">Routing</span>
          <span className="font-semibold text-sm truncate">{widget.routing}</span>
        </div>
        <div className="flex flex-col min-w-0 border-l border-outline-variant/30 pl-2">
          <span className="text-xs text-on-surface-variant truncate">Gespräche</span>
          <span className="font-semibold text-sm truncate">{widget.stats.conversations}</span>
        </div>
        <div className="flex flex-col min-w-0 border-l border-outline-variant/30 pl-2">
          <span className="text-xs text-on-surface-variant truncate">Bewertung</span>
          <span className="font-semibold text-sm truncate">{rating} / 5</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 mt-auto">
        {footerActions.map((action) => (
          <Button
            key={action.path}
            asChild
            variant="outline"
            size="sm"
            className={`flex-col gap-1 min-w-0 w-full px-1 py-1.5 font-mono text-[10px]${action.tight ? " leading-tight" : ""}`}
          >
            <Link to={`/widgets/${widget.id}${action.path}`}>
              <Icon name={action.icon} className="text-sm" />
              <span className={`w-full text-center ${action.wrap ? "break-words" : "truncate"}`}>
                {action.label}
              </span>
            </Link>
          </Button>
        ))}
      </div>
    </Card>
  );
}
