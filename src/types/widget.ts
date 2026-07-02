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
  startPrompt: string;
  templates: string[];
  rules: WidgetRule[];
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
  knowledgeBaseId: string;
  routing: string;
  status: WidgetStatus;
  icon: string;
  accent: WidgetAccent;
  stats: WidgetStats;
  config: WidgetConfig;
}
