import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../auth/api";
import {
  agentUsageByWidgets,
  createDefaultAgent,
  deleteAgent,
  fetchAgents,
  saveAgent,
} from "./agentsStore";
import type { Agent } from "../types/agent";

// Der Store spricht das Backend ausschließlich über apiFetch an – hier gemockt,
// damit die Tests kein echtes Netzwerk/Backend brauchen.
vi.mock("../auth/api", () => ({ apiFetch: vi.fn() }));
const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return { ...createDefaultAgent("a1"), name: "Test Agent", model: "kb-1", ...overrides };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("createDefaultAgent", () => {
  it("liefert sinnvolle Defaults mit leerem Modell und leeren Listen", () => {
    const a = createDefaultAgent("x");
    expect(a.id).toBe("x");
    expect(a.model).toBe("");
    expect(a.maxTokens).toBe(2000);
    expect(a.rules).toEqual([]);
    expect(a.tools).toEqual([]);
    expect(a.knowledge).toEqual([]);
  });
});

describe("fetchAgents", () => {
  it("ruft GET /api/agents ab und liefert die Agent-Liste", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ agents: [makeAgent({ id: "a" })] }));

    const agents = await fetchAgents();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/agents");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("a");
  });

  it("füllt fehlende Felder defensiv auf", async () => {
    // Nur id + name gesendet – Rest muss normalisiert werden.
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ agents: [{ id: "a", name: "Nur Name" }] }));

    const [a] = await fetchAgents();
    expect(a.model).toBe("");
    expect(a.maxTokens).toBe(2000);
    expect(a.rules).toEqual([]);
    expect(a.tools).toEqual([]);
    expect(a.knowledge).toEqual([]);
  });

  it("liefert ein leeres Array, wenn das Backend keine agents-Property sendet", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    await expect(fetchAgents()).resolves.toEqual([]);
  });

  it("wirft bei einer Fehlerantwort des Backends", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ error: "kaputt" }, { status: 500 }));
    await expect(fetchAgents()).rejects.toThrow(/HTTP 500/);
  });
});

describe("saveAgent", () => {
  it("sendet PUT an /api/agents/:id mit dem Agenten als Body", async () => {
    const agent = makeAgent({ id: "new-1", name: "Neu" });
    mockApiFetch.mockResolvedValueOnce(jsonResponse(agent));

    await saveAgent(agent);

    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/agents/new-1");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({ id: "new-1", name: "Neu" });
  });

  it("kodiert die id in der URL", async () => {
    const agent = makeAgent({ id: "a/b" });
    mockApiFetch.mockResolvedValueOnce(jsonResponse(agent));

    await saveAgent(agent);
    expect(mockApiFetch.mock.calls[0][0]).toBe("/api/agents/a%2Fb");
  });

  it("wirft mit der Backend-Fehlermeldung bei einer Fehlerantwort", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ error: "model is required" }, { status: 400 }),
    );
    await expect(saveAgent(makeAgent({ model: "" }))).rejects.toThrow("model is required");
  });
});

describe("deleteAgent", () => {
  it("sendet DELETE an /api/agents/:id", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(null, { status: 204 }));
    await deleteAgent("a1");
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/agents/a1");
    expect(init?.method).toBe("DELETE");
  });

  it("reicht die 409-Meldung durch, wenn der Agent noch verwendet wird", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: "Agent wird noch von einem oder mehreren Widgets verwendet und kann nicht gelöscht werden." },
        { status: 409 },
      ),
    );
    await expect(deleteAgent("a1")).rejects.toThrow(/noch von einem oder mehreren Widgets verwendet/);
  });
});

describe("agentUsageByWidgets", () => {
  it("zählt Verweise je Agent-ID und ignoriert Widgets ohne agentId", () => {
    const counts = agentUsageByWidgets([
      { agentId: "a1" },
      { agentId: "a1" },
      { agentId: "a2" },
      {}, // kein agentId → zählt nicht
    ]);
    expect(counts).toEqual({ a1: 2, a2: 1 });
  });
});
