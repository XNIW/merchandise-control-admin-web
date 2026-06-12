import {
  inviteShopMemberAction,
  removeShopMemberAction,
  updateShopMemberRoleAction,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type MemberActionPanelProps = {
  selectedShopId?: string;
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

function RoleSelect() {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      Role
      <select
        className={memberSelectClassName}
        name="roleKey"
        required
      >
        <option value="shop_manager">Shop manager</option>
        <option value="viewer">Viewer</option>
        <option value="shop_owner">Shop owner</option>
      </select>
    </label>
  );
}

export function MemberActionPanel({ selectedShopId }: MemberActionPanelProps) {
  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-3`}>
      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">Invite member</h2>
        <form action={inviteShopMemberAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Profile id" name="profileId" required />
          <RoleSelect />
          <button className={memberButtonClassName}>
            Invite member
          </button>
        </form>
      </section>

      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">Update role</h2>
        <form action={updateShopMemberRoleAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Member row id" name="memberId" required />
          <RoleSelect />
          <TextInput label="Type ROLE as confirmation" name="confirmation" required />
          <button className={memberButtonClassName}>
            Update role
          </button>
        </form>
      </section>

      <section className={memberActionCardClassName}>
        <h2 className="text-base font-semibold text-zinc-950">Remove member</h2>
        <form action={removeShopMemberAction} className={memberFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Member row id" name="memberId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type REMOVE as confirmation" name="confirmation" required />
          <button className={memberWarningButtonClassName}>
            Remove member
          </button>
        </form>
      </section>
    </div>
  );
}
