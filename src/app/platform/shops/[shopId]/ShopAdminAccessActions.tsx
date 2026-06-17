import { PendingSubmitButton } from "@/components/platform/PendingSubmitButton";
import type {
  PlatformShopAccessCandidate,
  PlatformShopAccessMembership,
} from "@/server/platform-admin/platform-section-data";
import {
  assignPlatformShopMemberAction,
  revokePlatformShopMemberAction,
} from "@/app/platform/operations/actions";

type ShopAdminAccessActionsProps = {
  candidates: readonly PlatformShopAccessCandidate[];
  lastResult?: {
    operation?: string;
    result?: string;
  };
  memberships: readonly PlatformShopAccessMembership[];
  returnTo: string;
  searchQuery: string;
  shop: {
    shopCode: string;
    shopId: string;
  };
};

const accessOperations = new Set(["assign_member", "revoke_member"]);
const fieldClassName =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:bg-slate-100 disabled:text-slate-400";
const labelClassName = "grid min-w-0 gap-1 text-sm font-semibold text-slate-800";

function shortId(value: string) {
  return value.slice(0, 8);
}

function resultMessage(lastResult?: ShopAdminAccessActionsProps["lastResult"]) {
  if (
    !lastResult?.operation ||
    !lastResult.result ||
    !accessOperations.has(lastResult.operation)
  ) {
    return null;
  }

  return `${lastResult.operation}: ${lastResult.result}`;
}

function roleCounts(memberships: readonly PlatformShopAccessMembership[]) {
  const activeOwners = memberships.filter(
    (member) =>
      member.roleId === "Shop Owner" && member.membershipStatus === "Active",
  ).length;

  return { activeOwners };
}

function SearchForm({ searchQuery }: { searchQuery: string }) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      method="get"
    >
      <label className={labelClassName}>
        Search existing profile
        <input
          className={fieldClassName}
          defaultValue={searchQuery}
          name="profileQuery"
          placeholder="Email, display name, or profile ID"
          type="search"
        />
      </label>
      <button
        className="min-h-10 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
        type="submit"
      >
        Search
      </button>
    </form>
  );
}

function AssignCandidateForm({
  candidate,
  returnTo,
  shop,
}: {
  candidate: PlatformShopAccessCandidate;
  returnTo: string;
  shop: ShopAdminAccessActionsProps["shop"];
}) {
  return (
    <form action={assignPlatformShopMemberAction} className="grid gap-3">
      <input name="profileId" type="hidden" value={candidate.profileId} />
      <input name="shopId" type="hidden" value={shop.shopId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className={labelClassName}>
          Assign as
          <select
            className={fieldClassName}
            disabled={!candidate.assignable}
            name="roleKey"
            required
          >
            <option value="shop_owner">shop_owner</option>
            <option value="shop_manager">shop_manager</option>
          </select>
        </label>
        <label className={labelClassName}>
          Reason
          <input
            className={fieldClassName}
            disabled={!candidate.assignable}
            maxLength={240}
            name="reason"
            placeholder="Approval reason"
            required
            type="text"
          />
        </label>
        <label className={labelClassName}>
          Confirm shop code
          <input
            className={fieldClassName}
            disabled={!candidate.assignable}
            name="shopCodeConfirmation"
            placeholder={shop.shopCode}
            required
            type="text"
          />
        </label>
        <PendingSubmitButton
          disabled={!candidate.assignable}
          pendingLabel="Assigning..."
        >
          Assign
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function CandidateRow({
  candidate,
  returnTo,
  shop,
}: {
  candidate: PlatformShopAccessCandidate;
  returnTo: string;
  shop: ShopAdminAccessActionsProps["shop"];
}) {
  return (
    <article className="grid gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-1 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-start">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">
            {candidate.displayName}
          </h3>
          <p className="break-words text-sm leading-5 text-slate-600">
            {candidate.email}
          </p>
          <p className="font-mono text-xs text-slate-500">
            Profile {shortId(candidate.profileId)}
          </p>
        </div>
        <p className="text-sm text-slate-700">{candidate.accountState}</p>
        <p className="text-sm text-slate-700">{candidate.profileStatus}</p>
      </div>
      {!candidate.assignable && candidate.disabledReason ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {candidate.disabledReason}
        </p>
      ) : null}
      <AssignCandidateForm
        candidate={candidate}
        returnTo={returnTo}
        shop={shop}
      />
    </article>
  );
}

function RevokeMembershipForm({
  member,
  returnTo,
  shop,
}: {
  member: PlatformShopAccessMembership;
  returnTo: string;
  shop: ShopAdminAccessActionsProps["shop"];
}) {
  return (
    <form action={revokePlatformShopMemberAction} className="mt-3 grid gap-3">
      <input name="shopId" type="hidden" value={shop.shopId} />
      <input name="shopMemberId" type="hidden" value={member.shopMemberId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className={labelClassName}>
          Reason
          <input
            className={fieldClassName}
            maxLength={240}
            name="reason"
            placeholder="Revocation reason"
            required
            type="text"
          />
        </label>
        <label className={labelClassName}>
          Confirm shop code
          <input
            className={fieldClassName}
            name="shopCodeConfirmation"
            placeholder={shop.shopCode}
            required
            type="text"
          />
        </label>
        <PendingSubmitButton danger pendingLabel="Revoking...">
          Revoke
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function MembershipTable({
  activeOwners,
  memberships,
  returnTo,
  shop,
}: {
  activeOwners: number;
  memberships: readonly PlatformShopAccessMembership[];
  returnTo: string;
  shop: ShopAdminAccessActionsProps["shop"];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>
            <th className="px-3 py-2">Account</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Operational access</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {memberships.map((member) => {
            const lastOwnerBlocked =
              member.roleId === "Shop Owner" &&
              member.membershipStatus === "Active" &&
              activeOwners <= 1;

            return (
              <tr className="align-top" key={member.shopMemberId}>
                <td className="px-3 py-2">
                  <div className="max-w-[260px]">
                    <p className="truncate font-semibold text-slate-950">
                      {member.displayName}
                    </p>
                    <p className="break-words text-slate-600">{member.email}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {shortId(member.profileId)} / {shortId(member.shopMemberId)}
                    </p>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700">{member.roleId}</td>
                <td className="px-3 py-2 text-slate-700">
                  {member.membershipStatus} / {member.accountState}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {member.operationalAccess}
                </td>
                <td className="min-w-[260px] px-3 py-2">
                  {lastOwnerBlocked ? (
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Last active owner cannot be revoked until another owner is
                      assigned.
                    </p>
                  ) : member.canRevoke ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-rose-700 outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
                        Revoke membership
                      </summary>
                      <RevokeMembershipForm
                        member={member}
                        returnTo={returnTo}
                        shop={shop}
                      />
                    </details>
                  ) : (
                    <span className="text-sm text-slate-500">Non-active</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ShopAdminAccessActions({
  candidates,
  lastResult,
  memberships,
  returnTo,
  searchQuery,
  shop,
}: ShopAdminAccessActionsProps) {
  const message = resultMessage(lastResult);
  const { activeOwners } = roleCounts(memberships);

  return (
    <div className="grid gap-4">
      {message ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
          Last admin access action: {message}
        </p>
      ) : null}

      <SearchForm searchQuery={searchQuery} />

      {searchQuery ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold text-slate-950">
            Search results
          </h3>
          {candidates.length > 0 ? (
            <div className="grid gap-3">
              {candidates.map((candidate) => (
                <CandidateRow
                  candidate={candidate}
                  key={candidate.profileId}
                  returnTo={returnTo}
                  shop={shop}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No matching profile or auth identity is visible through the safe
              server search.
            </p>
          )}
        </section>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Search by email, display name, or profile ID before assigning a
          personal web account.
        </p>
      )}

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold text-slate-950">
          Current owner and manager access
        </h3>
        {memberships.length > 0 ? (
          <MembershipTable
            activeOwners={activeOwners}
            memberships={memberships}
            returnTo={returnTo}
            shop={shop}
          />
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No personal account membership records are linked to this shop.
          </p>
        )}
      </section>
    </div>
  );
}
