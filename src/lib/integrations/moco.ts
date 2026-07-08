import { IntegrationAdapter, PushableEntry, HttpRequest, AccountConfig } from "./types";

// MOCO (mocoapp.com) — POST /api/v1/activities with Token auth.
// A MOCO activity needs a project AND a task, so the mapped remote id is
// "<project_id>:<task_id>". Docs: https://hundertzehn.github.io/mocoapp-api-docs/
const SUBDOMAIN_RE = /^[a-z0-9-]+$/i;

export const mocoAdapter: IntegrationAdapter = {
  id: "moco",
  label: "MOCO",
  fields: [
    { key: "subdomain", label: "Subdomain", placeholder: "your-company (from your-company.mocoapp.com)" },
    { key: "apiKey", label: "API key", placeholder: "Profile → Integrations → API key", secret: true },
  ],
  remoteIdHelp: "Paste projectId:taskId (both numbers from the MOCO project's task).",

  // The subdomain is interpolated into the request host, so it must be a bare
  // label — no dots/slashes that could redirect the POST to another host.
  isConfigured: (a) => SUBDOMAIN_RE.test((a.subdomain ?? "").trim()) && !!a.apiKey?.trim(),

  validateRemoteId(remoteId: string): string | null {
    const parts = remoteId.trim().split(":");
    if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
      return "Use projectId:taskId — both numbers (e.g. 12345:678).";
    }
    return null;
  },

  buildEntryRequest(entry: PushableEntry, remoteId: string, account: AccountConfig): HttpRequest {
    const [projectId, taskId] = remoteId.split(":");
    return {
      url: `https://${account.subdomain.trim()}.mocoapp.com/api/v1/activities`,
      method: "POST",
      headers: {
        Authorization: `Token token=${account.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: entry.entry_date,
        project_id: Number(projectId),
        task_id: Number(taskId),
        hours: Math.round((entry.rounded_minutes / 60) * 100) / 100, // 2-decimal hours
        description: entry.narrative,
      }),
    };
  },

  extractRemoteId(responseJson: unknown): string | null {
    const id = (responseJson as { id?: number | string } | null)?.id;
    return id === undefined || id === null ? null : String(id);
  },
};
