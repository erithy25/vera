// Direct integrations (Schicht 7): push confirmed billing entries into the
// user's own billing tool over its official API. This is the FIRST time the
// app transmits to a third-party host — so it is strictly opt-in, per-provider,
// and sends ONLY the confirmed entry the user pushes (date, mapped project,
// billed minutes, narrative). Never capture, screenshots, OCR, evidence, or
// AI data. Same category as the file export — data portability, user-driven.

export type ProviderId = "moco" | "awork" | "clio";

/** The minimal, non-sensitive slice of a confirmed entry that goes on the wire. */
export interface PushableEntry {
  id: number;
  entry_date: string; // local 'YYYY-MM-DD'
  rounded_minutes: number; // the billed minutes (never the raw block data)
  narrative: string;
}

export interface HttpRequest {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: string; // JSON string for POST
}

export interface AccountField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean; // rendered masked; still stored locally
}

/** A provider's account config: the field values the user entered (api key, subdomain, …). */
export type AccountConfig = Record<string, string>;

export interface IntegrationAdapter {
  id: ProviderId;
  label: string;
  docsUrl: string;
  /** Credential/config fields the user fills to connect. */
  fields: AccountField[];
  /** One-line help for which id to paste when mapping a project. */
  remoteIdHelp: string;
  /** True only if every required field is present and non-empty. */
  isConfigured(account: AccountConfig): boolean;
  /** Build the POST that creates ONE time entry in the target system. */
  buildEntryRequest(entry: PushableEntry, remoteId: string, account: AccountConfig): HttpRequest;
  /** Pull the created remote id out of a success response (parsed JSON). */
  extractRemoteId(responseJson: unknown): string | null;
}
