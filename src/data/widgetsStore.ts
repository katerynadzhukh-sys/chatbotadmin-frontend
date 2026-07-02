import type { Widget, WidgetConfig } from "../types/widget";

const API = "/api/widgets";

/** Öffentliche, präsentationsbezogene Konfiguration (vom Backend für widget.js / Standalone-Seite). */
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

/** Lädt alle Widgets vom Backend (Quelle der Wahrheit, persistent). */
export async function fetchWidgets(): Promise<Widget[]> {
  const res = await fetch(API);
  const data = (await res.json().catch(() => ({}))) as { widgets?: Widget[]; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `Widgets konnten nicht geladen werden (HTTP ${res.status})`);
  }
  return data.widgets ?? [];
}

/**
 * Lädt die öffentliche Konfiguration eines Widgets (für die Standalone-Seite /w/:id).
 * Gibt `null` zurück, wenn das Widget nicht existiert (HTTP 404).
 */
export async function fetchPublicConfig(id: string): Promise<PublicWidgetConfig | null> {
  const res = await fetch(`${API}/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  const data = (await res.json().catch(() => ({}))) as PublicWidgetConfig & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `Widget konnte nicht geladen werden (HTTP ${res.status})`);
  }
  return data;
}

/** Legt ein Widget an oder aktualisiert es (per ID). Gibt das gespeicherte Widget zurück. */
export async function saveWidget(widget: Widget): Promise<Widget> {
  const res = await fetch(`${API}/${encodeURIComponent(widget.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  });
  const data = (await res.json().catch(() => ({}))) as Widget & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `Speichern fehlgeschlagen (HTTP ${res.status})`);
  }
  return data;
}
