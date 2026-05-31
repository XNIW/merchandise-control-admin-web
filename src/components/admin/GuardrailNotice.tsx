type GuardrailNoticeProps = {
  title?: string;
  items: string[];
};

export function GuardrailNotice({
  title = "Safety rules",
  items,
}: GuardrailNoticeProps) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <p
            key={item}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-950"
          >
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
