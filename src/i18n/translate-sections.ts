import type { PlatformNavigationItem, PlatformSection } from "@/components/platform/platformData";
import type {
  ShopNavigationSection,
  ShopSection,
  ShopSectionLiveData,
  ShopSectionTableRow,
} from "@/components/shop/shopSections";
import type { Dictionary } from "./dictionaries";

export function translateText(dictionary: Dictionary, value: string): string {
  return dictionary.exact[value] ?? value;
}

const translatableValueKeyPatterns = [
  "action",
  "availability",
  "category",
  "credential",
  "domain",
  "field",
  "health",
  "kind",
  "operation",
  "origin",
  "outcome",
  "requirement",
  "result",
  "role",
  "scope",
  "severity",
  "signal",
  "source",
  "state",
  "status",
  "type",
];

function shouldTranslateUiValue(keyOrLabel: string | undefined): boolean {
  const normalized = keyOrLabel?.toLowerCase() ?? "";

  return translatableValueKeyPatterns.some((pattern) =>
    normalized.includes(pattern),
  );
}

function translateUiValue(
  dictionary: Dictionary,
  keyOrLabel: string | undefined,
  value: string,
): string {
  return shouldTranslateUiValue(keyOrLabel) ? translateText(dictionary, value) : value;
}

function translateList(dictionary: Dictionary, values: readonly string[] | undefined) {
  return values?.map((value) => translateText(dictionary, value));
}

function translateShopRow(
  dictionary: Dictionary,
  row: ShopSectionTableRow,
): ShopSectionTableRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key === "rowKey" ? value : translateUiValue(dictionary, key, value),
    ]),
  ) as ShopSectionTableRow;
}

function translateShopLiveData(
  dictionary: Dictionary,
  liveData: ShopSectionLiveData | undefined,
): ShopSectionLiveData | undefined {
  if (!liveData) {
    return undefined;
  }

  return {
    ...liveData,
    columns: liveData.columns.map((column) => ({
      ...column,
      label: translateText(dictionary, column.label),
    })),
    description: translateText(dictionary, liveData.description),
    emptyState: {
      description: translateText(dictionary, liveData.emptyState.description),
      title: translateText(dictionary, liveData.emptyState.title),
    },
    rows: liveData.rows.map((row) => translateShopRow(dictionary, row)),
    title: translateText(dictionary, liveData.title),
  };
}

export function translateShopNavigationSections(
  dictionary: Dictionary,
  sections: readonly ShopNavigationSection[],
): ShopNavigationSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      label: translateText(dictionary, item.label),
    })),
    label: translateText(dictionary, section.label),
  }));
}

export function translateShopSection(
  dictionary: Dictionary,
  section: ShopSection,
): ShopSection {
  return {
    ...section,
    description: translateText(dictionary, section.description),
    eyebrow: translateText(dictionary, section.eyebrow),
    guardrails: section.guardrails.map((item) => translateText(dictionary, item)),
    label: translateText(dictionary, section.label),
    liveData: translateShopLiveData(dictionary, section.liveData),
    metrics: section.metrics.map((metric) => ({
      ...metric,
      detail: translateText(dictionary, metric.detail),
      label: translateText(dictionary, metric.label),
      value: translateText(dictionary, metric.value),
    })),
    plannedWork: section.plannedWork.map((item) => translateText(dictionary, item)),
    secondaryLiveData: section.secondaryLiveData?.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        label: translateText(dictionary, column.label),
      })),
      description: translateText(dictionary, table.description),
      emptyState: {
        description: translateText(dictionary, table.emptyState.description),
        title: translateText(dictionary, table.emptyState.title),
      },
      rows: table.rows.map((row) => translateShopRow(dictionary, row)),
      title: translateText(dictionary, table.title),
    })),
    status: translateText(dictionary, section.status),
    title: translateText(dictionary, section.title),
  };
}

type PlatformTableRow = PlatformSection["rows"][number];

function translatePlatformRow(
  dictionary: Dictionary,
  row: PlatformTableRow,
): PlatformTableRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key === "rowKey" ? value : translateUiValue(dictionary, key, value),
    ]),
  ) as PlatformTableRow;
}

export function translatePlatformNavigationItems(
  dictionary: Dictionary,
  items: readonly PlatformNavigationItem[],
): PlatformNavigationItem[] {
  return items.map((item) => ({
    ...item,
    label: translateText(dictionary, item.label),
  }));
}

export function translatePlatformSection(
  dictionary: Dictionary,
  section: PlatformSection,
): PlatformSection {
  return {
    ...section,
    backLabel: section.backLabel
      ? translateText(dictionary, section.backLabel)
      : section.backLabel,
    columns: section.columns.map((column) => ({
      ...column,
      label: translateText(dictionary, column.label),
    })),
    description: translateText(dictionary, section.description),
    detailSections: section.detailSections?.map((detailSection) => ({
      ...detailSection,
      description: detailSection.description
        ? translateText(dictionary, detailSection.description)
        : detailSection.description,
      fields: detailSection.fields.map((field) => ({
        ...field,
        label: translateText(dictionary, field.label),
        value: translateUiValue(dictionary, field.label, field.value),
      })),
      notes: translateList(dictionary, detailSection.notes),
      title: translateText(dictionary, detailSection.title),
    })),
    emptyState: section.emptyState
      ? {
          description: translateText(dictionary, section.emptyState.description),
          title: translateText(dictionary, section.emptyState.title),
        }
      : section.emptyState,
    eyebrow: translateText(dictionary, section.eyebrow),
    filters: section.filters?.map((filter) => ({
      ...filter,
      label: translateText(dictionary, filter.label),
      options: filter.options.map((option) => ({
        ...option,
        label: translateText(dictionary, option.label),
      })),
    })),
    guardrails: translateList(dictionary, section.guardrails),
    nextLinks: section.nextLinks?.map((link) => ({
      ...link,
      description: translateText(dictionary, link.description),
      label: translateText(dictionary, link.label),
    })),
    operations: section.operations?.map((operation) => ({
      ...operation,
      description: translateText(dictionary, operation.description),
      label: translateText(dictionary, operation.label),
    })),
    purposeItems: section.purposeItems?.map((item) => ({
      ...item,
      detail: translateText(dictionary, item.detail),
      label: translateText(dictionary, item.label),
    })),
    rowDetails: section.rowDetails?.map((detail) => ({
      ...detail,
        fields: detail.fields?.map((field) => ({
          ...field,
          label: translateText(dictionary, field.label),
          value: translateUiValue(dictionary, field.label, field.value),
        })),
      groups: detail.groups?.map((group) => ({
        ...group,
        fields: group.fields.map((field) => ({
          ...field,
          label: translateText(dictionary, field.label),
          value: translateUiValue(dictionary, field.label, field.value),
        })),
        notes: translateList(dictionary, group.notes),
        title: translateText(dictionary, group.title),
      })),
      notes: translateList(dictionary, detail.notes),
      subtitle: translateText(dictionary, detail.subtitle),
      title: translateText(dictionary, detail.title),
    })),
    rows: section.rows.map((row) => translatePlatformRow(dictionary, row)),
    searchPlaceholder: section.searchPlaceholder
      ? translateText(dictionary, section.searchPlaceholder)
      : section.searchPlaceholder,
    stats: section.stats.map((stat) => ({
      ...stat,
      detail: translateText(dictionary, stat.detail),
      label: translateText(dictionary, stat.label),
      value: translateText(dictionary, stat.value),
    })),
    status: translateText(dictionary, section.status),
    title: translateText(dictionary, section.title),
  };
}
