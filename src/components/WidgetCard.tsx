import { Link } from "react-router-dom";
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

interface WidgetCardProps {
  widget: Widget;
}

export function WidgetCard({ widget }: WidgetCardProps) {
  const accent = accentClasses[widget.accent];
  const status = statusClasses[widget.status];
  const rating = widget.stats.rating.toFixed(1).replace(".", ",");

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex flex-col">
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
          <Icon name="smart_toy" className="text-sm" />
          <span className="font-label-sm text-xs truncate">{widget.knowledgeBaseId}</span>
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
        <Link
          to={`/widgets/${widget.id}`}
          className="flex flex-col items-center justify-center gap-1 min-w-0 w-full px-1 py-1.5 border border-outline-variant rounded-lg font-mono text-[10px] leading-tight text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <Icon name="settings" className="text-sm" />
          <span className="w-full text-center break-words">Einstellungen</span>
        </Link>
        <button className="flex flex-col items-center justify-center gap-1 min-w-0 w-full px-1 py-1.5 border border-outline-variant rounded-lg font-mono text-[10px] text-on-surface hover:bg-surface-container-high transition-colors">
          <Icon name="chat" className="text-sm" />
          <span className="truncate w-full text-center">Chatbox</span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 min-w-0 w-full px-1 py-1.5 border border-outline-variant rounded-lg font-mono text-[10px] text-on-surface hover:bg-surface-container-high transition-colors">
          <Icon name="code" className="text-sm" />
          <span className="truncate w-full text-center">Einbetten</span>
        </button>
      </div>
    </div>
  );
}
