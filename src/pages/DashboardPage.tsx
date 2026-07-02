import { useEffect, useState } from "react";
import { AddWidgetCard } from "../components/AddWidgetCard";
import { SearchToolbar, type SortOption, type StatusFilter } from "../components/SearchToolbar";
import { WidgetCard } from "../components/WidgetCard";
import { fetchWidgets } from "../data/widgetsStore";
import type { Widget } from "../types/widget";

export function DashboardPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchWidgets()
      .then((w) => {
        setWidgets(w);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Unbekannter Fehler"));
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
          Widgets konnten nicht geladen werden: {loadError}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-outline-variant pb-4">
        <h2 className="font-headline-md text-headline-md text-on-surface">Ihre Widgets</h2>
        <p className="text-on-surface-variant font-body-base text-sm">{filteredWidgets.length} Widgets gefunden</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {filteredWidgets.map((widget) => (
          <WidgetCard key={widget.id} widget={widget} />
        ))}
        <AddWidgetCard />
      </div>
    </main>
  );
}
