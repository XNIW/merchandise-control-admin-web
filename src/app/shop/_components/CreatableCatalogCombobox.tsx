"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

type CreatableCatalogComboboxOption = {
  id: string;
  name: string;
};

type CreatableCatalogComboboxProps = {
  className: string;
  createLabel: string;
  defaultId?: string | null;
  defaultName?: string | null;
  description?: string;
  idName: string;
  label: string;
  name: string;
  noResultsLabel: string;
  onNameChange?: (value: string) => void;
  options: CreatableCatalogComboboxOption[];
  placeholder?: string;
  suggestionsLabel: string;
  value?: string;
};

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function CreatableCatalogCombobox({
  className,
  createLabel,
  defaultId,
  defaultName,
  description,
  idName,
  label,
  name,
  noResultsLabel,
  onNameChange,
  options,
  placeholder,
  suggestionsLabel,
  value: controlledValue,
}: CreatableCatalogComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const defaultOption = defaultId
    ? options.find((option) => option.id === defaultId)
    : undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultName ?? defaultOption?.name ?? "",
  );
  const value = controlledValue ?? uncontrolledValue;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedValue = normalizeCatalogName(value);
  const exactOption = options.find(
    (option) => normalizeCatalogName(option.name) === normalizedValue,
  );
  const visibleOptions = useMemo(() => {
    if (!normalizedValue) {
      return options.slice(0, 8);
    }

    return options
      .filter((option) => normalizeCatalogName(option.name).includes(normalizedValue))
      .slice(0, 8);
  }, [normalizedValue, options]);
  const canCreate =
    value.trim().length > 0 &&
    !exactOption &&
    !visibleOptions.some(
      (option) => normalizeCatalogName(option.name) === normalizedValue,
    );
  const activeDescendant =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function updateValue(nextValue: string) {
    if (controlledValue === undefined) {
      setUncontrolledValue(nextValue);
    }

    onNameChange?.(nextValue);
  }

  function chooseOption(option: CreatableCatalogComboboxOption) {
    updateValue(option.name);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const optionCount = visibleOptions.length + (canCreate ? 1 : 0);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        optionCount === 0 ? -1 : Math.min(current + 1, optionCount - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        optionCount === 0 ? -1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      const option = visibleOptions[activeIndex];

      if (option) {
        event.preventDefault();
        chooseOption(option);
        return;
      }

      if (canCreate && activeIndex === visibleOptions.length) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
  }

  return (
    <div className="relative grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      <label htmlFor={inputId}>{label}</label>
      <input
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        className={className}
        id={inputId}
        name={name}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        onChange={(event) => {
          updateValue(event.currentTarget.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      <input name={idName} type="hidden" value={exactOption?.id ?? ""} />
      {description ? (
        <span className="text-xs font-normal leading-5 text-zinc-500">
          {description}
        </span>
      ) : null}
      {isOpen ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
          role="presentation"
        >
          <ul
            aria-label={suggestionsLabel}
            className="max-h-56 overflow-y-auto py-1"
            id={listboxId}
            role="listbox"
          >
            {visibleOptions.map((option, index) => (
              <li
                aria-selected={activeIndex === index}
                className={[
                  "cursor-pointer px-3 py-2 text-sm",
                  activeIndex === index
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-zinc-800 hover:bg-zinc-50",
                ].join(" ")}
                id={`${listboxId}-option-${index}`}
                key={option.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseOption(option);
                }}
                role="option"
              >
                {option.name}
              </li>
            ))}
            {canCreate ? (
              <li
                aria-selected={activeIndex === visibleOptions.length}
                className={[
                  "cursor-pointer border-t border-zinc-100 px-3 py-2 text-sm font-medium",
                  activeIndex === visibleOptions.length
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-zinc-700 hover:bg-zinc-50",
                ].join(" ")}
                id={`${listboxId}-option-${visibleOptions.length}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsOpen(false);
                  setActiveIndex(-1);
                }}
                role="option"
              >
                {createLabel}: {value.trim()}
              </li>
            ) : null}
            {visibleOptions.length === 0 && !canCreate ? (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="px-3 py-2 text-sm text-zinc-500"
                role="option"
              >
                {noResultsLabel}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
