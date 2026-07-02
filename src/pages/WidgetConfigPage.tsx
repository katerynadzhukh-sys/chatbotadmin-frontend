import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WidgetConfigView } from "../components/WidgetConfigView";
import { createDefaultConfig, fetchWidgets, saveWidget } from "../data/widgetsStore";
import type { Widget, WidgetAccent, WidgetStatus } from "../types/widget";

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

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "widget-id";
}

// Stellt sicher, dass die ID eindeutig ist: bei Kollision wird -2, -3, … angehängt.
function makeUniqueId(base: string, existing: Widget[]): string {
  const taken = new Set(existing.map((w) => w.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const WIDGET_BASE_URL = import.meta.env.VITE_WIDGET_BASE_URL || "https://ki-chat.uni-giessen.de";

function buildEmbedCode(widgetId: string, knowledgeBaseId: string, routing: string): string {
  return `<!-- 1. Globaler Loader (Einmalig im Theme / <head> einbinden) -->
<script src="${WIDGET_BASE_URL}/widget.js" defer></script>

<!-- 2. Widget-Platzhalter (Im Seiteninhalt einfügen) -->
<div class="chatbot-widget"
  data-widget-id="${widgetId || "widget-id"}"
  data-kb="${knowledgeBaseId || "kb-id"}"
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

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [widget, setWidget] = useState<Widget>(() => emptyWidget(isNew ? "" : id ?? ""));
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bestand vom Backend laden und – beim Bearbeiten – das passende Widget setzen.
  useEffect(() => {
    let ignore = false;
    fetchWidgets()
      .then((list) => {
        if (ignore) return;
        setWidgets(list);
        if (!isNew) {
          const found = list.find((w) => w.id === id);
          if (found) setWidget(found);
        }
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
        if (!widget.name.trim() || !widget.knowledgeBaseId.trim()) return;
        const newId = makeUniqueId(slugify(widget.name), widgets);
        const saved = await saveWidget({ ...widget, id: newId });
        setWidgets((current) => [...current, saved]);
        setWidget(saved);
        setSaved(true);
        navigate(`/widgets/${newId}`, { replace: true });
      } else {
        const saved = await saveWidget(widget);
        setWidgets((current) => current.map((w) => (w.id === saved.id ? saved : w)));
        setSaved(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
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

  const previewId = isNew ? slugify(widget.name) : widget.id;

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
      isNew={isNew}
      isActive={widget.status === "active"}
      saved={saved}
      copied={copied}
      embedCode={buildEmbedCode(previewId, widget.knowledgeBaseId, widget.routing)}
      directUrl={buildDirectUrl(previewId)}
      onSave={handleSave}
      onCancel={() => navigate("/")}
      onToggleStatus={async () => {
        const newStatus: WidgetStatus = widget.status === "active" ? "paused" : "active";
        // Status sofort lokal anzeigen.
        update("status", newStatus);
        // Bereits gespeicherte Widgets sofort persistieren; neue (noch ohne ID)
        // erhalten den Status erst beim Anlegen.
        if (isNew) return;
        try {
          const persisted = await saveWidget({ ...widget, status: newStatus });
          setWidgets((current) => current.map((w) => (w.id === persisted.id ? persisted : w)));
        } catch (err) {
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
