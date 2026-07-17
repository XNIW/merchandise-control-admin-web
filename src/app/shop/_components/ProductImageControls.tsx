"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cacheProductImageBlob,
  loadProductImage,
  prepareProductImage,
  purgeProductImageCache,
  removeProductImage,
  uploadProductImage,
  type PreparedProductImage,
  type ProductImageRef,
  type ProductImageVariant,
} from "@/lib/product-images/browser-client";

type ProductImageLabels = Record<string, string> | undefined;

function useOnlineState() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

function useProductImageObjectUrl(input: {
  cacheScope?: string;
  productId: string;
  shopId: string;
  variant: ProductImageVariant;
  versionId: string | null;
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    objectUrl: string | null;
    status: "empty" | "error" | "loading" | "ready";
  }>({ objectUrl: null, status: input.versionId ? "loading" : "empty" });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!input.versionId) {
      queueMicrotask(() => {
        if (active) {
          setState({ objectUrl: null, status: "empty" });
        }
      });
      return () => {
        active = false;
      };
    }

    const ref: ProductImageRef = {
      productId: input.productId,
      shopId: input.shopId,
      variant: input.variant,
      versionId: input.versionId,
    };
    queueMicrotask(() => {
      if (active) {
        setState({ objectUrl: null, status: "loading" });
      }
    });
    void loadProductImage(ref, input.cacheScope)
      .then((result) => {
        objectUrl = result.objectUrl;
        if (active) {
          setState({ objectUrl, status: "ready" });
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch(() => {
        if (active) {
          setState({ objectUrl: null, status: "error" });
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    input.cacheScope,
    input.productId,
    input.shopId,
    input.variant,
    input.versionId,
    reloadToken,
  ]);

  return { ...state, retry: () => setReloadToken((value) => value + 1) };
}

function ImagePlaceholder({
  compact = false,
  label,
  status,
}: {
  compact?: boolean;
  label: string;
  status: "empty" | "error" | "loading";
}) {
  return (
    <span
      aria-label={label}
      aria-live={status === "loading" || status === "error" ? "polite" : undefined}
      className={[
        "grid shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-400",
        compact ? "size-14" : "aspect-square w-full min-h-40",
        status === "loading" ? "animate-pulse" : "",
        status === "error" ? "border-amber-200 bg-amber-50 text-amber-700" : "",
      ].join(" ")}
      role="img"
    >
      <svg
        className={compact ? "size-5" : "size-10"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
      >
        <rect height="16" rx="2" width="18" x="3" y="4" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 4 4 2-2 5 4" />
      </svg>
    </span>
  );
}

export function ProductImageThumbnail({
  cacheScope,
  productId,
  productName,
  labels,
  shopId,
  versionId,
}: {
  cacheScope?: string;
  labels?: ProductImageLabels;
  productId: string;
  productName: string;
  shopId?: string;
  versionId?: string | null;
}) {
  const translate = (value: string) => labels?.[value] ?? value;
  const image = useProductImageObjectUrl({
    cacheScope,
    productId,
    shopId: shopId ?? "",
    variant: "thumb",
    versionId: shopId && versionId ? versionId : null,
  });

  if (image.status !== "ready" || !image.objectUrl) {
    const status = image.status === "ready" ? "error" : image.status;
    const label =
      status === "loading"
        ? translate("Loading product image")
        : status === "error"
          ? translate("Product image unavailable")
          : translate("No product image");
    return (
      <ImagePlaceholder
        compact
        label={`${label}: ${productName}`}
        status={status}
      />
    );
  }

  return (
    // Blob URLs are verified JPEG bytes and intentionally bypass Next remote-image persistence.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={productName}
      className="size-14 shrink-0 rounded-md border border-zinc-200 bg-white object-cover"
      decoding="async"
      loading="lazy"
      src={image.objectUrl}
    />
  );
}

function CurrentProductImage({
  alt,
  cacheScope,
  productId,
  shopId,
  versionId,
  translate,
}: {
  alt: string;
  cacheScope?: string;
  productId: string;
  shopId: string;
  versionId: string | null;
  translate: (value: string) => string;
}) {
  const image = useProductImageObjectUrl({
    cacheScope,
    productId,
    shopId,
    variant: "main",
    versionId,
  });

  if (image.status !== "ready" || !image.objectUrl) {
    const status = image.status === "ready" ? "error" : image.status;
    const label =
      status === "loading"
        ? translate("Loading product image")
        : status === "error"
          ? translate("Product image unavailable")
          : translate("No product image");
    return (
      <div className="grid gap-2">
        <ImagePlaceholder label={label} status={status} />
        {status === "error" ? (
          <button
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900"
            onClick={image.retry}
            type="button"
          >
            {translate("Retry image")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    // Blob URLs keep signed read URLs out of markup and provide account-scoped offline bytes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className="aspect-square w-full min-h-40 rounded-md border border-zinc-200 bg-white object-contain"
      decoding="async"
      src={image.objectUrl}
    />
  );
}

function friendlyImageError(error: unknown, translate: (value: string) => string) {
  const code = error instanceof Error ? error.message : "";
  if (code === "image_input_format_unsupported") {
    return translate("Choose a JPEG or PNG image.");
  }
  if (code === "image_input_size_invalid") {
    return translate("The selected image is too large to process.");
  }
  if (code === "image_output_budget_exceeded") {
    return translate("The image cannot be reduced below the upload size limit.");
  }
  if (code === "image_dimensions_invalid" || code === "image_decode_failed") {
    return translate("The selected image could not be decoded safely.");
  }
  if (code.includes("403") || code.includes("401")) {
    return translate("You are not authorized to change this product image.");
  }
  return translate("The product image operation failed. The product data was not changed.");
}

export function ProductImageEditor({
  cacheScope,
  canManage,
  currentVersionId,
  labels,
  onBusyChange,
  onChanged,
  productId,
  productName,
  shopId,
}: {
  cacheScope?: string;
  canManage: boolean;
  currentVersionId: string | null;
  labels?: ProductImageLabels;
  onBusyChange?: (busy: boolean) => void;
  onChanged: (versionId: string | null) => void;
  productId: string;
  productName: string;
  shopId: string;
}) {
  const translate = (value: string) => labels?.[value] ?? value;
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedProductImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "info" | "success";
  } | null>(null);
  const online = useOnlineState();

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  const preparedSummary = useMemo(() => {
    if (!prepared) {
      return null;
    }
    return `${prepared.main.metadata.width} × ${prepared.main.metadata.height} · ${Math.ceil(
      prepared.main.metadata.bytes / 1024,
    )} KiB`;
  }, [prepared]);

  async function selectFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setBusy(true);
    setConfirmRemove(false);
    setMessage({ text: translate("Preparing image…"), tone: "info" });
    try {
      const next = await prepareProductImage(file);
      const nextPreview = URL.createObjectURL(next.main.blob);
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return nextPreview;
      });
      setPrepared(next);
      setMessage({
        text: online
          ? translate("Image ready to upload.")
          : translate("Image prepared. Connect to upload it."),
        tone: "success",
      });
    } catch (error) {
      setPrepared(null);
      setPreviewUrl(null);
      setMessage({ text: friendlyImageError(error, translate), tone: "error" });
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function upload() {
    if (!prepared || !online) {
      setMessage({
        text: translate("A network connection is required to upload an image."),
        tone: "error",
      });
      return;
    }
    setBusy(true);
    setMessage({ text: translate("Uploading and verifying image…"), tone: "info" });
    try {
      const result = await uploadProductImage({
        prepared,
        productId,
        shopId,
      });
      const effectiveScope = result.cacheScope ?? cacheScope;
      if (effectiveScope) {
        try {
          await Promise.all([
            cacheProductImageBlob(
              effectiveScope,
              { productId, shopId, variant: "main", versionId: result.versionId },
              prepared.main.blob,
            ),
            cacheProductImageBlob(
              effectiveScope,
              { productId, shopId, variant: "thumb", versionId: result.versionId },
              prepared.thumb.blob,
            ),
          ]);
          await purgeProductImageCache({
            cacheScope: effectiveScope,
            keepVersionId: result.versionId,
            productId,
            shopId,
          });
        } catch {
          // Finalize remains successful even when the optional local cache is unavailable.
        }
      }
      setPrepared(null);
      setPreviewUrl(null);
      setMessage({
        text:
          result.status === "noop"
            ? translate("This image is already current.")
            : translate("Product image updated."),
        tone: "success",
      });
      onChanged(result.versionId);
    } catch (error) {
      setMessage({ text: friendlyImageError(error, translate), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!currentVersionId || !online) {
      setMessage({
        text: translate("A network connection is required to remove an image."),
        tone: "error",
      });
      return;
    }
    setBusy(true);
    setMessage({ text: translate("Removing image…"), tone: "info" });
    try {
      await removeProductImage({ productId, shopId, versionId: currentVersionId });
      if (cacheScope) {
        try {
          await purgeProductImageCache({ cacheScope, productId, shopId });
        } catch {
          // Remote removal is authoritative; cache cleanup is best effort.
        }
      }
      setConfirmRemove(false);
      setPrepared(null);
      setPreviewUrl(null);
      setMessage({ text: translate("Product image removed."), tone: "success" });
      onChanged(null);
    } catch (error) {
      setMessage({ text: friendlyImageError(error, translate), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="grid gap-4 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]"
      data-product-image-editor
    >
      <div className="min-w-0">
        {previewUrl ? (
          // This is a locally generated blob URL; no signed URL is persisted in markup.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={translate("Selected product image preview")}
            className="aspect-square w-full min-h-40 rounded-md border border-zinc-200 bg-white object-contain"
            src={previewUrl}
          />
        ) : (
          <CurrentProductImage
            alt={productName}
            cacheScope={cacheScope}
            productId={productId}
            shopId={shopId}
            translate={translate}
            versionId={currentVersionId}
          />
        )}
      </div>
      <div className="grid min-w-0 content-start gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">
            {translate("Primary product image")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {translate(
              "JPEG or PNG. The image is resized locally, metadata is removed, and only a private JPEG is uploaded.",
            )}
          </p>
          {preparedSummary ? (
            <p className="mt-1 font-mono text-xs text-zinc-500">{preparedSummary}</p>
          ) : null}
        </div>

        {!online ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {translate("Offline: cached images remain visible, but upload and removal are disabled.")}
          </p>
        ) : null}

        {message ? (
          <p
            className={[
              "rounded-md border px-3 py-2 text-xs",
              message.tone === "error"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : message.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-sky-200 bg-sky-50 text-sky-950",
            ].join(" ")}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <input
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              className="sr-only"
              disabled={busy}
              onChange={(event) => void selectFile(event.currentTarget.files?.[0])}
              ref={inputRef}
              type="file"
            />
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {currentVersionId
                ? translate("Choose replacement")
                : translate("Choose image")}
            </button>
            {prepared ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-900 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || !online}
                onClick={() => void upload()}
                type="button"
              >
                {busy ? translate("Working…") : translate("Upload image")}
              </button>
            ) : null}
            {currentVersionId && !prepared ? (
              confirmRemove ? (
                <>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || !online}
                    onClick={() => void remove()}
                    type="button"
                  >
                    {translate("Confirm removal")}
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                    disabled={busy}
                    onClick={() => setConfirmRemove(false)}
                    type="button"
                  >
                    {translate("Cancel")}
                  </button>
                </>
              ) : (
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || !online}
                  onClick={() => setConfirmRemove(true)}
                  type="button"
                >
                  {translate("Remove image")}
                </button>
              )
            ) : null}
            {prepared ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                disabled={busy}
                onClick={() => {
                  setPrepared(null);
                  setPreviewUrl(null);
                  setMessage(null);
                }}
                type="button"
              >
                {translate("Discard selection")}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            {translate("You have read-only access to this product image.")}
          </p>
        )}
      </div>
    </section>
  );
}
