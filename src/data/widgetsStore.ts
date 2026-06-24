import { widgets as initialWidgets } from "./widgets";
import type { Widget, WidgetConfig } from "../types/widget";

const STORAGE_KEY = "chatbotadmin.widgets";

export function createDefaultConfig(): WidgetConfig {
  return {
    apiKey: `sk-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    model: "",
    startPrompt: "Du bist ein hilfreicher Assistent. Beantworte Fragen freundlich und sachlich.",
    templates: [],
    rules: [],
    minDialogDepth: 1,
    maxDialogDepth: 8,
    saveHistory: true,
    feedbackButtons: true,
    rateLimitPerMinute: 15,
    rateLimitPerUserPerDay: 75,
    maxTokensPerAnswer: 400,
    title: "ChatBot",
    greeting: "Hallo! Wie kann ich dir helfen?",
    accentColor: "#0052ff",
    position: "bottom-right",
  };
}

export function loadWidgets(): Widget[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialWidgets;

    const parsed = JSON.parse(stored) as Widget[];
    return parsed.map((widget) => ({
      ...widget,
      config: { ...createDefaultConfig(), ...widget.config },
    }));
  } catch {
    return initialWidgets;
  }
}

export function saveWidgets(widgets: Widget[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}
