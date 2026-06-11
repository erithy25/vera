import { activityRepo, goalsRepo, notesRepo } from "./db";
import { retrieveRelevantCaptures } from "./retrieval";

export type AgentId = "planner" | "writer" | "researcher" | "coach";

export interface SourceReference {
  app_name: string;
  window_title: string | null;
  captured_at: number;
}

export interface AgentHistoryEntry {
  id: string;
  query: string;
  reply: string;
  sources: SourceReference[];
  actionStates: Record<number, "approved" | "dismissed" | "failed" | undefined>;
}

export interface AgentSpec {
  id: AgentId;
  name: string;
  description: string;
  avatarText: string;
  systemPrompt: string;
}

const ACTION_INSTRUCTIONS = [
  "You MAY propose one of exactly two internal actions when — and only when — it genuinely helps the user. Otherwise just answer normally.",
  "To propose an action, write your normal answer first, then end the reply with a fenced block in EXACTLY this format:",
  "```vera-action",
  '{"action": "create_note", "title": "Short title", "body": "Optional body text"}',
  "```",
  "or",
  "```vera-action",
  '{"action": "create_goal", "title": "Goal title"}',
  "```",
  "Action rules: at most one action per reply. Only these two action types exist — never invent others. The user must explicitly approve the proposal before anything is saved, so never claim the note or goal was already created.",
  'When the user clearly asks you to create or save a note or goal (e.g. "create a goal to...", "save a note about..."), emit the vera-action block directly in that same reply — do not ask for confirmation in plain text first. Ask a question only when the content of the note or goal is genuinely unclear.',
].join("\n");

const SHARED_RULES = [
  "General rules:",
  "- This is a multi-turn conversation; use the history to resolve follow-ups.",
  "- Be concise: a few sentences or a short bullet list.",
  "- Ground answers in the provided context when present. If something is not in the data, say so — do not make things up.",
  "- All inference runs locally or with the user's own key. Never mention internal implementation details (embeddings, vectors, similarity, databases).",
].join("\n");

export const AGENTS: AgentSpec[] = [
  {
    id: "planner",
    name: "Planner",
    description: "Helps plan your day and stay on track",
    avatarText: "PL",
    systemPrompt: [
      "You are Vera's Planner agent, a personal AI teammate inside the Vera app. You help the user plan their day, prioritize, and break work into small, concrete next steps. Be practical and specific — suggest realistic time blocks based on how their day actually looks in the context below.",
      SHARED_RULES,
      ACTION_INSTRUCTIONS,
    ].join("\n\n"),
  },
  {
    id: "writer",
    name: "Writer",
    description: "Drafts, edits, and refines your writing",
    avatarText: "WR",
    systemPrompt: [
      "You are Vera's Writer agent, a personal AI teammate inside the Vera app. You draft, edit, and refine text — emails, messages, posts, and documents. Produce a usable draft immediately instead of asking many questions; ask at most one clarifying question and only when essential. Match the tone and language the user asks for, and keep the user's intent intact when editing.",
      SHARED_RULES,
      ACTION_INSTRUCTIONS,
    ].join("\n\n"),
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Finds answers and summarizes anything",
    avatarText: "RE",
    systemPrompt: [
      'You are Vera\'s Researcher agent, a personal AI teammate inside the Vera app. You answer questions about the user\'s own captured knowledge — text Vera saw on their screen. Ground every answer strictly in the capture snippets provided in the context. If the answer is not in them, say "I don\'t have that in your data." Never invent sources, quotes, or facts.',
      SHARED_RULES,
      ACTION_INSTRUCTIONS,
    ].join("\n\n"),
  },
  {
    id: "coach",
    name: "Coach",
    description: "Keeps you focused and builds better habits",
    avatarText: "CO",
    systemPrompt: [
      "You are Vera's Coach agent, a personal AI teammate inside the Vera app. You review the user's focus and productivity and give honest, encouraging accountability feedback. Point out what went well, what broke focus, and give one or two concrete suggestions. Be direct but kind — a good coach, not a drill sergeant. Base everything on the real stats in the context below.",
      SHARED_RULES,
      ACTION_INSTRUCTIONS,
    ].join("\n\n"),
  },
];

export function getAgentById(id: string): AgentSpec | null {
  return AGENTS.find((a) => a.id === id) || null;
}

const MAX_CONTEXT_CHARS = 4000;

function capContext(ctx: string): string {
  if (ctx.length > MAX_CONTEXT_CHARS) {
    return ctx.substring(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
  }
  return ctx;
}

async function buildActivityContext(includeTimeline: boolean): Promise<string> {
  const [stats, topApps] = await Promise.all([
    activityRepo.todayStats(),
    activityRepo.topAppsToday(),
  ]);

  let ctx = `--- TODAY'S ACTIVITY ---
Active Hours: ${stats.activeHours}
Focus Time: ${stats.focusTime}
Meetings: ${stats.meetings}
Interruptions: ${stats.interruptions}

--- TOP APPS TODAY ---
${topApps.map((a) => `- ${a.name}: ${a.timeLabel}`).join("\n") || "- (no activity recorded yet)"}`;

  if (includeTimeline) {
    const timeline = await activityRepo.timelineToday();
    const active = timeline.filter((t) => t.minutes > 0);
    ctx += `\n\n--- TODAY'S TIMELINE ---
${active.map((t) => `- ${t.label}: ${t.minutes} mins`).join("\n") || "- (nothing recorded yet)"}`;
  }
  return ctx;
}

async function buildGoalsNotesContext(): Promise<string> {
  const [goals, notes] = await Promise.all([goalsRepo.list(), notesRepo.list()]);
  const goalLines = goals
    .slice(0, 5)
    .map((g) => `- ${g.done ? "[done] " : ""}${g.title}`)
    .join("\n");
  const noteLines = notes
    .slice(0, 6)
    .map((n) => {
      const title = (n.title || "Untitled").substring(0, 120);
      const body = n.body ? `: ${n.body.substring(0, 160)}` : "";
      return `- "${title}"${body}`;
    })
    .join("\n");

  return `--- GOALS ---
${goalLines || "- No goals set yet."}

--- RECENT QUICK NOTES ---
${noteLines || "- (no notes yet)"}`;
}

/** Build the agent-specific local context for one user message. */
export async function buildAgentContext(
  agent: AgentSpec,
  query: string
): Promise<{ context: string; sources: SourceReference[] }> {
  switch (agent.id) {
    case "planner": {
      const [activity, goalsNotes] = await Promise.all([
        buildActivityContext(false),
        buildGoalsNotesContext(),
      ]);
      return { context: capContext(`${activity}\n\n${goalsNotes}`), sources: [] };
    }
    case "coach": {
      return { context: capContext(await buildActivityContext(true)), sources: [] };
    }
    case "researcher": {
      // Same on-device semantic search as the Ask-bar
      const captures = await retrieveRelevantCaptures(query);
      let ctx = "--- RELEVANT SCREEN CAPTURES (the user's own data) ---\n";
      if (captures.length > 0) {
        captures.forEach((c, idx) => {
          const timeStr = new Date(c.captured_at).toLocaleTimeString();
          ctx += `\n[Capture #${idx + 1}]
Time: ${timeStr}
App: ${c.app_name}
Window Title: ${c.window_title || "Unknown"}
Content: "${c.ocr_text.replace(/\n+/g, " ").substring(0, 700)}"
`;
        });
      } else {
        ctx += "\nNo matching screen captures found in memory.";
      }
      return {
        context: capContext(ctx),
        sources: captures.map((c) => ({
          app_name: c.app_name,
          window_title: c.window_title,
          captured_at: c.captured_at,
        })),
      };
    }
    case "writer":
    default:
      return { context: "", sources: [] };
  }
}

// --- In-memory per-session conversation threads (cleared on app restart) ---

const agentThreads: Record<string, AgentHistoryEntry[]> = {};

export function getAgentThread(id: AgentId): AgentHistoryEntry[] {
  return agentThreads[id] || [];
}

export function setAgentThread(id: AgentId, history: AgentHistoryEntry[]): void {
  agentThreads[id] = history;
}

// --- Cross-view navigation: open a specific agent chat from the Dashboard ---

let pendingAgentId: AgentId | null = null;

export function requestOpenAgent(id: AgentId): void {
  pendingAgentId = id;
  window.dispatchEvent(new CustomEvent("vera-open-agent"));
}

export function consumePendingAgentId(): AgentId | null {
  const id = pendingAgentId;
  pendingAgentId = null;
  return id;
}
