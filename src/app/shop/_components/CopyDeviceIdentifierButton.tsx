"use client";

import { useState } from "react";

type CopyDeviceIdentifierButtonProps = {
  label?: string;
  value: string;
};

export function CopyDeviceIdentifierButton({
  label = "Copy identifier",
  value,
}: CopyDeviceIdentifierButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyIdentifier() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
      onClick={copyIdentifier}
      type="button"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
