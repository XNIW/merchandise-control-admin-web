import {
  inviteShopMemberAction,
  removeShopMemberAction,
  updateShopMemberRoleAction,
} from "@/app/shop/actions";

type MemberActionPanelProps = {
  selectedShopId?: string;
};

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
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
        name={name}
        required={required}
        type="text"
      />
    </label>
  );
}

function RoleSelect() {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      Role
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
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
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Invite member</h2>
        <form action={inviteShopMemberAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Profile id" name="profileId" required />
          <RoleSelect />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Invite member
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Update role</h2>
        <form action={updateShopMemberRoleAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Member row id" name="memberId" required />
          <RoleSelect />
          <TextInput label="Type ROLE as confirmation" name="confirmation" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Update role
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Remove member</h2>
        <form action={removeShopMemberAction} className="mt-3 grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Member row id" name="memberId" required />
          <TextInput label="Reason" name="reason" required />
          <TextInput label="Type REMOVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Remove member
          </button>
        </form>
      </section>
    </div>
  );
}
