import { IntegrationAdapter, PushableEntry, HttpRequest, AccountConfig } from "./types";

// Clio (clio.com) — POST /api/v4/activities.json with Bearer auth. The mapped
// remote id is the Clio matter id. quantity is in SECONDS. US vs EU region
// selects the host. Docs: https://app.clio.com/api/v4/documentation
export const clioAdapter: IntegrationAdapter = {
  id: "clio",
  label: "Clio",
  docsUrl: "https://app.clio.com/api/v4/documentation",
  fields: [
    { key: "accessToken", label: "Access token", placeholder: "OAuth access token", secret: true },
    { key: "region", label: "Region", placeholder: "us or eu" },
  ],
  remoteIdHelp: "Paste the Clio matter id (number) the time should be billed to.",

  isConfigured: (a) => !!a.accessToken?.trim(),

  buildEntryRequest(entry: PushableEntry, remoteId: string, account: AccountConfig): HttpRequest {
    const host = (account.region || "").trim().toLowerCase() === "eu" ? "eu.app.clio.com" : "app.clio.com";
    return {
      url: `https://${host}/api/v4/activities.json`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "TimeEntry",
          date: entry.entry_date,
          quantity: entry.rounded_minutes * 60, // seconds
          note: entry.narrative,
          matter: { id: Number(remoteId) },
        },
      }),
    };
  },

  extractRemoteId(responseJson: unknown): string | null {
    const id = (responseJson as { data?: { id?: number | string } } | null)?.data?.id;
    return id === undefined || id === null ? null : String(id);
  },
};
