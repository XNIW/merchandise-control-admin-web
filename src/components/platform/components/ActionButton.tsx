type ActionButtonProps = {
  label: string;
  description: string;
};

export function ActionButton({ label, description }: ActionButtonProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <button
        type="button"
        disabled
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-400"
        aria-describedby={`${label.toLowerCase().replaceAll(" ", "-")}-note`}
      >
        {label}
      </button>
      <p
        id={`${label.toLowerCase().replaceAll(" ", "-")}-note`}
        className="mt-2 text-xs leading-5 text-slate-600"
      >
        {description}
      </p>
    </div>
  );
}
