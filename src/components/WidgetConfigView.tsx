import { useEffect, useRef, useState } from "react";
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
  showApiKey: boolean;
  copied: "code" | "url" | null;
  embedCode: string;
  directUrl: string;
  onSave: () => void;
  onCancel: () => void;
  onToggleStatus: () => void;
  onToggleShowApiKey: () => void;
  onRegenerateApiKey: () => void;
  onCopy: (text: string, kind: "code" | "url") => void;
  onUpdate: <K extends keyof Widget>(key: K, value: Widget[K]) => void;
  onUpdateConfig: <K extends keyof Widget["config"]>(key: K, value: Widget["config"][K]) => void;
}

export function WidgetConfigView({
  widget,
  isNew,
  isActive,
  showApiKey,
  copied,
  embedCode,
  directUrl,
  onSave,
  onCancel,
  onToggleStatus,
  onToggleShowApiKey,
  onRegenerateApiKey,
  onCopy,
  onUpdate,
  onUpdateConfig,
}: WidgetConfigViewProps) {
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>(() => [
    { role: "bot", text: widget.config.greeting || "Hallo! Wie kann ich dir helfen?" },
  ]);
  const [previewDraft, setPreviewDraft] = useState("");
  const [previewTyping, setPreviewTyping] = useState(false);

  // Vorschau-Chat bei neuen Nachrichten / während des Streamens nach unten scrollen.
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [previewMessages, previewTyping]);

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

    const model = widget.config.model.trim();
    const history: PreviewMessage[] = [...previewMessages, { role: "user", text: trimmed }];
    setPreviewMessages(history);
    setPreviewDraft("");

    if (!model) {
      setPreviewMessages((msgs) => [
        ...msgs,
        { role: "bot", text: "⚠️ Bitte zuerst ein Sprachmodell auswählen.", notice: true },
      ]);
      return;
    }

    setPreviewTyping(true);

    // Beim ersten Token die Schreib-Animation durch eine echte Bot-Bubble ersetzen,
    // danach diese Bubble Token für Token verlängern. Der Updater muss rein sein
    // (StrictMode ruft ihn doppelt auf), daher leiten wir alles aus `msgs` ab.
    const appendToken = (chunk: string) => {
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
        { model, messages, maxTokens: widget.config.maxTokensPerAnswer },
        appendToken,
      );

      // Kein Inhalt gestreamt (z. B. Token-Limit bei Reasoning-Modellen).
      if (!reply.trim()) {
        const text =
          finishReason === "length"
            ? "⚠️ Token-Limit erreicht, bevor eine Antwort generiert wurde. Erhöhe „Max. Tokens pro Antwort“."
            : "(leere Antwort)";
        setPreviewMessages((msgs) => [...msgs, { role: "bot", text, notice: true }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setPreviewMessages((msgs) => [...msgs, { role: "bot", text: `⚠️ ${message}`, notice: true }]);
    } finally {
      setPreviewTyping(false);
    }
  };

  const handlePreviewReset = () => {
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
              disabled={isNew && (!widget.name.trim() || !widget.kbId.trim())}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all font-label-sm text-label-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isNew ? "Erstellen" : "Speichern"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Two-column grid ── */}
      <div className="p-gutter grid grid-cols-1 lg:grid-cols-3 gap-gutter">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-stack-lg">

          {/* Grundeinstellungen — create mode only */}
          {isNew && (
            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
              <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
                <Icon name="tune" className="text-primary" />
                Grundeinstellungen
              </h3>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="widget-name">
                  Name <span className="text-error">*</span>
                </label>
                <input
                  id="widget-name"
                  value={widget.name}
                  onChange={(e) => onUpdate("name", e.target.value)}
                  placeholder="z.B. Support Bot"
                  className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-on-surface-variant" htmlFor="widget-kbid">
                    Knowledge-Base-ID <span className="text-error">*</span>
                  </label>
                  <input
                    id="widget-kbid"
                    value={widget.kbId}
                    onChange={(e) => onUpdate("kbId", e.target.value)}
                    placeholder="z.B. jlu-public-2024"
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

            </section>
          )}

          {/* Gesprächseinstellungen */}
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
            <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
              <Icon name="forum" className="text-primary" />
              Gesprächseinstellungen
            </h3>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface-variant" htmlFor="widget-model">
                Sprachmodell
              </label>
              <ModelCombobox
                id="widget-model"
                value={widget.config.model}
                onChange={(v) => onUpdateConfig("model", v)}
                placeholder="Modell auswählen…"
                className="w-full px-4 py-2 pr-9 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
              />
              <p className="text-xs text-on-surface-variant">
                Wird für die Antwortgenerierung verwendet (siehe Vorschau).
              </p>
            </div>

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

          {/* Verbindung — edit mode only */}
          {!isNew && (
            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 space-y-stack-sm">
              <h3 className="font-headline-md text-base font-bold flex items-center gap-2">
                <Icon name="link" className="text-primary" />
                Verbindung
              </h3>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant">Knowledge-Base-ID</label>
                <div className="flex items-center gap-2 px-4 py-3 bg-surface border border-outline-variant rounded-lg font-mono text-sm">
                  <Icon name="database" className="text-on-surface-variant text-[18px]" />
                  {widget.kbId}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="api-key">
                  API-Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    readOnly
                    value={widget.config.apiKey}
                    className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg font-mono text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={onToggleShowApiKey}
                    aria-label={showApiKey ? "API-Key verbergen" : "API-Key anzeigen"}
                    className="p-3 border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
                  >
                    <Icon name={showApiKey ? "visibility_off" : "visibility"} className="text-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={onRegenerateApiKey}
                    aria-label="API-Key neu generieren"
                    className="p-3 border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
                  >
                    <Icon name="refresh" className="text-[18px]" />
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Beim Neugenerieren wird der bisherige API-Key ungültig.
                </p>
              </div>
            </section>
          )}

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
              <div
                className={`absolute w-72 h-96 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden flex flex-col ${
                  widget.config.position === "bottom-right" ? "bottom-3 right-3"
                  : widget.config.position === "bottom-left" ? "bottom-3 left-3"
                  : widget.config.position === "top-right"   ? "top-3 right-3"
                  : "top-3 left-3"
                }`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white shrink-0"
                  style={{ backgroundColor: widget.config.accentColor }}
                >
                  <WidgetIcon name={widget.icon || "Bot"} size={18} />
                  <span className="truncate">{widget.config.title || "ChatBot"}</span>
                </div>

                <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                  {previewMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                          msg.role === "user" ? "text-white" : "bg-surface-container-low text-on-surface"
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
                      <div className="bg-surface-container-low rounded-lg px-3 py-2.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50 animate-bounce" />
                      </div>
                    </div>
                  )}

                  {previewMessages.length === 1 && widget.config.templates.filter(Boolean).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {widget.config.templates.filter(Boolean).map((tpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handlePreviewSend(tpl)}
                          className="px-2 py-0.5 rounded-full border text-[10px] font-medium cursor-pointer transition-colors hover:bg-surface-container-low"
                          style={{ borderColor: widget.config.accentColor, color: widget.config.accentColor }}
                        >
                          {tpl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
                    className="flex-1 px-3 py-1.5 bg-surface border border-outline-variant rounded-full text-xs outline-none focus:ring-2 focus:ring-primary min-w-0"
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
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
