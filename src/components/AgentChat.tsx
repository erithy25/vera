import React, { useState, useRef, useEffect } from "react";
import { Sparkle, ArrowUpRight, ArrowLeft, RotateCcw, Check } from "lucide-react";
import {
  AgentSpec,
  AgentHistoryEntry,
  buildAgentContext,
  getAgentThread,
  setAgentThread,
} from "../lib/agents";
import { parseAgentReply, VeraAction } from "../lib/agentActions";
import { generateReply } from "../lib/engine";
import { notesRepo, goalsRepo } from "../lib/db";
import { useUserProfile } from "../lib/useUserProfile";

interface AgentChatProps {
  agent: AgentSpec;
  onBack: () => void;
}

// Max conversation turns to send to the model (each turn = 1 user + 1 assistant)
const MAX_HISTORY_TURNS = 10;

export const AgentChat: React.FC<AgentChatProps> = ({ agent, onBack }) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<AgentHistoryEntry[]>(() => getAgentThread(agent.id));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { initials: userInitials } = useUserProfile();

  // Keep the in-memory per-session thread in sync so the conversation
  // survives switching views (cleared on app restart by design)
  useEffect(() => {
    setAgentThread(agent.id, history);
  }, [agent.id, history]);

  /** Build conversation history messages from prior turns (capped) */
  const buildConversationHistory = (
    currentHistory: AgentHistoryEntry[]
  ): { role: string; content: string }[] => {
    const completedTurns = currentHistory.filter(
      (h) => h.reply && !h.reply.startsWith("Error:")
    );
    const recentTurns = completedTurns.slice(-MAX_HISTORY_TURNS);

    const messages: { role: string; content: string }[] = [];
    for (const turn of recentTurns) {
      messages.push({ role: "user", content: turn.query });
      messages.push({ role: "assistant", content: turn.reply });
    }
    return messages;
  };

  const clearConversation = () => {
    setHistory([]);
    setAgentThread(agent.id, []);
    shouldStickToBottomRef.current = true;
    inputRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = inputValue.trim();
    if (!query || isLoading) return;

    const queryId = `${agent.id}-${Date.now()}`;
    setInputValue("");
    setIsLoading(true);
    shouldStickToBottomRef.current = true;

    const historySnapshot = [...history];
    setHistory((prev) => [
      ...prev,
      { id: queryId, query, reply: "", sources: [], actionStates: {} },
    ]);

    try {
      // Agent-specific LOCAL context (activity/goals/notes/captures)
      const { context, sources } = await buildAgentContext(agent, query);
      if (sources.length > 0) {
        setHistory((prev) =>
          prev.map((item) => (item.id === queryId ? { ...item, sources } : item))
        );
      }

      const systemContent = context
        ? `${agent.systemPrompt}\n\nContext:\n${context}`
        : agent.systemPrompt;
      const messages = [
        { role: "system", content: systemContent },
        ...buildConversationHistory(historySnapshot),
        { role: "user", content: query },
      ];

      // Same engine path as the Ask-bar: local streams, cloud returns in one piece
      await generateReply(messages, (chunk) => {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === queryId ? { ...item, reply: item.reply + chunk } : item
          )
        );
      });
    } catch (err: any) {
      const message = typeof err === "string" ? err : err?.message || String(err);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId ? { ...item, reply: `Error: ${message}` } : item
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Consent gate: nothing is written until the user explicitly approves
  const handleApprove = async (entryId: string, actionIndex: number, action: VeraAction) => {
    let outcome: "approved" | "failed" = "approved";
    try {
      if (action.action === "create_note") {
        await notesRepo.add(action.title, action.body);
        window.dispatchEvent(new CustomEvent("notes-updated"));
      } else {
        await goalsRepo.add(action.title);
        // TodayCard reloads the daily goal on this event
        window.dispatchEvent(new CustomEvent("activity-updated"));
      }
    } catch (err) {
      console.error("Failed to apply agent action:", err);
      outcome = "failed";
    }
    setHistory((prev) =>
      prev.map((item) =>
        item.id === entryId
          ? { ...item, actionStates: { ...item.actionStates, [actionIndex]: outcome } }
          : item
      )
    );
  };

  const handleDismiss = (entryId: string, actionIndex: number) => {
    setHistory((prev) =>
      prev.map((item) =>
        item.id === entryId
          ? { ...item, actionStates: { ...item.actionStates, [actionIndex]: "dismissed" } }
          : item
      )
    );
  };

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const prevLoadingRef = useRef(false);

  const handleChatScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el && shouldStickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      inputRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  return (
    <div className="w-full max-w-[1000px] flex flex-col gap-5">
      {/* Agent header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            title="All agents"
            className="w-8 h-8 rounded-full border border-border-hairline flex items-center justify-center bg-card-surface hover:bg-active-hover text-text-muted hover:text-text-primary transition-all duration-150 active:scale-90 cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <div className="w-9 h-9 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0">
            <span className="font-sans text-[12px] font-semibold text-text-primary">
              {agent.avatarText}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-[20px] font-normal text-text-primary leading-tight">
              {agent.name}
            </span>
            <span className="font-sans text-[12px] text-text-faint leading-tight">
              {agent.description}
            </span>
          </div>
        </div>

        {history.length > 0 && !isLoading && (
          <button
            onClick={clearConversation}
            className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint hover:text-text-muted transition-colors duration-150 py-1 cursor-pointer"
          >
            <RotateCcw size={12} strokeWidth={1.5} />
            New chat
          </button>
        )}
      </div>

      {/* Input bar (same design as the Ask-bar) */}
      <form
        onSubmit={handleSubmit}
        className={`w-full h-[72px] bg-card-surface border rounded-[16px] flex items-center px-6 gap-4 transition-all duration-200 ${
          isFocused
            ? "border-text-muted/80 shadow-md"
            : "border-border-hairline hover:border-text-faint/40"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        <Sparkle size={22} strokeWidth={1.5} className="text-text-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={`Message the ${agent.name}`}
          disabled={isLoading}
          className="flex-1 font-serif text-[22px] text-text-primary placeholder:text-text-muted placeholder:italic placeholder:font-serif bg-transparent outline-none border-none p-0 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors duration-150 group shrink-0 ${
            inputValue.trim() && !isLoading
              ? "border-text-muted hover:bg-active-hover cursor-pointer"
              : "border-border-hairline text-text-faint cursor-default"
          }`}
        >
          <ArrowUpRight
            size={18}
            strokeWidth={1.5}
            className={`transition-colors ${
              inputValue.trim() && !isLoading ? "text-text-primary" : "text-text-faint"
            }`}
          />
        </button>
      </form>

      {/* Single chat window — the whole conversation lives in one card */}
      {history.length > 0 && (
        <div className="card-style flex flex-col overflow-hidden">
          <div
            ref={messagesScrollRef}
            onScroll={handleChatScroll}
            className="flex flex-col overflow-y-auto px-6 py-5"
            style={{ maxHeight: "60vh" }}
          >
            {history.map((item, idx) => {
              const parsed = parseAgentReply(item.reply);
              return (
                <div key={item.id} className="flex flex-col">
                  {idx > 0 && <div className="h-px bg-border-hairline w-full my-5" />}

                  {/* User message bubble */}
                  <div className="flex gap-3 items-start w-full">
                    <div className="w-7 h-7 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0 mt-0.5">
                      <span className="font-sans text-[10px] font-semibold text-text-primary">
                        {userInitials}
                      </span>
                    </div>
                    <div className="flex-1 font-sans text-[14px] text-text-primary leading-relaxed pt-1 select-text">
                      {item.query}
                    </div>
                  </div>

                  <div className="h-px bg-border-hairline w-full my-4" />

                  {/* Agent response bubble */}
                  <div className="flex gap-3 items-start w-full">
                    <div className="w-7 h-7 rounded-full bg-text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkle size={13} strokeWidth={1.5} className="text-card-surface" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2 pt-0.5">
                      <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
                        {agent.name}
                      </span>

                      {item.reply ? (
                        <p className="font-serif text-[16px] text-text-muted italic leading-relaxed select-text whitespace-pre-wrap">
                          {parsed.text || "…"}
                        </p>
                      ) : (
                        <div className="flex gap-1 items-center py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      )}

                      {/* Consent-gated action proposals */}
                      {parsed.actions.map((action, actionIdx) => {
                        const state = item.actionStates[actionIdx] ?? "pending";
                        return (
                          <div
                            key={actionIdx}
                            className="border border-border-hairline rounded-xl p-3.5 bg-active-hover/40 flex flex-col gap-2"
                          >
                            <span className="font-sans text-[10px] font-semibold text-text-faint uppercase tracking-widest">
                              Proposed action
                            </span>
                            <span className="font-sans text-[13px] text-text-primary leading-relaxed">
                              {action.action === "create_note" ? (
                                <>Save a note: <span className="font-medium">"{action.title}"</span></>
                              ) : (
                                <>Create a goal: <span className="font-medium">"{action.title}"</span></>
                              )}
                            </span>
                            {action.body && (
                              <span className="font-sans text-[12px] text-text-muted leading-normal line-clamp-3">
                                {action.body}
                              </span>
                            )}

                            {state === "pending" ? (
                              <div className="flex gap-2 mt-1">
                                <button
                                  onClick={() => handleApprove(item.id, actionIdx, action)}
                                  className="px-3 py-1.5 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium hover:bg-text-muted transition-colors cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleDismiss(item.id, actionIdx)}
                                  className="px-3 py-1.5 rounded-xl border border-border-hairline text-text-muted font-sans text-[12px] font-medium hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
                                >
                                  Dismiss
                                </button>
                              </div>
                            ) : state === "approved" ? (
                              <span className="flex items-center gap-1.5 font-sans text-[12px] text-emerald-600 font-medium">
                                <Check size={13} strokeWidth={2} />
                                {action.action === "create_note"
                                  ? "Note saved to Quick Notes"
                                  : "Goal created"}
                              </span>
                            ) : state === "failed" ? (
                              <span className="font-sans text-[12px] text-red-600">
                                Could not complete the action — please try again.
                              </span>
                            ) : (
                              <span className="font-sans text-[12px] text-text-faint italic">
                                Dismissed — nothing was saved.
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Reference sources (Researcher) */}
                      {item.sources && item.sources.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          <span className="font-sans text-[10px] text-text-faint uppercase tracking-wider font-semibold">
                            Sources referenced
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.sources.map((src, srcIdx) => {
                              const timeStr = new Date(src.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                              return (
                                <div
                                  key={srcIdx}
                                  className="font-sans text-[11px] px-2 py-1 rounded bg-active-hover text-text-muted border border-border-hairline flex items-center gap-1.5 max-w-[280px]"
                                  title={`${src.app_name} - ${src.window_title || ""}`}
                                >
                                  <span className="font-semibold text-text-primary shrink-0">{src.app_name}</span>
                                  {src.window_title && (
                                    <span className="truncate text-text-faint max-w-[150px]">{src.window_title}</span>
                                  )}
                                  <span className="text-[10px] text-text-faint shrink-0">@{timeStr}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty-state hint */}
      {history.length === 0 && (
        <p className="font-sans text-[13px] text-text-faint text-center select-none">
          Start a conversation — the {agent.name} knows your local context and can propose notes or goals for your approval.
        </p>
      )}
    </div>
  );
};
