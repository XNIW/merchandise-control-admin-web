import {
  inviteShopMemberAction,
  removeShopMemberAction,
  updateShopMemberRoleAction,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type MemberActionPanelProps = {
  labels?: MemberActionPanelLabels;
  selectedShopId?: string;
};

export type MemberActionPanelLabels = {
  inviteMember: string;
  memberRowId: string;
  profileId: string;
  reason: string;
  removeMember: string;
  role: string;
  roleShopManager: string;
  roleShopOwner: string;
  roleViewer: string;
  typeRemoveConfirmation: string;
  typeRoleConfirmation: string;
  updateRole: string;
};

const defaultMemberActionLabels: MemberActionPanelLabels = {
  inviteMember: "Invite member",
  memberRowId: "Member row id",
  profileId: "Profile id",
  reason: "Reason",
  removeMember: "Remove member",
  role: "Role",
  roleShopManager: "Shop manager",
  roleShopOwner: "Shop owner",
  roleViewer: "Viewer",
  typeRemoveConfirmation: "Type REMOVE as confirmation",
  typeRoleConfirmation: "Type ROLE as confirmation",
  updateRole: "Update role",
};

const memberActionCardClassName =
  "flex min-h-[14rem] min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const memberFormClassName = "mt-3 flex min-w-0 flex-1 flex-col gap-3";
const memberInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const memberSelectClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const memberButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto";
const memberWarningButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 sm:w-auto";

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function TextInput({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className={memberInputClassName}
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

function RoleSelect({ labels }: { labels: MemberActionPanelLabels }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      {labels.role}
      <select
        className={memberSelectClassName}
        name="roleKey"
        required
      >
        <option value="shop_manager">{labels.roleShopManager}</option>
        <option value="viewer">{labels.roleViewer}</option>
        <option value="shop_owner">{labels.roleShopOwner}</option>
      </select>
    </label>
  );
}

export function MemberActionPanel({
  labels = defaultMemberActionLabels,
  selectedShopId,
}: MemberActionPanelProps) {
  const usesDefaultLabels = labels === defaultMemberActionLabels;

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-3`}>
      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.inviteMember}
        </h2>
        <form action={inviteShopMemberAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.profileId} name="profileId" required />
          <RoleSelect labels={labels} />
          <button className={memberButtonClassName}>
            {labels.inviteMember}
          </button>
        </form>
      </section>

      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.updateRole}
        </h2>
        <form action={updateShopMemberRoleAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.memberRowId} name="memberId" required />
          <RoleSelect labels={labels} />
          <TextInput
            label={labels.typeRoleConfirmation}
            name="confirmation"
            required
          />
          <button className={memberButtonClassName}>
            {labels.updateRole}
          </button>
        </form>
      </section>

      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">
          {labels.removeMember}
        </h2>
        <form action={removeShopMemberAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label={labels.memberRowId} name="memberId" required />
          {usesDefaultLabels ? (
            <TextInput label="Reason" name="reason" required />
          ) : (
            <TextInput label={labels.reason} name="reason" required />
          )}
          <TextInput
            label={labels.typeRemoveConfirmation}
            name="confirmation"
            required
          />
          <button className={memberWarningButtonClassName}>
            {labels.removeMember}
          </button>
        </form>
      </section>
    </div>
  );
}
