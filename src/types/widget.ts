export type WidgetStatus = "active" | "paused";

export type WidgetAccent = "primary" | "secondary";

export type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface WidgetStats {
  conversations: number;
  rating: number;
}

export interface WidgetRule {
  text: string;
  enabled: boolean;
}

export interface WidgetConfig {
  apiKey: string;
  model: string;
  startPrompt: string;
  templates: string[];
  rules: WidgetRule[];
  minDialogDepth: number;
  maxDialogDepth: number;
  saveHistory: boolean;
  feedbackButtons: boolean;
  rateLimitPerMinute: number;
  rateLimitPerUserPerDay: number;
  maxTokensPerAnswer: number;
  title: string;
  greeting: string;
  accentColor: string;
  position: WidgetPosition;
}

export interface Widget {
  id: string;
  name: string;
  kbId: string;
  routing: string;
  status: WidgetStatus;
  icon: string;
  accent: WidgetAccent;
  stats: WidgetStats;
  config: WidgetConfig;
}
