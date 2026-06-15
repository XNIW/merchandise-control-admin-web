"use client";

import { useMemo, useState } from "react";

export type SearchableEntityPickerItem = {
  id: string;
  searchText: string;
  title: string;
};

type SearchableEntityPickerProps<TItem extends SearchableEntityPickerItem> = {
  emptyState: string;
  hiddenInputName: string;
  items: readonly TItem[];
  label: string;
  noResultsLabel?: string;
  noneLabel?: string;
  onQueryChange?: (query: string) => void;
  onSelect: (id: string) => void;
  renderItemStatus?: (item: TItem) => string;
  renderItemSubtitle?: (item: TItem) => string;
  renderItemTitle: (item: TItem) => string;
  searchPlaceholder: string;
  selectedId: string;
  selectedSummaryLabel: string;
};

const inputClassName =
  "min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950";

export function SearchableEntityPicker<TItem extends SearchableEntityPickerItem>({
  emptyState,
  hiddenInputName,
  items,
  label,
  noResultsLabel = "No results.",
  noneLabel = "None",
  onQueryChange,
  onSelect,
  renderItemStatus,
  renderItemSubtitle,
  renderItemTitle,
  searchPlaceholder,
  selectedId,
  selectedSummaryLabel,
}: SearchableEntityPickerProps<TItem>) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const selectedItem = items.find((item) => item.id === selectedId);
  const filteredItems = useMemo(() => {
    const matches = normalizedQuery
      ? items.filter((item) =>
          item.searchText.toLowerCase().includes(normalizedQuery),
        )
      : items;

    return matches.slice(0, 8);
  }, [items, normalizedQuery]);

  return (
    <fieldset className="grid gap-3 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">
        {label}
      </legend>
      <input name={hiddenInputName} type="hidden" value={selectedId} />
      <label className="grid gap-1.5 text-sm font-medium text-slate-800">
        <span>{searchPlaceholder}</span>
        <input
          className={inputClassName}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
          }}
          placeholder={searchPlaceholder}
          type="search"
          value={query}
        />
      </label>
      <div
        className="grid max-h-72 gap-2 overflow-y-auto rounded-md border border-slate-200 p-2"
        role="listbox"
      >
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const selected = selectedId === item.id;
            const subtitle = renderItemSubtitle?.(item);
            const status = renderItemStatus?.(item);

            return (
              <button
                aria-selected={selected}
                className={[
                  "rounded-md border px-3 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
                  selected
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50",
                ].join(" ")}
                key={item.id}
                onClick={() => onSelect(item.id)}
                role="option"
                title={item.title}
                type="button"
              >
                <span className="block font-semibold">{renderItemTitle(item)}</span>
                {subtitle || status ? (
                  <span className="block text-xs opacity-80">
                    {[subtitle, status].filter(Boolean).join(" / ")}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <span className="px-1 py-2 text-sm text-slate-500">
            {noResultsLabel} {emptyState}
          </span>
        )}
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        {selectedSummaryLabel}:{" "}
        <span className="font-semibold text-slate-950">
          {selectedItem ? renderItemTitle(selectedItem) : noneLabel}
        </span>
        {selectedItem ? (
          <span className="text-slate-600">
            {" "}
            ({renderItemSubtitle?.(selectedItem) ?? selectedItem.id})
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}
