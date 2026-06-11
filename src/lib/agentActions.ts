// Parsing for consent-gated agent actions. Agents may end a reply with a
// fenced ```vera-action block containing JSON for one of exactly two internal
// actions (create_note / create_goal). The raw block is hidden from the chat
// text and rendered as an Approve/Dismiss proposal card instead. Nothing is
// ever written without explicit approval, and malformed blocks never crash —
// they are simply dropped.

export type VeraActionType = "create_note" | "create_goal";

export interface VeraAction {
  action: VeraActionType;
  title: string;
  body: string;
}

export interface ParsedAgentReply {
  text: string;
  actions: VeraAction[];
}

const ACTION_BLOCK_REGEX = /```[ \t]*vera-action([\s\S]*?)```/g;
const OPEN_BLOCK_REGEX = /```[ \t]*vera-action/;

export function parseAgentReply(reply: string): ParsedAgentReply {
  const actions: VeraAction[] = [];

  let text = reply.replace(ACTION_BLOCK_REGEX, (_match, payload) => {
    try {
      const parsed = JSON.parse(String(payload).trim());
      const action = parsed?.action;
      const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
      if ((action === "create_note" || action === "create_goal") && title) {
        actions.push({
          action,
          title,
          body: typeof parsed?.body === "string" ? parsed.body : "",
        });
      }
      // Unknown action types are ignored (only the two above exist)
    } catch (err) {
      // Malformed JSON inside the block: drop the block, keep the answer text
    }
    return "";
  });

  // While streaming, the closing fence may not have arrived yet — hide the
  // partial block so raw JSON never flashes in the chat.
  const openIdx = text.search(OPEN_BLOCK_REGEX);
  if (openIdx !== -1) {
    text = text.slice(0, openIdx);
  }

  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), actions };
}
