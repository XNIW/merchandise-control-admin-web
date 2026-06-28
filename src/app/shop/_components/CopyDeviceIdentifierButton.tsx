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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyIdentifier() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <button
      aria-live="polite"
      className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700 sm:h-8 sm:min-h-0 sm:px-2.5 sm:text-xs"
      onClick={copyIdentifier}
      type="button"
    >
      {copyState === "copied"
        ? "Copied"
        : copyState === "failed"
          ? "Copy failed"
          : label}
    </button>
  );
}
