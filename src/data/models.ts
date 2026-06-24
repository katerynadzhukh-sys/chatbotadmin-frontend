export interface LanguageModel {
  id: string;
  ownedBy: string;
  created: number;
}

interface ModelsResponse {
  models?: LanguageModel[];
  error?: string;
}

let cache: LanguageModel[] | null = null;
let inflight: Promise<LanguageModel[]> | null = null;

/**
 * Lädt die Liste der verfügbaren Sprachmodelle vom Backend-Proxy (/api/models).
 * Das Ergebnis wird gecacht, damit die Modelle nicht bei jedem Fokus neu geladen
 * werden. `force` umgeht den Cache (z. B. für einen Reload-Button).
 */
export async function fetchModels(force = false): Promise<LanguageModel[]> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/models");
    const data: ModelsResponse = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      throw new Error(data.error || `Anfrage fehlgeschlagen (HTTP ${res.status})`);
    }

    cache = data.models ?? [];
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
