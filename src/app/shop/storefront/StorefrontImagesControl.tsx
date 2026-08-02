"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import type {
  StorefrontImageCandidate,
  StorefrontImageOption,
} from "@/lib/storefront/admin-image-view";
import { sanitizeStorefrontWebp } from "./storefront-webp-sanitizer";

type Variant = "thumb" | "card" | "detail";
type Metadata = {
  bytes: number;
  height: number;
  mimeType: "image/webp";
  sha256: string;
  width: number;
};
type Prepared = Record<Variant, { blob: Blob; metadata: Metadata }>;
const VARIANTS = ["thumb", "card", "detail"] as const;
const LIMITS = {
  thumb: {
    maxBytes: 120 * 1024,
    maxSide: 384,
    minSide: 128,
    qualities: [0.76, 0.68, 0.6, 0.52],
  },
  card: {
    maxBytes: 360 * 1024,
    maxSide: 960,
    minSide: 384,
    qualities: [0.8, 0.74, 0.68, 0.6],
  },
  detail: {
    maxBytes: 900 * 1024,
    maxSide: 1600,
    minSide: 640,
    qualities: [0.82, 0.76, 0.7, 0.64],
  },
} as const;
const SIDE_FACTORS = [1, 0.86, 0.74, 0.64, 0.54, 0.45, 0.4] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string): never {
  const error = new Error(code);
  error.name = "StorefrontImageError";
  throw error;
}

async function postJson(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok || payload?.ok !== true) {
    fail(
      typeof payload?.code === "string" ? payload.code : "image_request_failed",
    );
  }
  return payload;
}

function dimensions(width: number, height: number, maximum: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    fail("image_dimensions_invalid");
  }
  const scale = Math.min(1, maximum / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob || blob.type !== "image/webp" || blob.size < 1) {
          reject(new Error("image_webp_encode_failed"));
          return;
        }
        const sanitized = sanitizeStorefrontWebp(
          new Uint8Array(await blob.arrayBuffer()),
        );
        if (!sanitized) {
          reject(new Error("image_webp_sanitize_failed"));
          return;
        }
        const normalized = Uint8Array.from(sanitized);
        resolve(new Blob([normalized.buffer], { type: "image/webp" }));
      },
      "image/webp",
      quality,
    );
  });
}

async function encodeVariant(image: ImageBitmap, variant: Variant) {
  const limit = LIMITS[variant];
  const maximum = Math.min(limit.maxSide, Math.max(image.width, image.height));
  const sides = Array.from(
    new Set([
      ...SIDE_FACTORS.map((factor) =>
        Math.max(limit.minSide, Math.floor(maximum * factor)),
      ),
      Math.min(maximum, limit.minSide),
    ]),
  ).filter((side) => side <= maximum);
  for (const side of sides) {
    const size = dimensions(image.width, image.height, side);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", {
      alpha: false,
      colorSpace: "srgb",
    });
    if (!context) fail("image_canvas_unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of limit.qualities) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= limit.maxBytes)
        return { blob, height: canvas.height, width: canvas.width };
    }
    canvas.width = 1;
    canvas.height = 1;
  }
  fail("image_output_budget_exceeded");
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function prepare(source: Blob): Promise<Prepared> {
  if (
    source.type !== "image/jpeg" ||
    source.size < 1 ||
    source.size > 1024 * 1024
  ) {
    fail("image_source_invalid");
  }
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    fail("image_decode_failed");
  }
  try {
    const encoded = await Promise.all(
      VARIANTS.map(async (variant) => {
        const item = await encodeVariant(image, variant);
        return [
          variant,
          {
            blob: item.blob,
            metadata: {
              bytes: item.blob.size,
              height: item.height,
              mimeType: "image/webp" as const,
              sha256: await sha256(item.blob),
              width: item.width,
            },
          },
        ] as const;
      }),
    );
    return Object.fromEntries(encoded) as Prepared;
  } finally {
    image.close();
  }
}

function safeUploadUrl(value: unknown, objectPath: unknown) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (
    typeof value !== "string" ||
    typeof objectPath !== "string" ||
    !configured
  )
    fail("image_signed_url_invalid");
  const url = new URL(value, window.location.origin);
  const origin = new URL(configured).origin;
  const marker = "/storage/v1/object/upload/sign/storefront-product-images/";
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(marker) ||
    decodeURIComponent(url.pathname.slice(marker.length)) !== objectPath ||
    objectPath.includes("..")
  )
    fail("image_signed_url_invalid");
  return url.toString();
}

async function upload(
  url: string,
  objectPath: string,
  blob: Blob,
  variant: Variant,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", blob, `${variant}.webp`);
  const response = await fetch(safeUploadUrl(url, objectPath), {
    body: form,
    cache: "no-store",
    credentials: "omit",
    headers: { "x-upsert": "false" },
    method: "PUT",
    signal,
  });
  if (!response.ok) fail("image_upload_failed");
}

export function StorefrontImagesControl({
  canManage,
  candidates,
  images,
  shopId,
}: {
  canManage: boolean;
  candidates: readonly StorefrontImageCandidate[];
  images: readonly StorefrontImageOption[];
  shopId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  async function publish(candidate: StorefrontImageCandidate) {
    if (!UUID.test(shopId) || !candidate.sourceReady || busy) return;
    const controller = new AbortController();
    setBusy(candidate.publicationId);
    setMessage("Caricamento sorgente privata…");
    try {
      const source = await fetch("/api/shop/storefront/images/source", {
        body: JSON.stringify({
          publicationId: candidate.publicationId,
          shopId,
          sourceImageVersionId: candidate.sourceImageVersionId,
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      if (
        !source.ok ||
        source.headers.get("content-type")?.split(";")[0] !== "image/jpeg"
      ) {
        const payload = (await source.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        fail(
          typeof payload?.code === "string"
            ? payload.code
            : "image_source_failed",
        );
      }
      setMessage("Creazione varianti WebP senza metadata…");
      const prepared = await prepare(await source.blob());
      const intent = await postJson(
        "/api/shop/storefront/images/intent",
        {
          publicationId: candidate.publicationId,
          shopId,
          sourceImageVersionId: candidate.sourceImageVersionId,
          variants: Object.fromEntries(
            VARIANTS.map((variant) => [variant, prepared[variant].metadata]),
          ),
        },
        controller.signal,
      );
      const imagePublicationId = intent.imagePublicationId;
      if (
        typeof imagePublicationId !== "string" ||
        !UUID.test(imagePublicationId)
      )
        fail("image_intent_invalid");
      if (intent.status === "upload_required") {
        const uploads = intent.uploads as Record<string, unknown>;
        const paths = intent.paths as Record<string, unknown>;
        setMessage("Upload immutabile thumb/card/detail…");
        await Promise.all(
          VARIANTS.map((variant) =>
            upload(
              String(uploads?.[variant] ?? ""),
              String(paths?.[variant] ?? ""),
              prepared[variant].blob,
              variant,
              controller.signal,
            ),
          ),
        );
      }
      setMessage("Verifica byte, dimensioni e pubblicazione atomica…");
      await postJson(
        "/api/shop/storefront/images/finalize",
        { imagePublicationId, shopId },
        controller.signal,
      );
      setMessage("Immagine pubblica pronta.");
      router.refresh();
    } catch (error) {
      setMessage(
        `Errore: ${error instanceof Error ? error.message : "image_operation_failed"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function rollback(image: StorefrontImageOption) {
    if (!canManage || busy) return;
    setBusy(image.id);
    setMessage("Verifica artifact e rollback atomico…");
    try {
      await postJson("/api/shop/storefront/images/rollback", {
        imagePublicationId: image.id,
        shopId,
      });
      setMessage("Rollback completato.");
      router.refresh();
    } catch (error) {
      setMessage(
        `Errore: ${error instanceof Error ? error.message : "image_rollback_failed"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      {!canManage ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Permesso storefront.images.manage richiesto per pubblicare o
          ripristinare.
        </p>
      ) : null}
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">Pipeline pubblica isolata</p>
        <p className="mt-1">
          La sorgente operativa privata viene letta server-side, ricampionata in
          WebP thumb/card/detail e pubblicata con URL versionati immutable.
          Nessun upload arbitrario dal cliente.
        </p>
        {message ? (
          <p aria-live="polite" className="mt-2 font-medium">
            {message}
          </p>
        ) : null}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Sorgenti pronte</h2>
        {candidates.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            Nessuna pubblicazione con immagine operativa primary ready.
          </p>
        ) : (
          candidates.map((candidate) => {
            const alreadyPublished = images.some(
              (image) =>
                image.current &&
                image.sourceImageVersionId === candidate.sourceImageVersionId,
            );
            return (
              <article
                className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                key={candidate.publicationId}
              >
                <div>
                  <p className="font-semibold">{candidate.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Sorgente {candidate.sourceImageVersionId.slice(0, 8)} ·{" "}
                    {candidate.sourceReady ? "ready" : "non pronta"}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                  disabled={
                    !canManage ||
                    !candidate.sourceReady ||
                    Boolean(busy) ||
                    alreadyPublished
                  }
                  onClick={() => publish(candidate)}
                  type="button"
                >
                  {busy === candidate.publicationId
                    ? "Pubblicazione…"
                    : alreadyPublished
                      ? "Già pubblicata"
                      : candidate.currentPublicImageId
                        ? "Sostituisci immagine"
                        : "Pubblica immagine"}
                </button>
              </article>
            );
          })
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Versioni pubbliche</h2>
        {images.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            Nessuna variante pubblica pronta.
          </p>
        ) : (
          images.map((image) => (
            <article
              className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center"
              key={image.id}
            >
              <div className="relative aspect-square overflow-hidden rounded-md bg-zinc-100">
                {image.thumbUrl ? (
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="80px"
                    src={image.thumbUrl}
                    unoptimized
                  />
                ) : null}
              </div>
              <div>
                <p className="font-semibold">
                  {image.current ? "Corrente" : image.status}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {image.id.slice(0, 8)} · {image.updatedAt ?? "—"}
                </p>
              </div>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400"
                disabled={
                  !canManage ||
                  image.current ||
                  image.status !== "superseded" ||
                  Boolean(busy)
                }
                onClick={() => rollback(image)}
                type="button"
              >
                {busy === image.id ? "Ripristino…" : "Ripristina"}
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
