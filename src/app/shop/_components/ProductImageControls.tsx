"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateProductImageCacheScope,
  cacheProductImageBlob,
  createProductImageObjectUrl,
  loadProductImage,
  prepareProductImage,
  purgeProductImageCache,
  releaseProductImageObjectUrl,
  removeProductImage,
  uploadProductImage,
  type PreparedProductImage,
  type ProductImageOperationStage,
  type ProductImageRef,
  type ProductImageVariant,
} from "@/lib/product-images/browser-client";

type ProductImageLabels = Record<string, string> | undefined;

const PRODUCT_IMAGE_PREPARED_EVENT =
  "merchandise-control:product-image-prepared";

function reportPreparedProductImageForMetrics(prepared: PreparedProductImage) {
  if (document.documentElement.dataset.productImageMetrics !== "enabled") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PRODUCT_IMAGE_PREPARED_EVENT, { detail: prepared }),
  );
}

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
  enabled?: boolean;
  productId: string;
  shopId: string;
  variant: ProductImageVariant;
  versionId: string | null;
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    errorCode?: string;
    objectUrl: string | null;
    status: "empty" | "error" | "loading" | "ready";
  }>({ objectUrl: null, status: input.versionId ? "loading" : "empty" });

  useEffect(() => {
    void activateProductImageCacheScope({
      cacheScope: input.cacheScope,
      shopId: input.shopId,
    }).catch(() => {
      // A restricted or unavailable Cache Storage implementation is non-fatal.
    });
  }, [input.cacheScope, input.shopId]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();

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

    if (input.enabled === false) {
      queueMicrotask(() => {
        if (active) {
          setState({ objectUrl: null, status: "loading" });
        }
      });
      return () => {
        active = false;
        controller.abort();
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
    void loadProductImage(ref, input.cacheScope, controller.signal)
      .then((result) => {
        objectUrl = result.objectUrl;
        if (active) {
          setState({ objectUrl, status: "ready" });
        } else {
          releaseProductImageObjectUrl(objectUrl);
        }
      })
      .catch((error) => {
        if (
          error instanceof Error &&
          error.message === "image_operation_cancelled"
        ) {
          return;
        }
        if (active) {
          const code = error instanceof Error ? error.message : "";
          setState({
            errorCode: /^image_[a-z0-9_]+$/.test(code)
              ? code
              : "image_load_failed",
            objectUrl: null,
            status: "error",
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) {
        releaseProductImageObjectUrl(objectUrl);
      }
    };
  }, [
    input.cacheScope,
    input.enabled,
    input.productId,
    input.shopId,
    input.variant,
    input.versionId,
    reloadToken,
  ]);

  return { ...state, retry: () => setReloadToken((value) => value + 1) };
}

function useVisibilityGate(active: boolean) {
  const targetRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => setVisible(false));
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const target = targetRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "256px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  return { targetRef, visible };
}

async function predecodeObjectUrl(objectUrl: string, signal: AbortSignal) {
  if (signal.aborted) throw new Error("image_operation_cancelled");
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  if (signal.aborted) throw new Error("image_operation_cancelled");
}

function useProgressiveProductImage(input: {
  cacheScope?: string;
  productId: string;
  shopId: string;
  versionId: string | null;
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    errorCode?: string;
    mainUrl: string | null;
    status: "empty" | "error" | "loading" | "main" | "thumb";
    thumbUrl: string | null;
  }>({
    mainUrl: null,
    status: input.versionId ? "loading" : "empty",
    thumbUrl: null,
  });

  useEffect(() => {
    void activateProductImageCacheScope({
      cacheScope: input.cacheScope,
      shopId: input.shopId,
    }).catch(() => {
      // Cache Storage is optional; network rendering still remains available.
    });
  }, [input.cacheScope, input.shopId]);

  useEffect(() => {
    let active = true;
    let thumbUrl: string | null = null;
    let mainUrl: string | null = null;
    const controller = new AbortController();

    if (!input.versionId) {
      queueMicrotask(() => {
        if (active) {
          setState({ mainUrl: null, status: "empty", thumbUrl: null });
        }
      });
      return () => {
        active = false;
      };
    }

    const load = async () => {
      setState({ mainUrl: null, status: "loading", thumbUrl: null });
      const common = {
        productId: input.productId,
        shopId: input.shopId,
        versionId: input.versionId as string,
      };
      try {
        const thumb = await loadProductImage(
          { ...common, variant: "thumb" },
          input.cacheScope,
          controller.signal,
        );
        thumbUrl = thumb.objectUrl;
        if (!active) {
          releaseProductImageObjectUrl(thumbUrl);
          thumbUrl = null;
          return;
        }
        setState({ mainUrl: null, status: "thumb", thumbUrl });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "image_operation_cancelled"
        ) {
          return;
        }
      }

      try {
        const main = await loadProductImage(
          { ...common, variant: "main" },
          input.cacheScope,
          controller.signal,
        );
        mainUrl = main.objectUrl;
        await predecodeObjectUrl(mainUrl, controller.signal);
        if (!active) {
          releaseProductImageObjectUrl(mainUrl);
          mainUrl = null;
          return;
        }
        setState({
          mainUrl,
          status: thumbUrl ? "thumb" : "loading",
          thumbUrl,
        });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (active) setState({ mainUrl, status: "main", thumbUrl });
          });
        });
      } catch (error) {
        releaseProductImageObjectUrl(mainUrl);
        mainUrl = null;
        if (
          error instanceof Error &&
          error.message === "image_operation_cancelled"
        ) {
          return;
        }
        if (active) {
          const code = error instanceof Error ? error.message : "";
          setState({
            errorCode: /^image_[a-z0-9_]+$/.test(code)
              ? code
              : "image_load_failed",
            mainUrl: null,
            status: "error",
            thumbUrl,
          });
        }
      }
    };
    void load();

    return () => {
      active = false;
      controller.abort();
      releaseProductImageObjectUrl(mainUrl);
      releaseProductImageObjectUrl(thumbUrl);
    };
  }, [
    input.cacheScope,
    input.productId,
    input.shopId,
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
      aria-live={
        status === "loading" || status === "error" ? "polite" : undefined
      }
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
  const hasImage = Boolean(shopId && versionId);
  const { targetRef, visible } = useVisibilityGate(hasImage);
  const image = useProductImageObjectUrl({
    cacheScope,
    enabled: visible,
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
      <span
        className="block size-14 shrink-0"
        data-product-image-error={image.errorCode}
        data-product-image-thumbnail
        ref={targetRef}
      >
        <ImagePlaceholder
          compact
          label={`${label}: ${productName}`}
          status={status}
        />
      </span>
    );
  }

  return (
    <span
      className="block size-14 shrink-0"
      data-product-image-thumbnail
      ref={targetRef}
    >
      {/* Blob URLs are verified JPEG bytes and intentionally bypass Next remote-image persistence. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={productName}
        className="size-14 rounded-md border border-zinc-200 bg-white object-cover"
        decoding="async"
        loading="lazy"
        src={image.objectUrl}
      />
    </span>
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
  const image = useProgressiveProductImage({
    cacheScope,
    productId,
    shopId,
    versionId,
  });

  if (!image.thumbUrl && !image.mainUrl) {
    const status =
      image.status === "error"
        ? "error"
        : image.status === "empty"
          ? "empty"
          : "loading";
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
    <div className="grid gap-2">
      <div
        className="relative aspect-square w-full min-h-40 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
        data-product-image-progressive-stage={image.status}
      >
        {image.thumbUrl ? (
          // Blob URLs keep signed read URLs out of markup and provide scoped offline bytes.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={image.mainUrl ? "" : alt}
            aria-hidden={image.mainUrl ? true : undefined}
            className="absolute inset-0 size-full object-contain"
            decoding="async"
            src={image.thumbUrl}
          />
        ) : null}
        {image.mainUrl ? (
          // Main bytes are decoded before this layer is mounted for the crossfade.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={alt}
            className={[
              "absolute inset-0 size-full object-contain transition-opacity duration-200 motion-reduce:transition-none",
              image.status === "main" ? "opacity-100" : "opacity-0",
            ].join(" ")}
            decoding="async"
            src={image.mainUrl}
          />
        ) : null}
      </div>
      {image.status === "error" ? (
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

function friendlyImageError(
  error: unknown,
  translate: (value: string) => string,
) {
  const code = error instanceof Error ? error.message : "";
  if (code === "image_input_format_unsupported") {
    return translate("Choose a JPEG or PNG image.");
  }
  if (code === "image_input_size_invalid") {
    return translate("The selected image is too large to process.");
  }
  if (code === "image_output_budget_exceeded") {
    return translate(
      "The image cannot be reduced below the upload size limit.",
    );
  }
  if (code === "image_dimensions_invalid" || code === "image_decode_failed") {
    return translate("The selected image could not be decoded safely.");
  }
  if (code === "image_operation_cancelled") {
    return translate("Image operation cancelled. No product data was changed.");
  }
  if (code.includes("403") || code.includes("401")) {
    return translate("You are not authorized to change this product image.");
  }
  return translate(
    "The product image operation failed. The product data was not changed.",
  );
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
  const operationControllerRef = useRef<AbortController | null>(null);
  const [prepared, setPrepared] = useState<PreparedProductImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationStage, setOperationStage] =
    useState<ProductImageOperationStage | null>(null);
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
        releaseProductImageObjectUrl(previewUrl);
      }
    },
    [previewUrl],
  );

  useEffect(
    () => () => {
      operationControllerRef.current?.abort();
    },
    [],
  );

  const preparedSummary = useMemo(() => {
    if (!prepared) {
      return null;
    }
    return {
      main: prepared.main.metadata,
      text: `Main ${prepared.main.metadata.width} × ${prepared.main.metadata.height} · ${Math.ceil(
        prepared.main.metadata.bytes / 1024,
      )} KiB · Thumb ${prepared.thumb.metadata.width} × ${prepared.thumb.metadata.height} · ${Math.ceil(
        prepared.thumb.metadata.bytes / 1024,
      )} KiB`,
      thumb: prepared.thumb.metadata,
    };
  }, [prepared]);

  function progressMessage(stage: ProductImageOperationStage) {
    if (stage === "preprocess") return translate("Preparing image…");
    if (stage === "intent") return translate("Starting secure upload…");
    if (stage === "upload-main") return translate("Uploading main image…");
    if (stage === "upload-thumb") return translate("Uploading thumbnail…");
    return translate("Finalizing product image…");
  }

  function reportProgress(
    controller: AbortController,
    stage: ProductImageOperationStage,
  ) {
    if (operationControllerRef.current !== controller) return;
    setOperationStage(stage);
    setMessage({ text: progressMessage(stage), tone: "info" });
  }

  async function selectFile(file: File | undefined) {
    if (!file) {
      return;
    }
    operationControllerRef.current?.abort();
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setBusy(true);
    setOperationStage("preprocess");
    setConfirmRemove(false);
    setMessage({ text: translate("Preparing image…"), tone: "info" });
    try {
      const next = await prepareProductImage(file, {
        onProgress: (stage) => reportProgress(controller, stage),
        signal: controller.signal,
      });
      reportPreparedProductImageForMetrics(next);
      const nextPreview = createProductImageObjectUrl(next.main.blob);
      setPreviewUrl((previous) => {
        if (previous) {
          releaseProductImageObjectUrl(previous);
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
      if (operationControllerRef.current === controller) {
        operationControllerRef.current = null;
        setOperationStage(null);
        setBusy(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
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
    operationControllerRef.current?.abort();
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setBusy(true);
    setOperationStage("intent");
    setMessage({ text: progressMessage("intent"), tone: "info" });
    try {
      const result = await uploadProductImage({
        onProgress: (stage) => reportProgress(controller, stage),
        prepared,
        productId,
        signal: controller.signal,
        shopId,
      });
      const effectiveScope = result.cacheScope ?? cacheScope;
      if (effectiveScope) {
        try {
          await Promise.all([
            cacheProductImageBlob(
              effectiveScope,
              {
                productId,
                shopId,
                variant: "main",
                versionId: result.versionId,
              },
              prepared.main.blob,
            ),
            cacheProductImageBlob(
              effectiveScope,
              {
                productId,
                shopId,
                variant: "thumb",
                versionId: result.versionId,
              },
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
      if (operationControllerRef.current === controller) {
        operationControllerRef.current = null;
        setOperationStage(null);
        setBusy(false);
      }
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
      await removeProductImage({
        productId,
        shopId,
        versionId: currentVersionId,
      });
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
      setMessage({
        text: translate("Product image removed."),
        tone: "success",
      });
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
            <p
              className="mt-1 font-mono text-xs text-zinc-500"
              data-product-image-main-bytes={preparedSummary.main.bytes}
              data-product-image-main-height={preparedSummary.main.height}
              data-product-image-main-width={preparedSummary.main.width}
              data-product-image-prepared-summary
              data-product-image-thumb-bytes={preparedSummary.thumb.bytes}
              data-product-image-thumb-height={preparedSummary.thumb.height}
              data-product-image-thumb-width={preparedSummary.thumb.width}
            >
              {preparedSummary.text}
            </p>
          ) : null}
        </div>

        {!online ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {translate(
              "Offline: cached images remain visible, but upload and removal are disabled.",
            )}
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
              onChange={(event) =>
                void selectFile(event.currentTarget.files?.[0])
              }
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
            {busy && operationStage ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-950"
                onClick={() => operationControllerRef.current?.abort()}
                type="button"
              >
                {translate("Cancel operation")}
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
