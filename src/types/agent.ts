// Agent (Ebene 1) — die wiederverwendbare „Denkschicht". Ein Agent wird einmal
// definiert und von beliebig vielen Konnektoren (Ebene 3) referenziert. Die
// Präsentations-/Vorlagen-Belange gehören zum Konnektor, nicht hierher.

/** Eine konfigurierbare Verhaltensregel (nur aktive Regeln fließen in den Prompt). */
export interface AgentRule {
  text: string;
  enabled: boolean;
}

/**
 * MVP-Platzhalter: Tools und Wissen (RAG) sind im Architektur-Plan (Ebene 1)
 * vorgesehen, aber noch nicht modelliert. Bewusst offen gehalten, damit die
 * Struktur schon steht und später ohne Umbau typisiert werden kann.
 *
 * Tools gibt es laut Plan in zwei Ausprägungen: `native` (intern implementierte
 * Aktionen) und `mcp` (Tools von MCP-Servern aus dem globalen, admin-verwalteten
 * Registry; Nutzer wählen nur aus freigegebenen Servern, konfigurieren sie nicht
 * selbst). Beides wird erst bei der Umsetzung des Tools-Tabs typisiert.
 */
export type AgentTool = Record<string, unknown>;
export type AgentKnowledgeSource = Record<string, unknown>;

export interface Agent {
  id: string;
  name: string;
  /** Modell-/Routing-ID. Entspricht dem früheren `knowledgeBaseId` im Widget. */
  model: string;
  /** System-Prompt (früher `config.startPrompt` im Widget). */
  systemPrompt: string;
  rules: AgentRule[];
  maxTokens: number;
  tools: AgentTool[];
  knowledge: AgentKnowledgeSource[];
}
