import {
  reactivateDeviceAction,
  renameDeviceAction,
  revokeDeviceAction,
} from "@/app/shop/actions";
import { CopyDeviceIdentifierButton } from "@/app/shop/_components/CopyDeviceIdentifierButton";
import { SectionCard } from "@/components/admin/SectionCard";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/admin/StatusBadge";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { formatTimestampUtc } from "@/components/platform/displayFormat";
import type { SupportedLocale } from "@/i18n/locales";
import type {
  ShopDetectedSyncClient,
  ShopDeviceReadModel,
  ShopDeviceRegistryRow,
} from "@/server/shop-admin/device-read-model";
import Link from "next/link";
import type { ReactNode } from "react";

type DeviceRegistryViewProps = {
  canManageDevices: boolean;
  filter: DeviceFilter;
  locale: SupportedLocale;
  readModel: ShopDeviceReadModel;
  requestedShopId?: string;
  searchQuery: string;
  t: (value: string) => string;
};

type DeviceFilter =
  | "all"
  | "active"
  | "revoked"
  | "mobile"
  | "pos"
  | "web"
  | "diagnostics";

type SummaryCard = {
  detail: string;
  label: string;
  tone: StatusBadgeTone;
  value: string;
};

const filterLabels: Record<DeviceFilter, string> = {
  all: "All",
  active: "Active",
  revoked: "Revoked",
  mobile: "Mobile",
  pos: "POS",
  web: "Web",
  diagnostics: "Diagnostics / Test",
};
const filterOrder: readonly DeviceFilter[] = [
  "all",
  "active",
  "revoked",
  "mobile",
  "pos",
  "web",
  "diagnostics",
];

const secretKeyPattern =
  /(access[_-]?token|refresh[_-]?token|service[_-]?role|secret|password|pin|credential|hash|imei|serial|mac|location)/i;
const sensitiveValuePattern =
  /(bearer\s+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|sk-[A-Za-z0-9_-]+)/i;

export function normalizeDeviceFilter(value?: string): DeviceFilter {
  return value === "active" ||
    value === "revoked" ||
    value === "mobile" ||
    value === "pos" ||
    value === "web" ||
    value === "diagnostics"
    ? value
    : "all";
}

function statusTone(status: string): StatusBadgeTone {
  return status === "active"
    ? "good"
    : status === "revoked"
      ? "warning"
      : "neutral";
}

function shortDeviceIdentifier(value: string) {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function withRequestedShopId(
  href: string,
  requestedShopId: string | undefined,
) {
  if (!requestedShopId) {
    return href;
  }

  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("shop_id", requestedShopId);

  return `${path}?${params.toString()}`;
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(value: unknown, key = ""): unknown {
  if (secretKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return sensitiveValuePattern.test(value)
      ? "[redacted]"
      : value.slice(0, 80);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => metadataString(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 12)
        .map(([childKey, childValue]) => [
          childKey,
          metadataString(childValue, childKey),
        ]),
    );
  }

  return value;
}

function safeMetadataSummary(row: ShopDeviceRegistryRow) {
  const metadata = metadataString(row.metadataRedacted);

  if (!metadata || JSON.stringify(metadata) === "{}") {
    return "No metadata";
  }

  return JSON.stringify(metadata, null, 2);
}

function metadataPlatform(row: ShopDeviceRegistryRow) {
  const metadata = metadataObject(row.metadataRedacted);
  const platform = metadata.platform;

  return typeof platform === "string" ? platform : null;
}

function formatDeviceType(row: ShopDeviceRegistryRow) {
  const platform = metadataPlatform(row);

  if (row.deviceType === "pos") {
    return platform ? `POS / ${platform}` : "POS";
  }

  if (row.deviceType === "mobile") {
    return platform ? `Mobile / ${platform}` : "Mobile";
  }

  if (row.deviceType === "web") {
    return "Web";
  }

  return platform ? `Unknown / ${platform}` : "Unknown";
}

function principalLabel(value: string) {
  if (value === "personal_account") {
    return "Account personale";
  }

  if (value === "pos_staff") {
    return "Staff POS";
  }

  if (value === "system") {
    return "System";
  }

  return "Unknown";
}

function isDiagnosticDevice(row: ShopDeviceRegistryRow) {
  const haystack = [
    row.appVersion,
    row.deviceIdentifier,
    row.deviceType,
    row.displayName,
    JSON.stringify(row.metadataRedacted ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(diagnostic|fixture|playwright|smoke|task0|test-device|test client)/.test(
    haystack,
  );
}

function deviceMatchesSearch(row: ShopDeviceRegistryRow, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    row.appVersion,
    row.deviceIdentifier,
    row.deviceType,
    row.displayName,
    row.lastSeenAccount,
    row.lastSeenStaff,
    row.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function deviceMatchesFilter(row: ShopDeviceRegistryRow, filter: DeviceFilter) {
  if (filter === "active") {
    return row.status === "active";
  }

  if (filter === "revoked") {
    return row.status === "revoked";
  }

  if (filter === "mobile") {
    return row.deviceType === "mobile";
  }

  if (filter === "pos") {
    return row.deviceType === "pos";
  }

  if (filter === "web") {
    return row.deviceType === "web";
  }

  if (filter === "diagnostics") {
    return isDiagnosticDevice(row);
  }

  return true;
}

function formatTime(
  value: string | null | undefined,
  locale: SupportedLocale,
  fallback: string,
) {
  return value ? formatTimestampUtc(value, locale) : fallback;
}

function syncDiagnosticLabel(row: ShopDeviceRegistryRow, t: (value: string) => string) {
  if (row.status !== "active") {
    return t("Registry blocks client traffic");
  }

  if (!row.syncActivity) {
    return t("Active registry; no linked sync event");
  }

  return t("Active registry; sync event linked");
}

function buildFilterHref({
  filter,
  requestedShopId,
  searchQuery,
}: {
  filter: DeviceFilter;
  requestedShopId?: string;
  searchQuery: string;
}) {
  const params = new URLSearchParams();

  if (requestedShopId) {
    params.set("shop_id", requestedShopId);
  }

  if (filter !== "all") {
    params.set("device_filter", filter);
  }

  if (searchQuery) {
    params.set("device_q", searchQuery);
  }

  const query = params.toString();

  return query ? `/shop/devices?${query}` : "/shop/devices";
}

function summaryCards({
  detectedSyncClients,
  devices,
  t,
}: {
  detectedSyncClients: readonly ShopDetectedSyncClient[];
  devices: readonly ShopDeviceRegistryRow[];
  t: (value: string) => string;
}): SummaryCard[] {
  const realDevices = devices.filter((row) => !isDiagnosticDevice(row));
  const activeCount = realDevices.filter(
    (row) => row.status === "active",
  ).length;
  const revokedCount = realDevices.filter(
    (row) => row.status === "revoked",
  ).length;
  const needsAttentionCount = realDevices.filter(
    (row) => row.status !== "active" || !row.lastSeenAt,
  ).length;

  return [
    {
      detail: t("Registered devices ready for client traffic."),
      label: t("Active devices"),
      tone: "good",
      value: String(activeCount),
    },
    {
      detail: t("Devices blocked by the registry."),
      label: t("Revoked devices"),
      tone: revokedCount > 0 ? "warning" : "muted",
      value: String(revokedCount),
    },
    {
      detail: t("Revoked, unknown, or missing a recent seen timestamp."),
      label: t("Needs attention"),
      tone: needsAttentionCount > 0 ? "warning" : "good",
      value: String(needsAttentionCount),
    },
    {
      detail: t("Activity hints from sync_events only."),
      label: t("Sync activity hints"),
      tone: detectedSyncClients.length > 0 ? "neutral" : "muted",
      value: String(detectedSyncClients.length),
    },
  ];
}

function SummaryCards({ cards }: { cards: readonly SummaryCard[] }) {
  return (
    <section
      aria-label="Device registry summary"
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <article
          className={[
            "min-w-0 rounded-md border p-4 shadow-sm",
            card.tone === "good"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : card.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : card.tone === "muted"
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-slate-200 bg-white text-slate-950",
          ].join(" ")}
          key={card.label}
        >
          <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-normal">
            {card.value}
          </p>
          <p className="mt-1 text-sm leading-6 opacity-80">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}

function DeviceFilters({
  activeFilter,
  requestedShopId,
  searchQuery,
  t,
}: {
  activeFilter: DeviceFilter;
  requestedShopId?: string;
  searchQuery: string;
  t: (value: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label={t("Device filters")} className="flex flex-wrap gap-2">
        {filterOrder.map((filter) => {
          const isActive = filter === activeFilter;

          return (
            <Link
              className={[
                "inline-flex min-h-11 items-center rounded-md border px-3 py-2 text-sm font-medium sm:h-9 sm:min-h-0 sm:py-0",
                isActive
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700",
              ].join(" ")}
              href={buildFilterHref({ filter, requestedShopId, searchQuery })}
              key={filter}
            >
              {t(filterLabels[filter])}
            </Link>
          );
        })}
      </nav>

      <form className="flex w-full gap-2 sm:max-w-md" method="get">
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        {activeFilter !== "all" ? (
          <input name="device_filter" type="hidden" value={activeFilter} />
        ) : null}
        <label className="sr-only" htmlFor="device-search">
          {t("Search devices")}
        </label>
        <input
          className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:h-10"
          defaultValue={searchQuery}
          id="device-search"
          name="device_q"
          placeholder={t("Search by name, account, staff, app version")}
          type="search"
        />
        <button
          className="inline-flex h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white sm:h-10"
          type="submit"
        >
          {t("Search")}
        </button>
      </form>
    </div>
  );
}

function DeviceMetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-normal text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-950 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function HiddenShopInput({ requestedShopId }: { requestedShopId?: string }) {
  return requestedShopId ? (
    <input name="shop_id" type="hidden" value={requestedShopId} />
  ) : null;
}

function InlineActionDetails({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-800 sm:min-h-0">
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function InlineTextInput({
  defaultValue,
  label,
  name,
  placeholder,
  required,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800">
      {label}
      <input
        className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:h-10"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required={required}
        type="text"
      />
    </label>
  );
}

function InlineDeviceActions({
  requestedShopId,
  row,
  t,
}: {
  requestedShopId?: string;
  row: ShopDeviceRegistryRow;
  t: (value: string) => string;
}) {
  const isRevoked = row.status === "revoked";

  return (
    <div className="mt-4 grid gap-2 border-t border-slate-200 pt-3">
      <InlineActionDetails label={t("Rename")}>
        <form
          action={renameDeviceAction}
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <HiddenShopInput requestedShopId={requestedShopId} />
          <input name="deviceId" type="hidden" value={row.deviceId} />
          <InlineTextInput
            defaultValue={row.displayName}
            label={t("Display name")}
            name="displayName"
            required
          />
          <button
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white sm:h-10"
            type="submit"
          >
            {t("Rename")}
          </button>
        </form>
      </InlineActionDetails>

      {isRevoked ? (
        <InlineActionDetails label={t("Reactivate")}>
          <form action={reactivateDeviceAction} className="grid gap-3">
            <HiddenShopInput requestedShopId={requestedShopId} />
            <input name="deviceId" type="hidden" value={row.deviceId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineTextInput label={t("Reason")} name="reason" required />
              <InlineTextInput
                label={t("Type REACTIVATE as confirmation")}
                name="confirmation"
                placeholder="REACTIVATE"
                required
              />
            </div>
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-4 text-sm font-medium text-emerald-950 sm:h-10 sm:w-fit"
              type="submit"
            >
              {t("Reactivate device")}
            </button>
          </form>
        </InlineActionDetails>
      ) : (
        <InlineActionDetails label={t("Revoke")}>
          <form action={revokeDeviceAction} className="grid gap-3">
            <HiddenShopInput requestedShopId={requestedShopId} />
            <input name="deviceId" type="hidden" value={row.deviceId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineTextInput label={t("Reason")} name="reason" required />
              <InlineTextInput
                label={t("Type REVOKE as confirmation")}
                name="confirmation"
                placeholder="REVOKE"
                required
              />
            </div>
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-950 sm:h-10 sm:w-fit"
              type="submit"
            >
              {t("Revoke device")}
            </button>
          </form>
        </InlineActionDetails>
      )}
    </div>
  );
}

function DeviceCard({
  canManageDevices,
  diagnostic,
  locale,
  requestedShopId,
  row,
  t,
}: {
  canManageDevices: boolean;
  diagnostic?: boolean;
  locale: SupportedLocale;
  requestedShopId?: string;
  row: ShopDeviceRegistryRow;
  t: (value: string) => string;
}) {
  const historyHref = row.syncActivity
    ? withRequestedShopId(row.deviceDetailHref, requestedShopId)
    : null;
  const detailHref = withRequestedShopId(
    `/shop/devices/${encodeURIComponent(row.deviceId)}`,
    requestedShopId,
  );

  return (
    <article
      className="min-w-0 rounded-md border border-slate-200 bg-white p-4"
      data-device-kind={diagnostic ? "diagnostic" : "registered"}
      data-testid="registered-device-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
              {row.displayName}
            </h3>
            <StatusBadge label={t(row.status)} tone={statusTone(row.status)} />
            {diagnostic ? (
              <StatusBadge label={t("Diagnostics / Test")} tone="muted" />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatDeviceType(row)} -{" "}
            {shortDeviceIdentifier(row.deviceIdentifier)}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700 sm:h-9 sm:min-h-0 sm:w-auto sm:py-0"
          href={detailHref}
        >
          {t("Details")}
        </Link>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DeviceMetaItem
          label={t("Last access / sync")}
          value={formatTime(row.lastSeenAt, locale, t("No access seen"))}
        />
        <DeviceMetaItem
          label={t("App version")}
          value={row.appVersion ?? t("Unknown")}
        />
        <DeviceMetaItem
          label={t("Account personale usato")}
          value={row.lastSeenAccount ?? t("No personal account seen")}
        />
        <DeviceMetaItem
          label={t("Staff POS usato")}
          value={row.lastSeenStaff ?? t("No POS staff seen")}
        />
        <DeviceMetaItem
          label={t("Principal")}
          value={principalLabel(row.lastSeenPrincipalKind)}
        />
        <DeviceMetaItem
          label={t("Latest history")}
          value={
            row.syncActivity && historyHref ? (
              <Link
                className="inline-flex min-h-11 items-center text-emerald-700 underline-offset-4 hover:underline sm:min-h-0"
                href={historyHref}
              >
                {row.syncActivity.latestDomain} /{" "}
                {row.syncActivity.latestEventType}
              </Link>
            ) : (
              t("No sync event")
            )
          }
        />
        <DeviceMetaItem
          label={t("Registry / sync")}
          value={syncDiagnosticLabel(row, t)}
        />
      </dl>

      <details className="mt-4 border-t border-slate-200 pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-800 sm:min-h-0">
          {t("Technical details")}
        </summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <DeviceMetaItem
            label={t("Device identifier")}
            value={
              <span className="inline-flex flex-wrap items-center gap-2">
                <code className="break-all text-xs font-semibold text-slate-800">
                  {row.deviceIdentifier}
                </code>
                <CopyDeviceIdentifierButton value={row.deviceIdentifier} />
              </span>
            }
          />
          <DeviceMetaItem
            label={t("Device row id")}
            value={
              <code className="break-all text-xs font-semibold text-slate-800">
                {row.deviceId}
              </code>
            }
          />
          <DeviceMetaItem
            label={t("Created")}
            value={formatTimestampUtc(row.createdAt, locale)}
          />
          <DeviceMetaItem
            label={t("Updated")}
            value={formatTimestampUtc(row.updatedAt, locale)}
          />
          <DeviceMetaItem
            label={t("Revoked")}
            value={formatTime(row.revokedAt, locale, t("Not revoked"))}
          />
          <DeviceMetaItem
            label={t("Reactivated")}
            value={formatTime(row.reactivatedAt, locale, t("Not reactivated"))}
          />
        </dl>
        <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          {safeMetadataSummary(row)}
        </pre>
      </details>

      {canManageDevices ? (
        <InlineDeviceActions
          requestedShopId={requestedShopId}
          row={row}
          t={t}
        />
      ) : null}
    </article>
  );
}

function DeviceList({
  canManageDevices,
  devices,
  emptyState,
  locale,
  requestedShopId,
  t,
}: {
  canManageDevices: boolean;
  devices: readonly ShopDeviceRegistryRow[];
  emptyState: string;
  locale: SupportedLocale;
  requestedShopId?: string;
  t: (value: string) => string;
}) {
  if (devices.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-600">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {devices.map((row) => (
        <DeviceCard
          canManageDevices={canManageDevices}
          diagnostic={isDiagnosticDevice(row)}
          key={row.deviceId}
          locale={locale}
          requestedShopId={requestedShopId}
          row={row}
          t={t}
        />
      ))}
    </div>
  );
}

function DiagnosticDevices({
  canManageDevices,
  devices,
  locale,
  requestedShopId,
  t,
}: {
  canManageDevices: boolean;
  devices: readonly ShopDeviceRegistryRow[];
  locale: SupportedLocale;
  requestedShopId?: string;
  t: (value: string) => string;
}) {
  if (devices.length === 0) {
    return null;
  }

  return (
    <details className="rounded-md border border-slate-200 bg-white p-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-slate-950 sm:min-h-0">
        {t("Diagnostic / test devices")} ({devices.length})
      </summary>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {t(
          "Synthetic, diagnostic, and smoke-test devices stay visible for audit but are kept out of the default owner list.",
        )}
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {devices.map((row) => (
          <DeviceCard
            canManageDevices={canManageDevices}
            diagnostic
            key={row.deviceId}
            locale={locale}
            requestedShopId={requestedShopId}
            row={row}
            t={t}
          />
        ))}
      </div>
    </details>
  );
}

function SyncActivityHints({
  clients,
  locale,
  requestedShopId,
  t,
}: {
  clients: readonly ShopDetectedSyncClient[];
  locale: SupportedLocale;
  requestedShopId?: string;
  t: (value: string) => string;
}) {
  return (
    <details className="rounded-md border border-slate-200 bg-white p-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-slate-950 sm:min-h-0">
        {t("Sync activity hints")} ({clients.length})
      </summary>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
        {t(
          "These rows come from sync_events.source_device_id for the mapped shop inventory source. They are activity hints only and are not authorized devices until a client registers through shop_device_register.",
        )}
      </p>
      {clients.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          {t("No sync-only clients detected for this shop.")}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {clients.map((client) => (
            <article
              className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-4"
              data-testid="sync-activity-hint"
              key={client.sourceDeviceId}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]">
                    {shortDeviceIdentifier(client.sourceDeviceId)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {client.source ?? t("Unknown source")} -{" "}
                    {client.latestDomain} / {client.latestEventType}
                  </p>
                </div>
                <StatusBadge label={t("Activity hint only")} tone="muted" />
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <DeviceMetaItem
                  label={t("Latest sync")}
                  value={formatTimestampUtc(client.latestEventAt, locale)}
                />
                <DeviceMetaItem
                  label={t("Events")}
                  value={String(client.eventCount)}
                />
                <DeviceMetaItem
                  label={t("Changed rows")}
                  value={String(client.changedCount)}
                />
              </dl>
              <Link
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-4 hover:underline sm:min-h-0"
                href={withRequestedShopId(client.historyHref, requestedShopId)}
              >
                {t("Open sync history")}
              </Link>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}

export function DeviceRegistryView({
  canManageDevices,
  filter,
  locale,
  readModel,
  requestedShopId,
  searchQuery,
  t,
}: DeviceRegistryViewProps) {
  const allDevices = readModel.devices;
  const diagnosticDevices = allDevices.filter(isDiagnosticDevice);
  const registeredDevices = allDevices.filter(
    (row) => !isDiagnosticDevice(row),
  );
  const filteredRegisteredDevices =
    filter === "diagnostics"
      ? diagnosticDevices.filter((row) => deviceMatchesSearch(row, searchQuery))
      : registeredDevices.filter(
          (row) =>
            deviceMatchesFilter(row, filter) &&
            deviceMatchesSearch(row, searchQuery),
        );

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-5`}>
      <SummaryCards
        cards={summaryCards({
          detectedSyncClients: readModel.detectedSyncClients,
          devices: allDevices,
          t,
        })}
      />

      {readModel.status !== "ready" ? (
        <SectionCard
          description={readModel.reason}
          title={t("Device registry unavailable")}
          titleId="devices-unavailable-title"
        >
          <p className="text-sm leading-6 text-slate-600">
            {readModel.error?.message ??
              t("The selected shop could not load device rows through RLS.")}
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            actions={
              <StatusBadge
                label={t("Registered devices")}
                tone={registeredDevices.length > 0 ? "good" : "muted"}
              />
            }
            description={t(
              "Primary device list for this shop. Full identifiers and row ids live inside Details so the main view stays readable.",
            )}
            title={t("Registered devices")}
            titleId="registered-devices-title"
          >
            <div className="grid gap-4">
              <DeviceFilters
                activeFilter={filter}
                requestedShopId={requestedShopId}
                searchQuery={searchQuery}
                t={t}
              />
              <DeviceList
                canManageDevices={canManageDevices}
                devices={filteredRegisteredDevices}
                emptyState={
                  filter === "diagnostics"
                    ? t("No diagnostic or test devices match this filter.")
                    : t(
                        "Devices will appear after login or sync from updated clients.",
                      )
                }
                locale={locale}
                requestedShopId={requestedShopId}
                t={t}
              />
            </div>
          </SectionCard>

          {filter !== "diagnostics" ? (
            <DiagnosticDevices
              canManageDevices={canManageDevices}
              devices={diagnosticDevices}
              locale={locale}
              requestedShopId={requestedShopId}
              t={t}
            />
          ) : null}

          <SyncActivityHints
            clients={readModel.detectedSyncClients}
            locale={locale}
            requestedShopId={requestedShopId}
            t={t}
          />
        </>
      )}
    </div>
  );
}
