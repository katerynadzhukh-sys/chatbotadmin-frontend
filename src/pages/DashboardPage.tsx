import { useEffect, useState } from "react";
import { AddWidgetCard } from "../components/AddWidgetCard";
import { SearchToolbar, type SortOption, type StatusFilter } from "../components/SearchToolbar";
import { WidgetCard } from "../components/WidgetCard";
import { fetchAgents } from "../data/agentsStore";
import { fetchWidgets } from "../data/widgetsStore";
import type { Widget } from "../types/widget";

export function DashboardPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Zuordnung agentId → Agent-Name, damit die Karten den verknüpften Agenten
  // statt einer Modell-ID zeigen. Fehlschläge sind unkritisch.
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchWidgets()
      .then((w) => {
        setWidgets(w);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Unbekannter Fehler"));

    fetchAgents()
      .then((list) => {
        const map: Record<string, string> = {};
        for (const a of list) map[a.id] = a.name;
        setAgentNames(map);
      })
      .catch(() => setAgentNames({}));
  }, []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name");

  const filteredWidgets = widgets
    .filter((widget) => {
      if (statusFilter !== "all" && widget.status !== statusFilter) return false;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return widget.name.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      switch (sortOption) {
        case "conversations":
          return b.stats.conversations - a.stats.conversations;
        case "rating":
          return b.stats.rating - a.stats.rating;
        default:
          return a.name.localeCompare(b.name);
      }
    });

  return (
    <main className="flex-grow p-gutter space-y-stack-lg max-w-container-max mx-auto w-full">
      <SearchToolbar
        value={search}
        onChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortOption={sortOption}
        onSortOptionChange={setSortOption}
      />

      {loadError ? (
        <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          Konnektoren konnten nicht geladen werden: {loadError}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-outline-variant pb-4">
        <h2 className="font-headline-md text-headline-md text-on-surface">Ihre Konnektoren</h2>
        <p className="text-on-surface-variant font-body-base text-sm">{filteredWidgets.length} Konnektoren</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {filteredWidgets.map((widget) => (
          <WidgetCard key={widget.id} widget={widget} agentName={widget.agentId ? agentNames[widget.agentId] : undefined} />
        ))}
        <AddWidgetCard />
      </div>
    </main>
  );
}
