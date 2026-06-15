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
  "area",
  "availability",
  "category",
  "credential",
  "domain",
  "field",
  "group",
  "health",
  "kind",
  "label",
  "next",
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
  "summary",
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
  const normalized = keyOrLabel?.toLowerCase() ?? "";

  if (normalized === "detail") {
    return translateStaticUiText(dictionary, value);
  }

  return shouldTranslateUiValue(keyOrLabel)
    ? translateStaticUiText(dictionary, value)
    : translateEmbeddedUiText(dictionary, value);
}

function translateStaticUiText(
  dictionary: Dictionary,
  value: string,
): string {
  const exact = translateText(dictionary, value);

  if (exact !== value) {
    return exact;
  }

  return translateEmbeddedUiText(dictionary, value);
}

function translateEmbeddedUiText(
  dictionary: Dictionary,
  value: string,
): string {
  if (value.includes("\n")) {
    return value
      .split("\n")
      .map((segment, index) =>
        index === 0 ? segment : translateStatusLikeSegment(dictionary, segment),
      )
      .join("\n");
  }

  const countWithLabelMatch = value.match(
    /^(\d+)\s+(revoked|failed technical events|visible devices|revoked or suspicious|latest events|orphaned memberships|profiles without membership|suspended shops with recent activity|latest sync\/history events|shops without owner|visible profiles|platform admins)$/,
  );

  if (countWithLabelMatch) {
    return `${countWithLabelMatch[1]} ${translateText(dictionary, countWithLabelMatch[2])}`;
  }

  const shopStateSummaryMatch = value.match(
    /^(\d+)\s+active\s+\/\s+(\d+)\s+suspended\s+\/\s+(\d+)\s+archived$/,
  );

  if (shopStateSummaryMatch) {
    const [, active, suspended, archived] = shopStateSummaryMatch;

    return [
      `${active} ${translateText(dictionary, "active")}`,
      `${suspended} ${translateText(dictionary, "suspended")}`,
      `${archived} ${translateText(dictionary, "archived")}`,
    ].join(" / ");
  }

  const activeTotalSummaryMatch = value.match(/^(\d+)\s+active\s+\/\s+(\d+)\s+total$/);

  if (activeTotalSummaryMatch) {
    const [, active, total] = activeTotalSummaryMatch;

    return `${active} ${translateText(dictionary, "active")} / ${total} ${translateText(dictionary, "total")}`;
  }

  const credentialStatusMatch = value.match(
    /^(.+)\s+(Active|Locked|Expired|Rotation Required)\s+v(\d+)\s+updated\s+(.+)$/,
  );

  if (credentialStatusMatch) {
    const [, credentialKind, credentialStatus, credentialVersion, updatedAt] =
      credentialStatusMatch;

    return [
      translateText(dictionary, credentialKind),
      translateText(dictionary, credentialStatus),
      `v${credentialVersion}`,
      translateText(dictionary, "Updated"),
      updatedAt,
    ].join(" ");
  }

  const statusSuffixMatch = value.match(/^(.+)\s+\/\s+(Active|Archived)$/);

  if (statusSuffixMatch) {
    return `${statusSuffixMatch[1]} / ${translateText(dictionary, statusSuffixMatch[2])}`;
  }

  return value;
}

const translatableValueFields = new Set(
  [
    "audit",
    "availability",
    "credential",
    "current role",
    "devices",
    "inventory",
    "latest sync",
    "lockout",
    "owner status",
    "pos staff",
    "result",
    "role",
    "scope",
    "state",
    "status",
    "sync",
    "type",
  ].map((value) => value.toLowerCase()),
);

function translateStatusLikeSegment(dictionary: Dictionary, value: string): string {
  return [
    "Active",
    "Archived",
    "Available",
    "Disabled",
    "Expired",
    "Locked",
    "Missing",
    "Pending",
    "Pending Setup",
    "Ready",
    "Redacted",
    "Revoked",
    "Review",
    "Rotation Required",
    "Suspended",
    "Unknown",
    "Visible",
  ].includes(value)
    ? translateText(dictionary, value)
    : translateEmbeddedUiText(dictionary, value);
}

function shouldTranslateWholeRowValue(row: Record<string, string>): boolean {
  const field = row.field ?? row.label ?? "";

  return translatableValueFields.has(field.toLowerCase());
}

function translateRowValue(
  dictionary: Dictionary,
  row: Record<string, string>,
  value: string,
): string {
  return shouldTranslateWholeRowValue(row)
    ? translateStaticUiText(dictionary, value)
    : translateEmbeddedUiText(dictionary, value);
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
      key === "rowKey"
        ? value
        : key === "value"
          ? translateRowValue(dictionary, row, value)
          : translateUiValue(dictionary, key, value),
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
      detail: translateStaticUiText(dictionary, metric.detail),
      label: translateText(dictionary, metric.label),
      value: translateStaticUiText(dictionary, metric.value),
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
      key === "rowKey"
        ? value
        : key === "value"
          ? translateRowValue(dictionary, row, value)
          : translateUiValue(dictionary, key, value),
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
        value: translateRowValue(dictionary, { field: field.label }, field.value),
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
          value: translateRowValue(dictionary, { field: field.label }, field.value),
        })),
      groups: detail.groups?.map((group) => ({
        ...group,
        fields: group.fields.map((field) => ({
          ...field,
          label: translateText(dictionary, field.label),
          value: translateRowValue(dictionary, { field: field.label }, field.value),
        })),
        notes: translateList(dictionary, group.notes),
        title: translateText(dictionary, group.title),
      })),
      notes: translateList(dictionary, detail.notes),
      subtitle: translateEmbeddedUiText(dictionary, detail.subtitle),
      title: translateText(dictionary, detail.title),
    })),
    rows: section.rows.map((row) => translatePlatformRow(dictionary, row)),
    searchPlaceholder: section.searchPlaceholder
      ? translateText(dictionary, section.searchPlaceholder)
      : section.searchPlaceholder,
    stats: section.stats.map((stat) => ({
      ...stat,
      detail: translateStaticUiText(dictionary, stat.detail),
      label: translateText(dictionary, stat.label),
      toneLabel: translateText(dictionary, stat.tone),
      value: translateStaticUiText(dictionary, stat.value),
    })),
    status: translateText(dictionary, section.status),
    title: translateText(dictionary, section.title),
  };
}
