import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormControl, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { Toggle } from "./Toggle";
import { ICON_OPTIONS, POSITION_OPTIONS } from "./widgetOptions";
import { WidgetIcon } from "./WidgetIcon";
import { streamChatMessage, type ChatMessage } from "../data/chat";
import type { Widget, WidgetPosition } from "../types/widget";
import type { Agent } from "../types/agent";

interface PreviewMessage {
  role: "bot" | "user";
  text: string;
  feedback?: "up" | "down" | null;
  /** UI-Hinweis (Fehler/leer) — wird NICHT als Gesprächsverlauf an das Modell gesendet. */
  notice?: boolean;
}

const RATE_SLIDERS = [
  { id: "rate-minute",   label: "Anfragen pro Minute",     key: "rateLimitPerMinute"    as const, min: 1,  max: 60,   step: 1  },
  { id: "rate-user-day", label: "Anfragen pro Nutzer/Tag", key: "rateLimitPerUserPerDay" as const, min: 1,  max: 500,  step: 1  },
  { id: "max-tokens",    label: "Max. Tokens pro Antwort", key: "maxTokensPerAnswer"     as const, min: 50, max: 2000, step: 50 },
];

export interface WidgetConfigViewProps {
  widget: Widget;
  /** Verfügbare Agenten (Ebene 1) für die Auswahl. Der Konnektor verweist nur per agentId. */
  agents: Agent[];
  isNew: boolean;
  isActive: boolean;
  saved: boolean;
  /** Nur Superadmins dürfen einen Konnektor löschen – blendet den Löschen-Button ein. */
  canDelete: boolean;
  copied: "code" | "url" | null;
  embedCode: string;
  directUrl: string;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onCopy: (text: string, kind: "code" | "url") => void;
  onUpdate: <K extends keyof Widget>(key: K, value: Widget[K]) => void;
  onUpdateConfig: <K extends keyof Widget["config"]>(key: K, value: Widget["config"][K]) => void;
}

export function WidgetConfigView({
  widget,
  agents,
  isNew,
  isActive,
  saved,
  canDelete,
  copied,
  embedCode,
  directUrl,
  onSave,
  onCancel,
  onDelete,
  onToggleStatus,
  onCopy,
  onUpdate,
  onUpdateConfig,
}: WidgetConfigViewProps) {
  // Der verknüpfte Agent (Ebene 1) liefert die Denkschicht: Modell, System-Prompt,
  // Regeln, Token-Limit. Der Konnektor verweist nur per agentId darauf.
  const selectedAgent = agents.find((a) => a.id === widget.agentId) ?? null;

  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>(() => [
    { role: "bot", text: widget.config.greeting || "Hallo! Wie kann ich dir helfen?" },
  ]);
  const [previewDraft, setPreviewDraft] = useState("");
  const [previewTyping, setPreviewTyping] = useState(false);
  // Vorschau zeigt zunächst nur den Chat-Button; erst per Klick öffnet sich das Fenster.
  const [previewOpen, setPreviewOpen] = useState(false);
  // Grundeinstellungen sind beim Erstellen offen, bei bestehenden Konnektoren eingeklappt.
  const [basicsOpen, setBasicsOpen] = useState(isNew);

  // Position von Button und Fenster innerhalb der Vorschau (laut Einstellung).
  const previewPositionClass =
    widget.config.position === "bottom-right" ? "bottom-3 right-3"
    : widget.config.position === "bottom-left" ? "bottom-3 left-3"
    : widget.config.position === "top-right" ? "top-3 right-3"
    : "top-3 left-3";

  // Begrüßungstext live in der Vorschau spiegeln, solange noch kein Gespräch läuft.
  const greeting = widget.config.greeting || "Hallo! Wie kann ich dir helfen?";
  const [prevGreeting, setPrevGreeting] = useState(greeting);
  if (greeting !== prevGreeting) {
    setPrevGreeting(greeting);
    setPreviewMessages((msgs) =>
      msgs.length === 1 && msgs[0].role === "bot" ? [{ role: "bot", text: greeting }] : msgs,
    );
  }

  // Vorschau-Chat bei neuen Nachrichten / während des Streamens nach unten scrollen.
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [previewMessages, previewTyping]);

  // Laufenden Vorschau-Stream abbrechen können (bei Reset/Unmount).
  const previewAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => previewAbortRef.current?.abort(), []);

  // System-Prompt aus dem AGENTEN (System-Prompt + aktive Regeln) zusammenbauen.
  const buildSystemPrompt = (): string => {
    if (!selectedAgent) return "";
    const parts: string[] = [];
    if (selectedAgent.systemPrompt.trim()) parts.push(selectedAgent.systemPrompt.trim());

    const activeRules = selectedAgent.rules
      .filter((r) => r.enabled && r.text.trim())
      .map((r) => `- ${r.text.trim()}`);
    if (activeRules.length) parts.push(`Regeln:\n${activeRules.join("\n")}`);

    return parts.join("\n\n");
  };

  const handlePreviewSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || previewTyping) return;

    const model = selectedAgent?.model.trim() ?? "";
    const history: PreviewMessage[] = [...previewMessages, { role: "user", text: trimmed }];
    setPreviewMessages(history);
    setPreviewDraft("");

    if (!model) {
      setPreviewMessages((msgs) => [
        ...msgs,
        { role: "bot", text: "⚠️ Bitte zuerst einen Agenten mit Modell auswählen.", notice: true },
      ]);
      return;
    }

    setPreviewTyping(true);
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    const appendToken = (chunk: string) => {
      if (controller.signal.aborted) return;
      setPreviewTyping(false);
      setPreviewMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last?.role === "bot" && !last.notice) {
          const copy = [...msgs];
          copy[copy.length - 1] = { ...last, text: last.text + chunk };
          return copy;
        }
        return [...msgs, { role: "bot", text: chunk, feedback: null }];
      });
    };

    try {
      const messages: ChatMessage[] = [];
      const system = buildSystemPrompt();
      if (system) messages.push({ role: "system", content: system });
      for (const m of history) {
        if (m.notice) continue;
        messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.text });
      }

      const { reply, finishReason } = await streamChatMessage(
        {
          knowledgeBaseId: model,
          messages,
          maxTokens: selectedAgent?.maxTokens,
          signal: controller.signal,
          widgetId: widget.id,
        },
        appendToken,
      );

      if (controller.signal.aborted) return;

      if (!reply.trim()) {
        const text =
          finishReason === "length"
            ? "⚠️ Token-Limit erreicht, bevor eine Antwort generiert wurde. Erhöhe den Wert im Agenten."
            : "(leere Antwort)";
        setPreviewMessages((msgs) => [...msgs, { role: "bot", text, notice: true }]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setPreviewMessages((msgs) => [...msgs, { role: "bot", text: `⚠️ ${message}`, notice: true }]);
    } finally {
      if (!controller.signal.aborted) setPreviewTyping(false);
    }
  };

  const handlePreviewReset = () => {
    previewAbortRef.current?.abort();
    setPreviewMessages([
      { role: "bot", text: widget.config.greeting || "Hallo! Wie kann ich dir helfen?" },
    ]);
    setPreviewDraft("");
    setPreviewTyping(false);
  };

  const handlePreviewFeedback = (index: number, value: "up" | "down") => {
    setPreviewMessages((msgs) =>
      msgs.map((m, i) => (i === index ? { ...m, feedback: m.feedback === value ? null : value } : m)),
    );
  };

  return (
    <main className="flex-grow max-w-container-max mx-auto w-full">

      {/* ── Header ── */}
      <header className="bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-gutter py-4">

          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={onCancel}
              aria-label="Zurück zur Übersicht"
              className="rounded-lg"
            >
              <Icon name="arrow_back" className="text-[20px]" />
            </Button>

            <div className="min-w-0">
              {isNew ? (
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  Neuen Konnektor erstellen
                </h2>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline-md text-headline-md text-on-surface truncate">
                      {widget.name}
                    </h2>
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-sm font-bold ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isActive ? "bg-primary" : "bg-on-surface-variant"}`} />
                      {isActive ? "Aktiv" : "Pause"}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-on-surface-variant truncate">
                    Konnektor · Typ: Widget · ID: {widget.id}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isNew && canDelete && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Konnektor „${widget.name}“ endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
                    )
                  ) {
                    onDelete();
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg font-label-sm text-label-sm transition-colors border-error text-error hover:bg-error hover:text-on-error"
              >
                <Icon name="delete" className="text-[18px]" />
                Konnektor löschen
              </button>
            )}
            {!isNew && (
              <button
                onClick={onToggleStatus}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-label-sm text-label-sm transition-colors ${
                  isActive
                    ? "border-error text-error hover:bg-error-container"
                    : "border-primary text-primary hover:bg-primary/10"
                }`}
              >
                <Icon name={isActive ? "pause_circle" : "play_circle"} className="text-[18px]" />
                {isActive ? "Konnektor deaktivieren" : "Konnektor aktivieren"}
              </button>
            )}
            <Button variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button
              onClick={onSave}
              disabled={saved || (isNew && (!widget.name.trim() || !widget.agentId))}
              className="shadow-sm"
            >
              {saved ? "Gespeichert" : isNew ? "Erstellen" : "Speichern"}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Two-column grid ── */}
      <div className="p-gutter grid grid-cols-1 lg:grid-cols-3 gap-gutter">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-stack-lg">

          {/* Grundeinstellungen — beim Erstellen offen, bei bestehenden Konnektoren einklappbar */}
          <Card className="p-6 space-y-stack-sm">
            {isNew ? (
              <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
                <Icon name="tune" className="text-primary" />
                Grundeinstellungen
              </h3>
            ) : (
              <button
                type="button"
                onClick={() => setBasicsOpen((o) => !o)}
                aria-expanded={basicsOpen}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
                  <Icon name="tune" className="text-primary" />
                  Grundeinstellungen
                </h3>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  {basicsOpen ? "Einklappen" : "Bearbeiten"}
                  <Icon name="expand_more" className={`text-[20px] transition-transform ${basicsOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
            )}

            {basicsOpen && (
              <>
                <FormItem>
                  <FormLabel>
                    Name <span className="text-error">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={widget.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        // Titel automatisch mitführen, solange er nicht manuell angepasst wurde.
                        const titleUntouched =
                          widget.config.title === "" ||
                          widget.config.title === "ChatBot" ||
                          widget.config.title === widget.name;
                        if (titleUntouched) onUpdateConfig("title", newName);
                        onUpdate("name", newName);
                      }}
                      placeholder="z.B. Support Bot"
                    />
                  </FormControl>
                </FormItem>

                {/* Agent-Auswahl (Ebene 1) — ersetzt das frühere Feld „Knowledge-Base-ID". */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="widget-agent">
                    Agent <span className="text-error">*</span>
                  </Label>
                  {agents.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">
                      Noch keine Agenten vorhanden.{" "}
                      <Link to="/agents/new" className="text-primary hover:underline">
                        Jetzt einen anlegen
                      </Link>
                      .
                    </p>
                  ) : (
                    <>
                      <select
                        id="widget-agent"
                        value={widget.agentId ?? ""}
                        onChange={(e) => onUpdate("agentId", e.target.value)}
                        className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                      >
                        <option value="" disabled>
                          — Agent wählen —
                        </option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name || "(ohne Namen)"}{a.model ? ` · ${a.model}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-on-surface-variant flex items-center gap-1">
                        <Icon name="psychology" className="text-[14px]" />
                        Die Denkschicht (Modell, System-Prompt, Regeln) kommt aus dem Agenten.
                        {selectedAgent && (
                          <Link to={`/agents/${selectedAgent.id}`} className="text-primary hover:underline">
                            „{selectedAgent.name}" bearbeiten
                          </Link>
                        )}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="widget-routing">Routing</Label>
                  <select
                    id="widget-routing"
                    value={widget.routing}
                    onChange={(e) => onUpdate("routing", e.target.value)}
                    className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  >
                    <option value="public">public</option>
                    <option value="internal">internal</option>
                    <option value="private">private</option>
                  </select>
                </div>
              </>
            )}
          </Card>

          {/* Vorlagen & Verhalten des Konnektors — Front-Belange (nicht Agent-Verhalten) */}
          <Card className="p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="forum" className="text-primary" />
              Vorlagen &amp; Verhalten
            </h3>

            {/* Vorlagen */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>
                  Vorlagen
                  <span className="ml-1 text-on-surface-variant/60">
                    ({widget.config.templates.length}/4)
                  </span>
                </Label>
                <button
                  type="button"
                  disabled={widget.config.templates.length >= 4}
                  onClick={() => onUpdateConfig("templates", [...widget.config.templates, ""])}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  <Icon name="add" className="text-[16px]" />
                  Vorlage hinzufügen
                </button>
              </div>

              {widget.config.templates.length === 0 ? (
                <p className="text-xs text-on-surface-variant/60 italic">
                  Keine Vorlagen. Nutzer sehen keine Vorschlagchips im Konnektor.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {widget.config.templates.map((tpl, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={tpl}
                        onChange={(e) => {
                          const updated = [...widget.config.templates];
                          updated[i] = e.target.value;
                          onUpdateConfig("templates", updated);
                        }}
                        placeholder={`Vorlage ${i + 1}`}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onUpdateConfig("templates", widget.config.templates.filter((_, j) => j !== i))}
                        aria-label="Vorlage entfernen"
                        className="rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container shrink-0"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hinweis: System-Prompt & Regeln leben im Agenten */}
            <div className="flex items-start gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              <Icon name="psychology" className="text-primary text-[16px] mt-0.5" />
              <span>
                System-Prompt und Regeln werden im Agenten konfiguriert
                {selectedAgent ? (
                  <>
                    {" "}—{" "}
                    <Link to={`/agents/${selectedAgent.id}`} className="text-primary hover:underline">
                      „{selectedAgent.name}" öffnen
                    </Link>
                  </>
                ) : (
                  ", sobald ein Agent gewählt ist."
                )}
              </span>
            </div>

            <div className="divide-y divide-outline-variant/30">
              <Toggle
                checked={widget.config.saveHistory}
                onChange={(v) => onUpdateConfig("saveHistory", v)}
                label="Gesprächsverlauf speichern"
                description="Speichert Konversationen zur späteren Auswertung."
              />
              <Toggle
                checked={widget.config.feedbackButtons}
                onChange={(v) => onUpdateConfig("feedbackButtons", v)}
                label="Feedback-Schaltflächen"
                description="Zeigt Daumen hoch/runter unter jeder Antwort an."
              />
            </div>
          </Card>

          {/* Rate Limits */}
          <Card className="p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="speed" className="text-primary" />
              Rate Limits
            </h3>

            {RATE_SLIDERS.map(({ id, label, key, min, max, step }) => (
              <div key={id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor={id}>{label}</Label>
                  <span className="font-mono text-sm">{widget.config[key]}</span>
                </div>
                <input
                  id={id}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={widget.config[key]}
                  onChange={(e) => onUpdateConfig(key, Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-stack-lg">

          {/* Output — Widget-Code */}
          <Card className="p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="code" className="text-primary" />
              Output — Einbettung
            </h3>

            {isNew && (
              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                <Icon name="info" className="text-[14px]" />
                Vorschau — ID wird nach dem Erstellen vergeben.
              </p>
            )}

            <div className="flex flex-col gap-1">
              <Label>Einbettungscode</Label>
              <div className="relative">
                <pre className="w-full overflow-x-auto px-4 py-3 bg-surface border border-outline-variant rounded-lg font-mono text-xs leading-relaxed whitespace-pre">
                  {embedCode}
                </pre>
                <button
                  type="button"
                  onClick={() => onCopy(embedCode, "code")}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-surface-container-lowest border border-outline-variant rounded-md text-xs hover:bg-surface-container-high transition-colors"
                >
                  <Icon name={copied === "code" ? "check" : "content_copy"} className="text-[14px]" />
                  {copied === "code" ? "Kopiert" : "Kopieren"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Direkte URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={directUrl}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onCopy(directUrl, "url")}
                  aria-label="URL kopieren"
                  className="rounded-lg"
                >
                  <Icon name={copied === "url" ? "check" : "content_copy"} className="text-[18px]" />
                </Button>
                {!isNew && (
                  <Button
                    asChild
                    variant="outline"
                    size="icon"
                    aria-label="URL öffnen"
                    className="rounded-lg"
                  >
                    <a
                      href={directUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="open_in_new" className="text-[18px]" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Erscheinungsbild */}
          <Card className="p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="palette" className="text-primary" />
              Erscheinungsbild
            </h3>

            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input
                  value={widget.config.title}
                  onChange={(e) => onUpdateConfig("title", e.target.value)}
                />
              </FormControl>
            </FormItem>

            <FormItem>
              <FormLabel>Begrüßungstext</FormLabel>
              <FormControl>
                <Input
                  value={widget.config.greeting}
                  onChange={(e) => onUpdateConfig("greeting", e.target.value)}
                />
              </FormControl>
            </FormItem>

            <div className="grid grid-cols-2 gap-stack-sm">
              <div className="flex flex-col gap-1">
                <Label htmlFor="appearance-color">
                  Akzentfarbe
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id="appearance-color"
                    type="color"
                    value={widget.config.accentColor}
                    onChange={(e) => onUpdateConfig("accentColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-outline-variant cursor-pointer bg-surface"
                  />
                  <Input
                    value={widget.config.accentColor}
                    onChange={(e) => onUpdateConfig("accentColor", e.target.value)}
                    className="px-3 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="appearance-position">
                  Position
                </Label>
                <select
                  id="appearance-position"
                  value={widget.config.position}
                  onChange={(e) => onUpdateConfig("position", e.target.value as WidgetPosition)}
                  className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                >
                  {POSITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => onUpdate("icon", iconName)}
                    className={`w-11 h-11 flex items-center justify-center rounded-xl border-2 transition-colors ${
                      widget.icon === iconName
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant text-on-surface-variant hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    <WidgetIcon name={iconName} size={22} />
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Vorschau */}
          <Card className="p-6 space-y-stack-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
                <Icon name="visibility" className="text-primary" />
                Vorschau
              </h3>
              <button
                type="button"
                onClick={handlePreviewReset}
                className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
              >
                <Icon name="refresh" className="text-[14px]" />
                Zurücksetzen
              </button>
            </div>

            <div className="relative h-[420px] rounded-lg border border-outline-variant bg-surface overflow-hidden">
              {/* Geschlossener Zustand: nur der Chat-Button an der eingestellten Position. */}
              {!previewOpen && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  aria-label="Chat öffnen"
                  className={`absolute w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 ${previewPositionClass}`}
                  style={{ backgroundColor: widget.config.accentColor }}
                >
                  <WidgetIcon name={widget.icon || "Bot"} size={26} />
                </button>
              )}

              {/* Geöffneter Zustand: das Chat-Fenster. */}
              {previewOpen && (
              <div
                className={`absolute w-72 h-96 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden flex flex-col ${previewPositionClass}`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 text-white shrink-0"
                  style={{ backgroundColor: widget.config.accentColor }}
                >
                  <WidgetIcon name={widget.icon || "Bot"} size={18} />
                  <div className="flex flex-col min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-semibold">{widget.config.title || "ChatBot"}</span>
                    <span className="flex items-center gap-1 text-[10px] opacity-90">
                      <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                      {widget.routing}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    aria-label="Chat schließen"
                    className="p-0.5 rounded hover:bg-white/20 transition-colors shrink-0"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>

                <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-surface-container-low">
                  {previewMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                          msg.role === "user" ? "text-white" : "bg-surface-container-lowest text-on-surface"
                        }`}
                        style={msg.role === "user" ? { backgroundColor: widget.config.accentColor } : undefined}
                      >
                        {msg.role === "bot" && !msg.notice ? <Markdown>{msg.text}</Markdown> : msg.text}
                      </div>
                      {msg.role === "bot" && i > 0 && !msg.notice && widget.config.feedbackButtons && (
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => handlePreviewFeedback(i, "up")}
                            aria-label="Hilfreich"
                            className={`p-0.5 rounded transition-colors ${
                              msg.feedback === "up" ? "text-primary" : "text-on-surface-variant/50 hover:text-primary"
                            }`}
                          >
                            <Icon name="thumb_up" className="text-[14px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePreviewFeedback(i, "down")}
                            aria-label="Nicht hilfreich"
                            className={`p-0.5 rounded transition-colors ${
                              msg.feedback === "down" ? "text-error" : "text-on-surface-variant/50 hover:text-error"
                            }`}
                          >
                            <Icon name="thumb_down" className="text-[14px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {previewTyping && (
                    <div className="flex items-start">
                      <div className="bg-surface-container-lowest rounded-lg px-3 py-2.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Vorschlags-Chips unten links, oberhalb der Eingabe. */}
                {previewMessages.length === 1 && widget.config.templates.filter(Boolean).length > 0 && (
                  <div className="flex flex-wrap justify-start gap-1 px-2 pt-1 pb-1 shrink-0 bg-surface-container-low">
                    {widget.config.templates.filter(Boolean).map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handlePreviewSend(tpl)}
                        className="px-2 py-0.5 rounded-full border bg-surface-container-lowest text-[10px] font-medium cursor-pointer transition-colors hover:bg-surface-container-high"
                        style={{ borderColor: widget.config.accentColor, color: widget.config.accentColor }}
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 p-2 border-t border-outline-variant shrink-0">
                  <input
                    value={previewDraft}
                    onChange={(e) => setPreviewDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePreviewSend(previewDraft);
                      }
                    }}
                    placeholder="Nachricht eingeben…"
                    className="flex-1 px-3 py-1.5 bg-surface border rounded-full text-xs outline-none focus:ring-2 min-w-0"
                    style={{
                      borderColor: widget.config.accentColor,
                      "--tw-ring-color": widget.config.accentColor,
                    } as CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={() => handlePreviewSend(previewDraft)}
                    disabled={!previewDraft.trim() || previewTyping}
                    aria-label="Senden"
                    className="p-2 rounded-full text-white disabled:opacity-40 transition-opacity shrink-0"
                    style={{ backgroundColor: widget.config.accentColor }}
                  >
                    <Icon name="send" className="text-[16px]" />
                  </button>
                </div>
              </div>
              )}
            </div>
          </Card>

        </div>
      </div>
    </main>
  );
}
