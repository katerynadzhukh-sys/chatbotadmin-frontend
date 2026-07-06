import { widgets as initialWidgets } from "./widgets";
import type { Widget, WidgetConfig } from "../types/widget";

const STORAGE_KEY = "chatbotadmin.widgets";

/** Öffentliche, präsentationsbezogene Konfiguration (für widget.js / Standalone-Seite). */
export interface PublicWidgetConfig {
  id: string;
  status: string;
  knowledgeBaseId: string;
  routing: string;
  title: string;
  greeting: string;
  accentColor: string;
  position: string;
  icon: string;
  templates: string[];
  rules: string[];
  startPrompt: string;
  feedbackButtons: boolean;
  maxTokens?: number;
}

export function createDefaultConfig(): WidgetConfig {
  return {
    startPrompt: "Du bist ein hilfreicher Assistent. Beantworte Fragen freundlich und sachlich.",
    templates: [],
    rules: [],
    saveHistory: true,
    feedbackButtons: true,
    rateLimitPerMinute: 15,
    rateLimitPerUserPerDay: 75,
    maxTokensPerAnswer: 2000,
    title: "ChatBot",
    greeting: "Hallo! Wie kann ich dir helfen?",
    accentColor: "#0052ff",
    position: "bottom-right",
  };
}

/** Lädt alle Widgets aus dem LocalStorage (oder die Initialdaten). */
export async function fetchWidgets(): Promise<Widget[]> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialWidgets;

    const parsed = JSON.parse(stored) as Widget[];
    return parsed.map((widget) => ({
      ...widget,
      // Altdaten migrieren: früher hieß das Feld `kbId`. Fehlt beides, "" statt
      // undefined, damit Consumer (z. B. ModelCombobox) nicht auf undefined stoßen.
      knowledgeBaseId: widget.knowledgeBaseId ?? (widget as { kbId?: string }).kbId ?? "",
      config: { ...createDefaultConfig(), ...widget.config },
    }));
  } catch {
    return initialWidgets;
  }
}

/** 
 * Lädt die öffentliche Konfiguration eines Widgets (für die Standalone-Seite /w/:id). 
 * Im LocalStorage-Modus suchen wir einfach in der Liste.
 */
export async function fetchPublicConfig(id: string): Promise<PublicWidgetConfig | null> {
  const all = await fetchWidgets();
  const w = all.find((item) => item.id === id);
  if (!w) return null;

  return {
    id: w.id,
    status: w.status,
    knowledgeBaseId: w.knowledgeBaseId,
    routing: w.routing,
    title: w.config.title,
    greeting: w.config.greeting,
    accentColor: w.config.accentColor,
    position: w.config.position,
    icon: w.icon,
    templates: w.config.templates,
    rules: w.config.rules.filter(r => r.enabled).map(r => r.text),
    startPrompt: w.config.startPrompt,
    feedbackButtons: w.config.feedbackButtons,
    maxTokens: w.config.maxTokensPerAnswer,
  };
}

/** Speichert ein Widget im LocalStorage. */
export async function saveWidget(widget: Widget): Promise<Widget> {
  const all = await fetchWidgets();
  const index = all.findIndex((w) => w.id === widget.id);
  
  let updated: Widget[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = widget;
  } else {
    updated = [...all, widget];
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return widget;
}
