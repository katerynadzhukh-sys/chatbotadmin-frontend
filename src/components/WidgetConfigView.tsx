import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { ModelCombobox } from "./ModelCombobox";
import { Toggle } from "./Toggle";
import { ICON_OPTIONS, POSITION_OPTIONS } from "./widgetOptions";
import { WidgetIcon } from "./WidgetIcon";
import { streamChatMessage, type ChatMessage } from "../data/chat";
import type { Widget, WidgetPosition, WidgetRule } from "../types/widget";

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
  isNew: boolean;
  isActive: boolean;
  saved: boolean;
  copied: "code" | "url" | null;
  embedCode: string;
  directUrl: string;
  onSave: () => void;
  onCancel: () => void;
  onToggleStatus: () => void;
  onCopy: (text: string, kind: "code" | "url") => void;
  onUpdate: <K extends keyof Widget>(key: K, value: Widget[K]) => void;
  onUpdateConfig: <K extends keyof Widget["config"]>(key: K, value: Widget["config"][K]) => void;
}

export function WidgetConfigView({
  widget,
  isNew,
  isActive,
  saved,
  copied,
  embedCode,
  directUrl,
  onSave,
  onCancel,
  onToggleStatus,
  onCopy,
  onUpdate,
  onUpdateConfig,
}: WidgetConfigViewProps) {
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>(() => [
    { role: "bot", text: widget.config.greeting || "Hallo! Wie kann ich dir helfen?" },
  ]);
  const [previewDraft, setPreviewDraft] = useState("");
  const [previewTyping, setPreviewTyping] = useState(false);
  // Vorschau zeigt zunächst nur den Chat-Button; erst per Klick öffnet sich das Fenster.
  const [previewOpen, setPreviewOpen] = useState(false);
  // Grundeinstellungen sind beim Erstellen offen, bei bestehenden Widgets eingeklappt.
  const [basicsOpen, setBasicsOpen] = useState(isNew);

  // Position von Button und Fenster innerhalb der Vorschau (laut Einstellung).
  const previewPositionClass =
    widget.config.position === "bottom-right" ? "bottom-3 right-3"
    : widget.config.position === "bottom-left" ? "bottom-3 left-3"
    : widget.config.position === "top-right" ? "top-3 right-3"
    : "top-3 left-3";

  // Begrüßungstext live in der Vorschau spiegeln, solange noch kein Gespräch
  // läuft. React-Muster „State beim Prop-Wechsel anpassen“ (setState im Render,
  // nicht im Effekt): https://react.dev/learn/you-might-not-need-an-effect
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

  // Laufenden Vorschau-Stream abbrechen können (bei Reset/Unmount), damit späte
  // Tokens nicht mehr in eine bereits ersetzte Bubble geschrieben werden.
  const previewAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => previewAbortRef.current?.abort(), []);

  // System-Prompt aus Start-Prompt + aktiven Regeln zusammenbauen.
  const buildSystemPrompt = (): string => {
    const parts: string[] = [];
    if (widget.config.startPrompt.trim()) parts.push(widget.config.startPrompt.trim());

    const activeRules = widget.config.rules
      .filter((r) => r.enabled && r.text.trim())
      .map((r) => `- ${r.text.trim()}`);
    if (activeRules.length) parts.push(`Regeln:\n${activeRules.join("\n")}`);

    return parts.join("\n\n");
  };

  const handlePreviewSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || previewTyping) return;

    const knowledgeBaseId = widget.knowledgeBaseId.trim();
    const history: PreviewMessage[] = [...previewMessages, { role: "user", text: trimmed }];
    setPreviewMessages(history);
    setPreviewDraft("");

    if (!knowledgeBaseId) {
      setPreviewMessages((msgs) => [
        ...msgs,
        { role: "bot", text: "⚠️ Bitte zuerst eine Knowledge-Base-ID angeben.", notice: true },
      ]);
      return;
    }

    setPreviewTyping(true);

    // Vorherigen Stream (falls noch aktiv) abbrechen und Controller für diesen anlegen.
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    // Beim ersten Token die Schreib-Animation durch eine echte Bot-Bubble ersetzen,
    // danach diese Bubble Token für Token verlängern. Der Updater muss rein sein
    // (StrictMode ruft ihn doppelt auf), daher leiten wir alles aus `msgs` ab.
    const appendToken = (chunk: string) => {
      // Nach Abbruch (z. B. Reset) keine Tokens mehr anhängen — sonst landen sie
      // in der frisch gesetzten Begrüßungs-Bubble.
      if (controller.signal.aborted) return;
      setPreviewTyping(false);
      setPreviewMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last?.role === "bot") {
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
      // UI-Hinweise (Fehler/leer) gehören nicht in den Gesprächsverlauf.
      for (const m of history) {
        if (m.notice) continue;
        messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.text });
      }

      const { reply, finishReason } = await streamChatMessage(
        { knowledgeBaseId, messages, maxTokens: widget.config.maxTokensPerAnswer, signal: controller.signal },
        appendToken,
      );

      // Nach Abbruch (Reset) das Ergebnis dieses Streams verwerfen.
      if (controller.signal.aborted) return;

      // Kein Inhalt gestreamt (z. B. Token-Limit bei Reasoning-Modellen).
      if (!reply.trim()) {
        const text =
          finishReason === "length"
            ? "⚠️ Token-Limit erreicht, bevor eine Antwort generiert wurde. Erhöhe „Max. Tokens pro Antwort“."
            : "(leere Antwort)";
        setPreviewMessages((msgs) => [...msgs, { role: "bot", text, notice: true }]);
      }
    } catch (err) {
      // Abbruch (Reset/Unmount) ist kein Fehler — keine Hinweis-Bubble anzeigen.
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setPreviewMessages((msgs) => [...msgs, { role: "bot", text: `⚠️ ${message}`, notice: true }]);
    } finally {
      if (!controller.signal.aborted) setPreviewTyping(false);
    }
  };

  const handlePreviewReset = () => {
    // Laufenden Stream stoppen, damit seine Tokens nicht in die neue Begrüßung fließen.
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
            <button
              onClick={onCancel}
              aria-label="Zurück"
              className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors"
            >
              <Icon name="arrow_back" />
            </button>

            <div className="min-w-0">
              {isNew ? (
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  Neues Widget erstellen
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
                    Widget-ID: {widget.id}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
                {isActive ? "Widget deaktivieren" : "Widget aktivieren"}
              </button>
            )}
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-outline-variant rounded-lg font-label-sm text-label-sm text-on-surface hover:bg-surface-container-high transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={onSave}
              disabled={saved || (isNew && (!widget.name.trim() || !widget.knowledgeBaseId.trim()))}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all font-label-sm text-label-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100"
            >
              {saved ? "Gespeichert" : isNew ? "Erstellen" : "Speichern"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Two-column grid ── */}
      <div className="p-gutter grid grid-cols-1 lg:grid-cols-3 gap-gutter">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-stack-lg">

          {/* Grundeinstellungen — beim Erstellen offen, bei bestehenden Widgets einklappbar */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
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
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-on-surface-variant" htmlFor="widget-name">
                    Name <span className="text-error">*</span>
                  </label>
                  <input
                    id="widget-name"
                    value={widget.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      // Titel automatisch mitführen, solange er nicht manuell
                      // angepasst wurde (noch Standardwert "ChatBot", leer, oder
                      // identisch mit dem bisherigen Namen).
                      const titleUntouched =
                        widget.config.title === "" ||
                        widget.config.title === "ChatBot" ||
                        widget.config.title === widget.name;
                      if (titleUntouched) onUpdateConfig("title", newName);
                      onUpdate("name", newName);
                    }}
                    placeholder="z.B. Support Bot"
                    className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-on-surface-variant" htmlFor="widget-kb">
                      Knowledge-Base-ID <span className="text-error">*</span>
                    </label>
                    <ModelCombobox
                      id="widget-kb"
                      value={widget.knowledgeBaseId}
                      onChange={(value) => onUpdate("knowledgeBaseId", value)}
                      placeholder="Knowledge-Base-ID eingeben…"
                      className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-on-surface-variant" htmlFor="widget-routing">
                      Routing
                    </label>
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
                </div>
              </>
            )}
          </section>

          {/* Gesprächseinstellungen */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="forum" className="text-primary" />
              Gesprächseinstellungen
            </h3>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface-variant" htmlFor="start-prompt">
                Start-Prompt
              </label>
              <textarea
                id="start-prompt"
                rows={4}
                value={widget.config.startPrompt}
                onChange={(e) => onUpdateConfig("startPrompt", e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm resize-y"
              />
            </div>

            {/* Vorlagen */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-label-sm text-on-surface-variant">
                  Vorlagen
                  <span className="ml-1 text-on-surface-variant/60">
                    ({widget.config.templates.length}/4)
                  </span>
                </label>
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
                  Keine Vorlagen. Nutzer sehen keine Vorschlagchips im Widget.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {widget.config.templates.map((tpl, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={tpl}
                        onChange={(e) => {
                          const updated = [...widget.config.templates];
                          updated[i] = e.target.value;
                          onUpdateConfig("templates", updated);
                        }}
                        placeholder={`Vorlage ${i + 1}`}
                        className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateConfig("templates", widget.config.templates.filter((_, j) => j !== i))}
                        aria-label="Vorlage entfernen"
                        className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors shrink-0"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Regeln */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-label-sm text-on-surface-variant">Regeln</label>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig("rules", [
                      ...widget.config.rules,
                      { text: "", enabled: true } satisfies WidgetRule,
                    ])
                  }
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Icon name="add" className="text-[16px]" />
                  Regel hinzufügen
                </button>
              </div>

              {widget.config.rules.length === 0 ? (
                <p className="text-xs text-on-surface-variant/60 italic">
                  Keine Regeln definiert.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/30 border border-outline-variant rounded-lg overflow-hidden">
                  {widget.config.rules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-surface hover:bg-surface-container-low transition-colors">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = widget.config.rules.map((r, j) =>
                            j === i ? { ...r, enabled: !r.enabled } : r
                          );
                          onUpdateConfig("rules", updated);
                        }}
                        className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          rule.enabled
                            ? "bg-primary border-primary text-on-primary"
                            : "border-outline-variant bg-surface"
                        }`}
                        aria-label={rule.enabled ? "Deaktivieren" : "Aktivieren"}
                      >
                        {rule.enabled && <Icon name="check" className="text-[14px]" />}
                      </button>
                      <input
                        value={rule.text}
                        onChange={(e) => {
                          const updated = widget.config.rules.map((r, j) =>
                            j === i ? { ...r, text: e.target.value } : r
                          );
                          onUpdateConfig("rules", updated);
                        }}
                        placeholder="Neue Regel..."
                        className={`flex-1 bg-transparent text-sm outline-none ${
                          rule.enabled ? "text-on-surface" : "text-on-surface-variant line-through"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig("rules", widget.config.rules.filter((_, j) => j !== i))
                        }
                        aria-label="Regel entfernen"
                        className="shrink-0 p-1 text-on-surface-variant hover:text-error transition-colors"
                      >
                        <Icon name="close" className="text-[16px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
          </section>

          {/* Rate Limits */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="speed" className="text-primary" />
              Rate Limits
            </h3>

            {RATE_SLIDERS.map(({ id, label, key, min, max, step }) => (
              <div key={id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-sm text-on-surface-variant" htmlFor={id}>{label}</label>
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
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-stack-lg">

          {/* Output — Widget-Code */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="code" className="text-primary" />
              Output — Widget-Code
            </h3>

            {isNew && (
              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                <Icon name="info" className="text-[14px]" />
                Vorschau — ID wird nach dem Erstellen vergeben.
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface-variant">Einbettungscode</label>
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
              <label className="font-label-sm text-on-surface-variant">Direkte URL</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={directUrl}
                  className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => onCopy(directUrl, "url")}
                  aria-label="URL kopieren"
                  className="p-2 border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <Icon name={copied === "url" ? "check" : "content_copy"} className="text-[18px]" />
                </button>
                {!isNew && (
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="URL öffnen"
                    className="p-2 border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
                  >
                    <Icon name="open_in_new" className="text-[18px]" />
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Erscheinungsbild */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="palette" className="text-primary" />
              Erscheinungsbild
            </h3>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface-variant" htmlFor="appearance-title">
                Titel
              </label>
              <input
                id="appearance-title"
                value={widget.config.title}
                onChange={(e) => onUpdateConfig("title", e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface-variant" htmlFor="appearance-greeting">
                Begrüßungstext
              </label>
              <input
                id="appearance-greeting"
                value={widget.config.greeting}
                onChange={(e) => onUpdateConfig("greeting", e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-stack-sm">
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="appearance-color">
                  Akzentfarbe
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="appearance-color"
                    type="color"
                    value={widget.config.accentColor}
                    onChange={(e) => onUpdateConfig("accentColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-outline-variant cursor-pointer bg-surface"
                  />
                  <input
                    value={widget.config.accentColor}
                    onChange={(e) => onUpdateConfig("accentColor", e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="appearance-position">
                  Position
                </label>
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
              <label className="font-label-sm text-on-surface-variant">Icon</label>
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
          </section>

          {/* Vorschau */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
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
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
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
          </section>

        </div>
      </div>
    </main>
  );
}
