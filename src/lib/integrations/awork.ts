import { IntegrationAdapter, PushableEntry, HttpRequest, AccountConfig } from "./types";

// awork (awork.com) — POST /api/v1/timeentries with Bearer auth. The mapped
// remote id is the awork project id (a GUID). Duration is in seconds.
// Docs: https://developers.awork.com/
export const aworkAdapter: IntegrationAdapter = {
  id: "awork",
  label: "awork",
  docsUrl: "https://developers.awork.com/",
  fields: [
    { key: "apiKey", label: "API key", placeholder: "Settings → Integrations → API keys", secret: true },
  ],
  remoteIdHelp: "Paste the awork project id (GUID) from the project's URL.",

  isConfigured: (a) => !!a.apiKey?.trim(),

  buildEntryRequest(entry: PushableEntry, remoteId: string, account: AccountConfig): HttpRequest {
    return {
      url: "https://api.awork.com/api/v1/timeentries",
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: remoteId,
        startDateUtc: entry.entry_date,
        duration: entry.rounded_minutes * 60, // seconds
        note: entry.narrative,
        isBillable: true,
      }),
    };
  },

  extractRemoteId(responseJson: unknown): string | null {
    const id = (responseJson as { id?: string } | null)?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  },
};
