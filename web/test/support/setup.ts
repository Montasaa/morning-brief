import { afterEach, beforeEach, vi } from "vitest";
import { closeAllTestApps } from "./test-app";

// No real network in tests: every outside service goes through the fakes in
// src/server/outside/fakes.ts, so a stray fetch is a bug and fails loudly.
beforeEach(() => {
  vi.stubGlobal("fetch", (input: unknown) => {
    throw new Error(`Real network call in a test: ${String(input)}. Use the outside-services fakes.`);
  });
});

// Every test app (scratch DB + fakes) started in a test is closed after it.
afterEach(() => {
  closeAllTestApps();
  vi.unstubAllGlobals();
});
