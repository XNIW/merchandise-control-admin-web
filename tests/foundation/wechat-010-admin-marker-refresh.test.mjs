import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual component callbacks with isolated timers and DOM/fetch ports.
// The optional path runs the same regressions against a saved pre-fix source.
const source = readFileSync(
  process.env.WECHAT_SHOP_SHELL_TEST_SOURCE ?? "src/components/shop/ShopShell.tsx",
  "utf8",
);
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "component anchors changed; inspect the harness");
  return source.slice(a, b);
}
const program = ts.transpileModule([
  section("function activeElementIsFormField() {", "function ShopPendingNavigationSkeleton("),
  section("  const scheduleCurrentShopRouteRefresh = useCallback", "\n  useEffect(() => {"),
  section("  useEffect(() => {\n    function handle", "\n  useEffect(() => {\n    if (!activeShopId || courierOnly)"),
  section("  useEffect(() => {\n    if (!activeShopId || courierOnly)", "\n  useEffect(() => {\n    if (!courierOnly || courierRouteAllowed)"),
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ focused = false, throttled = false } = {}) {
  let now = 10_000;
  let nextId = 0;
  let marker = "m1";
  let responseOk = true;
  let cleanups = [];
  const timers = new Map();
  const refreshes = [];
  const requests = [];
  const navigator = { onLine: true };
  const listeners = { window: new Map(), document: new Map() };
  class Input {}
  class Select {}
  class Textarea {}
  const document = {
    visibilityState: "visible",
    activeElement: focused ? new Input() : null,
    addEventListener: (name, fn) => add("document", name, fn),
    removeEventListener: (name, fn) => listeners.document.get(name)?.delete(fn),
  };
  function add(target, name, fn) {
    if (!listeners[target].has(name)) listeners[target].set(name, new Set());
    listeners[target].get(name).add(fn);
  }
  const refs = {
    lastFocusRefreshAtRef: { current: throttled ? now : 0 },
    focusRefreshTimerRef: { current: null },
  };
  function mount(shop = "synthetic-shop-a") {
    const context = {
      document, HTMLInputElement: Input, HTMLSelectElement: Select,
      HTMLTextAreaElement: Textarea, navigator,
      activeShopId: shop, courierOnly: false, AbortController, encodeURIComponent,
      Date: { now: () => now }, ...refs,
      router: { refresh: () => refreshes.push(shop) },
      useCallback: (fn) => fn,
      useEffect: (fn) => cleanups.push(fn()),
      fetch: async (url, options) => {
        requests.push({ url, signal: options.signal });
        return { ok: responseOk, json: async () => ({ eventMarker: marker }) };
      },
      window: {
        setTimeout: (fn, delay) => {
          const id = ++nextId;
          timers.set(id, { fn, at: now + delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
        addEventListener: (name, fn) => add("window", name, fn),
        removeEventListener: (name, fn) => listeners.window.get(name)?.delete(fn),
      },
    };
    vm.runInNewContext(program, context, { timeout: 1_000 });
  }
  function stop() {
    for (const cleanup of cleanups) cleanup?.();
    cleanups = [];
  }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const task = [...timers].filter(([, item]) => item.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!task) break;
      timers.delete(task[0]);
      now = Math.max(now, task[1].at);
      await task[1].fn();
    }
    now = end;
  }
  mount();
  return {
    document, refreshes, requests, timers, stop, mount, advance,
    focus: (value = true) => { document.activeElement = value ? new Input() : null; },
    marker: (value) => { marker = value; },
    response: (value) => { responseOk = value; },
    online: (value) => { navigator.onLine = value; },
    jump: (ms) => { now += ms; },
    emit: (name, target = "window") => {
      for (const fn of listeners[target].get(name) ?? []) fn({ persisted: true });
    },
  };
}

test("focused form defers a marker; identical polls refresh once after release", async () => {
  const h = harness({ focused: true });
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 0);
  h.focus(false);
  await h.advance(3_200);
  assert.equal(h.refreshes.length, 1);
  await h.advance(9_000);
  assert.equal(h.refreshes.length, 1);
  h.marker("m2");
  await h.advance(3_000);
  assert.equal(h.refreshes.length, 2);
  h.stop();
});

test("throttle defers without consuming the same marker", async () => {
  const h = harness({ throttled: true });
  await h.advance(200);
  assert.equal(h.refreshes.length, 0);
  await h.advance(3_000);
  assert.equal(h.refreshes.length, 1);
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});

test("focus acquired within the 200ms timer prevents refresh and keeps the marker", async () => {
  const h = harness();
  await h.advance(100);
  h.focus();
  await h.advance(100);
  assert.equal(h.refreshes.length, 0);
  h.focus(false);
  await h.advance(3_000);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});

test("visibility acquired within the timer is rechecked; return retries the marker", async () => {
  const h = harness();
  await h.advance(100);
  h.document.visibilityState = "hidden";
  await h.advance(3_100);
  assert.equal(h.refreshes.length, 0);
  h.document.visibilityState = "visible";
  await h.advance(3_000);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});

test("offline within the timer defers acknowledgement; reconnect retries the same marker once", async () => {
  const h = harness();
  await h.advance(100);
  h.online(false);
  await h.advance(100);
  assert.equal(h.refreshes.length, 0);
  h.online(true);
  await h.advance(3_000);
  assert.equal(h.refreshes.length, 1);
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});

test("focus/pageshow cancellation never acknowledges an uninvoked marker callback", async () => {
  const h = harness();
  await h.advance(0);
  h.jump(2_500); // A busy event loop has not invoked the queued 200ms callback.
  h.emit("pageshow");
  await h.advance(200);
  assert.equal(h.refreshes.length, 1, "generic pageshow refresh executes");
  await h.advance(3_500);
  assert.equal(h.refreshes.length, 2, "unacknowledged same marker retries");
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 2);
  h.stop();
});

test("unmount aborts polling and prevents a stale queued callback from refreshing", async () => {
  const h = harness();
  await h.advance(0);
  const callback = [...h.timers.values()].find((item) => item.at === 10_200).fn;
  h.stop();
  assert.equal(h.timers.size, 0);
  assert.ok(h.requests[0].signal.aborted);
  callback();
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 0);
});

test("scope cleanup prevents old-shop refresh; a new-shop marker survives throttle", async () => {
  const h = harness();
  await h.advance(0);
  const oldCallback = [...h.timers.values()].find((item) => item.at === 10_200).fn;
  h.stop();
  h.mount("synthetic-shop-b");
  oldCallback();
  await h.advance(3_200);
  assert.deepEqual(h.refreshes, ["synthetic-shop-b"]);
  assert.ok(h.requests.slice(1).every(({ url }) => url.endsWith("synthetic-shop-b")));
  h.stop();
});

test("HTTP failure retains the marker and existing backoff before recovery", async () => {
  const h = harness();
  h.response(false);
  await h.advance(5_999);
  assert.equal(h.requests.length, 1);
  assert.equal(h.refreshes.length, 0);
  h.response(true);
  await h.advance(201);
  assert.equal(h.requests.length, 2);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});

test("a cancelled old callback cannot clear the new scope timer handle", async () => {
  const h = harness();
  await h.advance(0);
  const oldCallback = [...h.timers.values()].find((item) => item.at === 10_200).fn;
  h.stop();
  h.mount("synthetic-shop-b");
  await h.advance(3_000);
  oldCallback();
  h.stop();
  assert.equal(h.timers.size, 0, "new timer remains owned and can be cancelled");
  await h.advance(6_000);
  assert.equal(h.refreshes.length, 0);
});

test("native focus listener schedules normally without treating the Event as options", async () => {
  const h = harness({ focused: true });
  await h.advance(0);
  h.focus(false);
  h.emit("focus");
  await h.advance(200);
  assert.equal(h.refreshes.length, 1);
  h.stop();
});
