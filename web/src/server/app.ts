// The app context: the database, the outside services and the config, shared
// by every route handler. Route handlers call getAppContext(); tests install
// their own context (scratch DB + fakes) with setAppContext().
import { configFromEnv, type Config } from "./config";
import { openDatabase, type Db } from "./db";
import { realOutsideServices, type OutsideServices } from "./outside";
import { fakeOutsideServices } from "./outside/fakes";

export interface AppContext {
  db: Db;
  services: OutsideServices;
  config: Config;
}

export function createAppContext(opts: { config: Config; services: OutsideServices }): AppContext {
  return { db: openDatabase(opts.config.databasePath), services: opts.services, config: opts.config };
}

// Kept on globalThis so Next.js dev reloads and separate route bundles share one context.
const holder = globalThis as typeof globalThis & { __morningBriefApp?: AppContext | null };

export function getAppContext(): AppContext {
  if (!holder.__morningBriefApp) {
    // OUTSIDE_SERVICES=fake is for the e2e server and local demos only.
    const services = process.env.OUTSIDE_SERVICES === "fake" ? fakeOutsideServices() : realOutsideServices();
    holder.__morningBriefApp = createAppContext({ config: configFromEnv(), services });
  }
  return holder.__morningBriefApp;
}

export function setAppContext(ctx: AppContext | null): void {
  holder.__morningBriefApp = ctx;
}
