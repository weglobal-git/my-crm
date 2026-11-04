import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PIPELINE_CARD_DENSITY,
  getPipelineCardDensityStorageKey,
  parseExplicitPipelineCardDensity,
  parsePipelineCardDensity,
} from "./pipeline-card-density-shared";
import {
  getStoredPipelineCardDensityClient,
  saveStoredPipelineCardDensityClient,
} from "./pipeline-card-density-client";

test("Pipeline Card Density: defaults to compact when unset or corrupt", () => {
  assert.equal(DEFAULT_PIPELINE_CARD_DENSITY, "compact");
  assert.equal(parsePipelineCardDensity(null), "compact");
  assert.equal(parsePipelineCardDensity(undefined), "compact");
  assert.equal(parsePipelineCardDensity(""), "compact");
  assert.equal(parsePipelineCardDensity("unknown-mode"), "compact");
  assert.equal(parseExplicitPipelineCardDensity(null), null);
  assert.equal(parseExplicitPipelineCardDensity("invalid"), null);
});

test("Pipeline Card Density: parses valid raw and URI-encoded values", () => {
  assert.equal(parsePipelineCardDensity("standard"), "standard");
  assert.equal(parsePipelineCardDensity("compact"), "compact");
  assert.equal(parsePipelineCardDensity(encodeURIComponent('"standard"')), "standard");
  assert.equal(parseExplicitPipelineCardDensity("STANDARD"), "standard");
  assert.equal(parseExplicitPipelineCardDensity("COMPACT"), "compact");
});

test("Pipeline Card Density: storage key is isolated per userId", () => {
  assert.equal(
    getPipelineCardDensityStorageKey("user-1"),
    "crm_pipeline_card_density_user-1"
  );
  assert.notEqual(
    getPipelineCardDensityStorageKey("user-1"),
    getPipelineCardDensityStorageKey("user-2")
  );
});

test("Pipeline Card Density: client helper falls back to cookie when localStorage is empty and persists per user", () => {
  const store = new Map<string, string>();
  const cookieJar = new Map<string, string>();

  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const prevDocument = (globalThis as Record<string, unknown>).document;

  try {
    (globalThis as Record<string, unknown>).window = {};
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get cookie() {
          return Array.from(cookieJar.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
        },
        set cookie(raw: string) {
          const [pair] = raw.split(";");
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            cookieJar.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
          }
        },
      },
    });

    // 1. Unset -> defaults to compact
    assert.equal(getStoredPipelineCardDensityClient("alice"), "compact");

    // 2. Cookie has "standard" while localStorage is empty -> returns "standard"
    cookieJar.set(getPipelineCardDensityStorageKey("alice"), "standard");
    assert.equal(getStoredPipelineCardDensityClient("alice"), "standard");

    // 3. Another user ("bob") still defaults to "compact"
    assert.equal(getStoredPipelineCardDensityClient("bob"), "compact");

    // 4. Saving "compact" for alice updates both localStorage and cookie
    saveStoredPipelineCardDensityClient("alice", "compact");
    assert.equal(getStoredPipelineCardDensityClient("alice"), "compact");
    assert.equal(store.get(getPipelineCardDensityStorageKey("alice")), "compact");
    assert.equal(cookieJar.get(getPipelineCardDensityStorageKey("alice")), "compact");

    // 5. Saving "standard" for bob updates bob without affecting alice
    saveStoredPipelineCardDensityClient("bob", "standard");
    assert.equal(getStoredPipelineCardDensityClient("bob"), "standard");
    assert.equal(getStoredPipelineCardDensityClient("alice"), "compact");
  } finally {
    if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWindow;

    if (prevLocalStorage === undefined) delete (globalThis as Record<string, unknown>).localStorage;
    else (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;

    if (prevDocument === undefined) delete (globalThis as Record<string, unknown>).document;
    else Object.defineProperty(globalThis, "document", { configurable: true, value: prevDocument });
  }
});

