import "server-only";

type PerfMetaValue = boolean | number | string | null | undefined;
type PerfMeta = Record<string, PerfMetaValue>;

type PerfTiming = {
  label: string;
  ms: number;
};

type PerfMark = {
  label: string;
  meta?: PerfMeta;
};

export type AdminWebPerfTrace = {
  flush: (meta?: PerfMeta) => void;
  mark: (label: string, meta?: PerfMeta) => void;
  query: (label: string) => void;
  time: <T>(label: string, task: () => Promise<T>) => Promise<T>;
};

const enabled = process.env.ADMIN_WEB_PERF_DEBUG === "1";

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function sanitizeMeta(meta: PerfMeta | undefined) {
  if (!meta) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      typeof value === "string" ? value.slice(0, 80) : value,
    ]),
  );
}

export function createAdminWebPerfTrace(
  scope: string,
  initialMeta: PerfMeta = {},
): AdminWebPerfTrace {
  const startedAt = performance.now();
  const timings: PerfTiming[] = [];
  const marks: PerfMark[] = [];
  const queries = new Map<string, number>();

  function mark(label: string, meta?: PerfMeta) {
    if (!enabled) {
      return;
    }

    marks.push({ label, meta: sanitizeMeta(meta) });
  }

  function query(label: string) {
    if (!enabled) {
      return;
    }

    queries.set(label, (queries.get(label) ?? 0) + 1);
  }

  async function time<T>(label: string, task: () => Promise<T>) {
    if (!enabled) {
      return task();
    }

    const spanStartedAt = performance.now();

    try {
      return await task();
    } finally {
      timings.push({ label, ms: elapsedMs(spanStartedAt) });
    }
  }

  function flush(meta: PerfMeta = {}) {
    if (!enabled) {
      return;
    }

    console.info(
      "[admin-web-perf]",
      JSON.stringify({
        scope,
        totalMs: elapsedMs(startedAt),
        meta: sanitizeMeta({ ...initialMeta, ...meta }),
        timings,
        queries: Object.fromEntries(queries),
        marks,
      }),
    );
  }

  return {
    flush,
    mark,
    query,
    time,
  };
}
