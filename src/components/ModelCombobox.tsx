import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { fetchModels, type LanguageModel } from "../data/models";

interface ModelComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Texteingabe mit einem Dropdown (Kontextmenü) der verfügbaren Sprachmodelle.
 * Die Modelle werden beim ersten Fokus über /api/models geladen (openai-node
 * läuft serverseitig im Vite-Proxy) und nach Eingabe gefiltert.
 */
export function ModelCombobox({
  id,
  value,
  onChange,
  placeholder,
  className = "",
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<LanguageModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = (force = false) => {
    setLoading(true);
    setError(null);
    fetchModels(force)
      .then((m) => setModels(m))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Fehler beim Laden"))
      .finally(() => setLoading(false));
  };

  // Dropdown schließen, wenn außerhalb geklickt wird.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? models.filter((m) => m.id.toLowerCase().includes(query))
    : models;

  const openDropdown = () => {
    setOpen(true);
    setHighlight(0);
    if (models.length === 0 && !loading) load();
  };

  const select = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openDropdown();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[highlight]) {
        e.preventDefault();
        select(filtered[highlight].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          id={id}
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) openDropdown();
            setHighlight(0);
          }}
          onFocus={openDropdown}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={className}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          aria-label="Modelle anzeigen"
          className="absolute inset-y-0 right-0 flex items-center px-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          <Icon
            name="expand_more"
            className={`text-[20px] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-1"
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-on-surface-variant">
              <Icon name="progress_activity" className="text-[18px] animate-spin" />
              Modelle werden geladen…
            </div>
          )}

          {!loading && error && (
            <div className="px-3 py-2">
              <p className="text-sm text-error flex items-center gap-1.5">
                <Icon name="error" className="text-[18px]" />
                {error}
              </p>
              <button
                type="button"
                onClick={() => load(true)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-on-surface-variant">
              Keine passenden Modelle.
            </p>
          )}

          {!loading &&
            !error &&
            filtered.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={m.id === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(m.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === highlight ? "bg-surface-container-high" : "hover:bg-surface-container-low"
                } ${m.id === value ? "text-primary" : "text-on-surface"}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon name="smart_toy" className="text-[18px] shrink-0 text-on-surface-variant" />
                  <span className="font-mono truncate">{m.id}</span>
                </span>
                {m.id === value && <Icon name="check" className="text-[18px] shrink-0" />}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
