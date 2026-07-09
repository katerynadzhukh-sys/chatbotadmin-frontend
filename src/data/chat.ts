import { apiFetch } from "../auth/api";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  finishReason: string | null;
}

interface ChatResponse {
  reply?: string;
  finishReason?: string | null;
  error?: string;
}

/**
 * Sendet einen Chat-Verlauf an den Backend-Proxy (/api/chat) und streamt die vom
 * gewählten Sprachmodell generierte Antwort Token für Token. Der Go-Backend-Proxy
 * ruft serverseitig (mit angehängtem JWT) den HRZ-Endpunkt auf. `onToken` wird für
 * jedes Textstück aufgerufen; der vollständige Text wird zusätzlich im Ergebnis
 * zurückgegeben.
 */
export async function streamChatMessage(
  params: {
    knowledgeBaseId: string;
    messages: ChatMessage[];
    maxTokens?: number;
    widgetId?: string;
    /** Bricht die Anfrage ab (z. B. bei Reset/Unmount); danach werden keine Tokens mehr geliefert. */
    signal?: AbortSignal;
  },
  onToken: (chunk: string) => void,
): Promise<ChatResult> {
  const { signal, knowledgeBaseId, ...rest } = params;
  const res = await apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...rest,
      model: knowledgeBaseId, // Go-Backend erwartet "model"
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const data: ChatResponse = await res.json().catch(() => ({}));
    throw new Error(data.error || `Anfrage fehlgeschlagen (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let finishReason: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE-Events sind durch eine Leerzeile getrennt.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      const data: { content?: string; error?: string; done?: boolean; finishReason?: string | null } =
        JSON.parse(payload);

      if (data.error) throw new Error(data.error);
      if (data.content) {
        reply += data.content;
        onToken(data.content);
      }
      if (data.done) finishReason = data.finishReason ?? null;
    }
  }

  return { reply, finishReason };
}
