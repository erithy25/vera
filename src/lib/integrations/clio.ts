import { IntegrationAdapter, PushableEntry, HttpRequest, AccountConfig } from "./types";

// Clio (clio.com) — POST /api/v4/activities.json with Bearer auth. The mapped
// remote id is the Clio matter id. quantity is in SECONDS. The region selects
// the data-residency host — a Clio token is bound to its region, so the wrong
// (or missing) region fails auth. Docs: https://app.clio.com/api/v4/documentation
const CLIO_HOSTS: Record<string, string> = {
  us: "app.clio.com",
  eu: "eu.app.clio.com",
  ca: "ca.app.clio.com",
  au: "au.app.clio.com",
};

export const clioAdapter: IntegrationAdapter = {
  id: "clio",
  label: "Clio",
  fields: [
    { key: "accessToken", label: "Access token", placeholder: "OAuth access token", secret: true },
    { key: "region", label: "Region", placeholder: "us, eu, ca or au" },
  ],
  remoteIdHelp: "Paste the Clio matter id (number) the time should be billed to.",

  // Region is required — a token routed to the wrong host silently 401s.
  isConfigured: (a) => !!a.accessToken?.trim() && !!CLIO_HOSTS[(a.region ?? "").trim().toLowerCase()],

  validateRemoteId: (remoteId) =>
    /^\d+$/.test(remoteId.trim()) ? null : "Enter the Clio matter id (a number).",

  buildEntryRequest(entry: PushableEntry, remoteId: string, account: AccountConfig): HttpRequest {
    const host = CLIO_HOSTS[(account.region || "").trim().toLowerCase()] ?? CLIO_HOSTS.us;
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
