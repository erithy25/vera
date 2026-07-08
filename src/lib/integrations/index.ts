// Integrations surface (Schicht 7). Pure adapter registry + push planning;
// the fetch transport + DB wiring live in ../integrations-push.ts.
export { integrationAdapters, adapterFor, planPush } from "./core";
export { sendEntry } from "./send";
export type { PushPlan, PushCandidate, SkipReason } from "./core";
export type {
  IntegrationAdapter,
  ProviderId,
  PushableEntry,
  HttpRequest,
  AccountConfig,
  AccountField,
} from "./types";
