import { apiFetch } from "../auth/api";
import type { Agent } from "../types/agent";

/**
 * Agent-Store — spricht das Go-Backend (internal/agents) über apiFetch an.
 * Quelle der Wahrheit für die Denkschicht (Modell, System-Prompt, Regeln,
 * Max-Tokens). Konnektoren verweisen nur per `agentId` hierauf.
 *
 *   GET    /api/agents        – Liste für die Admin-UI
 *   PUT    /api/agents/:id     – anlegen/aktualisieren
 *   DELETE /api/agents/:id     – löschen (nur Superadmin; 409, wenn noch verwendet)
 */

/** Liefert einen neuen Agenten mit sinnvollen Defaults (für „Neuer Agent"). */
export function createDefaultAgent(id: string): Agent {
  return {
    id,
    name: "",
    model: "",
    systemPrompt: "Du bist ein hilfreicher Assistent. Beantworte Fragen freundlich und sachlich.",
    rules: [],
    maxTokens: 2000,
    tools: [],
    knowledge: [],
  };
}

/**
 * Füllt fehlende Felder defensiv auf, damit Consumer nicht auf undefined stoßen
 * (analog zu fetchWidgets). Das Backend liefert normalerweise vollständige
 * Objekte; diese Normalisierung schützt vor Teil-/Altdaten.
 */
function normalizeAgent(raw: Partial<Agent> & { id: string }): Agent {
  return {
    id: raw.id,
    name: raw.name ?? "",
    model: raw.model ?? "",
    systemPrompt: raw.systemPrompt ?? "",
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    maxTokens: typeof raw.maxTokens === "number" ? raw.maxTokens : 2000,
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    knowledge: Array.isArray(raw.knowledge) ? raw.knowledge : [],
  };
}

/** Lädt alle Agenten (GET /api/agents). */
export async function fetchAgents(): Promise<Agent[]> {
  const res = await apiFetch("/api/agents");
  if (!res.ok) throw new Error(`Agenten konnten nicht geladen werden (HTTP ${res.status})`);
  const data = (await res.json()) as { agents?: (Partial<Agent> & { id: string })[] };
  return (data.agents ?? []).map(normalizeAgent);
}

/** Legt einen Agenten an oder aktualisiert ihn (PUT /api/agents/:id). */
export async function saveAgent(agent: Agent): Promise<Agent> {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Speichern fehlgeschlagen (HTTP ${res.status})`);
  }
  return normalizeAgent((await res.json()) as Partial<Agent> & { id: string });
}

/**
 * Löscht einen Agenten (DELETE /api/agents/:id). Nur Superadmins dürfen das.
 * Das Backend antwortet mit 409, wenn noch ein Konnektor auf den Agenten
 * verweist – die Meldung wird unverändert durchgereicht.
 */
export async function deleteAgent(id: string): Promise<void> {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Löschen fehlgeschlagen (HTTP ${res.status})`);
  }
}

/**
 * Zählt je Agent-ID, wie viele Konnektoren darauf verweisen – für das Badge
 * „Verwendet von N" in der Agent-Liste. Reine Funktion (leicht testbar); nimmt
 * bewusst nur das Minimum an Widget-Form entgegen, um nicht zu koppeln.
 */
export function agentUsageByWidgets(widgets: { agentId?: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of widgets) {
    if (w.agentId) counts[w.agentId] = (counts[w.agentId] ?? 0) + 1;
  }
  return counts;
}
