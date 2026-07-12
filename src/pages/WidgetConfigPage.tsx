import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WidgetConfigView } from "../components/WidgetConfigView";
import { createDefaultConfig, deleteWidget, fetchWidgets, saveWidget } from "../data/widgetsStore";
import { fetchAgents } from "../data/agentsStore";
import { useCurrentUser } from "../hooks/useCurrentUser";
import type { Widget, WidgetAccent, WidgetStatus } from "../types/widget";
import type { Agent } from "../types/agent";

function emptyWidget(id: string): Widget {
  return {
    id,
    name: "",
    knowledgeBaseId: "",
    routing: "public",
    status: "active",
    icon: "Globe",
    accent: "primary" as WidgetAccent,
    stats: { conversations: 0, rating: 0 },
    config: createDefaultConfig(),
  };
}

const WIDGET_BASE_URL = import.meta.env.VITE_WIDGET_BASE_URL || "https://ki-chat.uni-giessen.de";

function buildEmbedCode(widgetId: string, routing: string): string {
  // data-kb entfällt: das Modell kommt jetzt aus dem verknüpften Agenten, das
  // Backend löst es serverseitig auf (widget.js liest nur data-widget-id).
  return `<!-- 1. Globaler Loader (Einmalig im Theme / <head> einbinden) -->
<script src="${WIDGET_BASE_URL}/widget.js" defer></script>

<!-- 2. Widget-Platzhalter (Im Seiteninhalt einfügen) -->
<div class="chatbot-widget"
  data-widget-id="${widgetId || "widget-id"}"
  data-routing="${routing || "public"}-widget"
  data-lang="de"
></div>`;
}

function buildDirectUrl(widgetId: string): string {
  return `${WIDGET_BASE_URL}/w/${widgetId || "widget-id"}`;
}

export function WidgetConfigPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const currentUser = useCurrentUser();
  const canDelete = currentUser?.role === "superadmin";

  // Neue Widgets erhalten sofort eine unveränderliche UUID als ID. Sie wird nur
  // einmalig erzeugt (useState-Initializer) und bleibt danach fix – auch beim
  // Umbenennen. Das ist der stabile Identifier für Embed-Code und /w/:id.
  const [widget, setWidget] = useState<Widget>(() =>
    emptyWidget(isNew ? crypto.randomUUID() : id ?? ""),
  );
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Agenten für die Auswahl laden (der Konnektor verweist nur per agentId).
  useEffect(() => {
    let ignore = false;
    fetchAgents()
      .then((list) => {
        if (!ignore) setAgents(list);
      })
      .catch(() => {
        if (!ignore) setAgents([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Beim Bearbeiten das passende Widget vom Backend laden und setzen.
  useEffect(() => {
    if (isNew) return;
    let ignore = false;
    fetchWidgets()
      .then((list) => {
        if (ignore) return;
        const found = list.find((w) => w.id === id);
        if (found) setWidget(found);
      })
      .catch((err: unknown) => {
        if (!ignore) setSaveError(err instanceof Error ? err.message : "Unbekannter Fehler");
      });
    return () => {
      ignore = true;
    };
  }, [id, isNew]);

  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  // true direkt nach dem Speichern → Button zeigt "Gespeichert"; bei jeder
  // Änderung wieder false → Button zeigt erneut "Speichern"/"Erstellen".
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof Widget>(key: K, value: Widget[K]) => {
    setSaved(false);
    setWidget((current) => ({ ...current, [key]: value }));
  };

  const updateConfig = <K extends keyof Widget["config"]>(key: K, value: Widget["config"][K]) => {
    setSaved(false);
    setWidget((current) => ({ ...current, config: { ...current.config, [key]: value } }));
  };

  // Speichern, ohne die Karte zu schließen, damit der Nutzer den Chatbot hier
  // gleich testen kann. Beim Anlegen wechselt die URL auf die Bearbeiten-Route
  // des neuen Widgets (gleiche Route → Komponente bleibt montiert, `saved` bleibt).
  const handleSave = async () => {
    setSaveError(null);
    try {
      if (isNew) {
        if (!widget.name.trim() || !widget.agentId) return;
        const saved = await saveWidget(widget);
        setWidget(saved);
        setSaved(true);
        navigate(`/widgets/${saved.id}`, { replace: true });
      } else {
        const saved = await saveWidget(widget);
        setWidget(saved);
        setSaved(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  };

  const handleDelete = async () => {
    if (isNew) return;
    setSaveError(null);
    try {
      await deleteWidget(widget.id);
      // Zurück zur Übersicht, die den Bestand neu vom Backend lädt.
      navigate("/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  };

  const handleCopy = async (text: string, kind: "code" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const previewId = widget.id;

  return (
    <>
      {saveError ? (
        <div className="mx-auto mt-4 max-w-container-max px-gutter">
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {saveError}
          </div>
        </div>
      ) : null}
      <WidgetConfigView
      widget={widget}
      agents={agents}
      isNew={isNew}
      isActive={widget.status === "active"}
      saved={saved}
      canDelete={canDelete}
      copied={copied}
      embedCode={buildEmbedCode(previewId, widget.routing)}
      directUrl={buildDirectUrl(previewId)}
      onSave={handleSave}
      onCancel={() => navigate("/")}
      onDelete={handleDelete}
      onToggleStatus={async () => {
        const prevStatus = widget.status;
        const newStatus: WidgetStatus = prevStatus === "active" ? "paused" : "active";
        // Status sofort lokal anzeigen (optimistisch).
        update("status", newStatus);
        // Bereits gespeicherte Widgets sofort persistieren; neue (noch ohne ID)
        // erhalten den Status erst beim Anlegen.
        if (isNew) return;
        try {
          const persisted = await saveWidget({ ...widget, status: newStatus });
          setWidget(persisted);
        } catch (err) {
          // Persistieren fehlgeschlagen → optimistische Anzeige zurücksetzen.
          update("status", prevStatus);
          setSaveError(err instanceof Error ? err.message : "Status konnte nicht gespeichert werden");
        }
      }}
      onCopy={handleCopy}
      onUpdate={update}
      onUpdateConfig={updateConfig}
      />
    </>
  );
}
