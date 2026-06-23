"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type ProductSearchSuggestion = {
  barcode: string;
  itemNumber: string | null;
  productId: string;
  productName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  searchValue: string;
  secondProductName: string | null;
  stockQuantity: number | null;
};

type ProductSearchComboboxProps = {
  defaultValue?: string;
  inputClassName: string;
  loadingLabel: string;
  name?: string;
  noResultsLabel: string;
  placeholder: string;
  purchaseLabel: string;
  retailLabel: string;
  stockLabel: string;
  suggestionsLabel: string;
};

function formatSuggestionNumber(value: number | null) {
  return value === null ? null : new Intl.NumberFormat("en-US").format(value);
}

export function ProductSearchCombobox({
  defaultValue = "",
  inputClassName,
  loadingLabel,
  name = "q",
  noResultsLabel,
  placeholder,
  purchaseLabel,
  retailLabel,
  stockLabel,
  suggestionsLabel,
}: ProductSearchComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<ProductSearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = value.trim();
  const activeDescendant =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (normalizedQuery.length < 2) {
        setSuggestions([]);
        setIsLoading(false);
        setActiveIndex(-1);
        return;
      }

      const form = inputRef.current?.form;
      const params = new URLSearchParams({ q: normalizedQuery });

      for (const field of ["shop_id", "category", "supplier", "state"]) {
        const element = form?.elements.namedItem(field);
        const fieldValue =
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement
            ? element.value
            : "";

        if (fieldValue) {
          params.set(field, fieldValue);
        }
      }

      setIsLoading(true);
      fetch(`/api/shop/products/search-suggestions?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((data: unknown) => {
          if (!Array.isArray(data)) {
            setSuggestions([]);
            return;
          }

          setSuggestions(data as ProductSearchSuggestion[]);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name !== "AbortError") {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [normalizedQuery]);

  const visibleSuggestions = useMemo(
    () => (isOpen ? suggestions : []),
    [isOpen, suggestions],
  );
  const listboxVisible = isOpen && (isLoading || normalizedQuery.length >= 2);

  const submitSuggestion = (suggestion: ProductSearchSuggestion) => {
    setValue(suggestion.searchValue);
    setIsOpen(false);
    setSuggestions([]);
    window.requestAnimationFrame(() => {
      inputRef.current?.form?.requestSubmit();
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        suggestions.length === 0 ? -1 : Math.min(current + 1, suggestions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        suggestions.length === 0 ? -1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      const suggestion = suggestions[activeIndex];

      if (suggestion) {
        event.preventDefault();
        submitSuggestion(suggestion);
      }
    }
  };

  return (
    <div className="relative min-w-0">
      <input
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={listboxVisible}
        className={inputClassName}
        name={name}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        type="search"
        value={value}
      />
      {listboxVisible ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
          role="presentation"
        >
          <ul
            aria-label={suggestionsLabel}
            className="max-h-72 overflow-y-auto py-1"
            id={listboxId}
            role="listbox"
          >
            {visibleSuggestions.map((suggestion, index) => {
              const primary =
                suggestion.productName ??
                suggestion.secondProductName ??
                suggestion.barcode;
              const purchase = formatSuggestionNumber(suggestion.purchasePrice);
              const retail = formatSuggestionNumber(suggestion.retailPrice);
              const stock = formatSuggestionNumber(suggestion.stockQuantity);

              return (
                <li
                  aria-selected={activeIndex === index}
                  className={[
                    "grid cursor-pointer gap-1 px-3 py-2 text-sm",
                    activeIndex === index
                      ? "bg-emerald-50 text-emerald-950"
                      : "text-zinc-800",
                  ].join(" ")}
                  id={`${listboxId}-option-${index}`}
                  key={suggestion.productId}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    submitSuggestion(suggestion);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span className="line-clamp-1 font-semibold text-zinc-950">
                    {primary}
                  </span>
                  <span className="line-clamp-1 font-mono text-xs text-zinc-500">
                    {suggestion.barcode}
                    {suggestion.itemNumber ? ` · ${suggestion.itemNumber}` : ""}
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                    {purchase ? (
                      <span>
                        {purchaseLabel}: {purchase}
                      </span>
                    ) : null}
                    {retail ? (
                      <span>
                        {retailLabel}: {retail}
                      </span>
                    ) : null}
                    {stock ? (
                      <span>
                        {stockLabel}: {stock}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
            {!isLoading &&
            normalizedQuery.length >= 2 &&
            visibleSuggestions.length === 0 ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="px-3 py-2 text-sm text-zinc-500"
                role="option"
              >
                {noResultsLabel}
              </li>
            ) : null}
            {isLoading ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="px-3 py-2 text-sm text-zinc-500"
                role="option"
              >
                {loadingLabel}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
