import React, { useState, useRef, useEffect } from "react";
import { Sparkle, ArrowUpRight, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { activityRepo, capturesRepo, notesRepo, goalsRepo, settingsRepo } from "../lib/db";
import { ollamaClient, cosineSimilarity } from "../lib/ollama";

interface SourceReference {
  app_name: string;
  window_title: string | null;
  captured_at: number;
}

interface HistoryEntry {
  id: string;
  query: string;
  reply: string;
  sources: SourceReference[];
}

const isGreeting = (text: string): boolean => {
  const clean = text.toLowerCase().trim().replace(/[?!.,]/g, "");
  const greetings = [
    "hi",
    "hello",
    "hey",
    "yo",
    "greetings",
    "good morning",
    "good afternoon",
    "good evening",
    "howdy",
    "hola",
    "hi there",
    "hello there",
    "moin",
    "servus",
    "hej",
    "hallå"
  ];
  return greetings.includes(clean);
};

export const CommandBar: React.FC = () => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Max conversation turns to send to the model (each turn = 1 user + 1 assistant)
  const MAX_HISTORY_TURNS = 10;
  // Max characters of RAG context to inject (prevent context window overflow)
  const MAX_CONTEXT_CHARS = 4000;

  const checkOllama = async () => {
    try {
      const online = await ollamaClient.isRunning();
      setOllamaOnline(online);
    } catch (e) {
      setOllamaOnline(false);
    }
  };

  useEffect(() => {
    checkOllama();
    const interval = setInterval(checkOllama, 10000);
    return () => clearInterval(interval);
  }, []);

  /** Build conversation history messages from prior turns (capped to MAX_HISTORY_TURNS) */
  const buildConversationHistory = (
    currentHistory: HistoryEntry[]
  ): { role: string; content: string }[] => {
    // Only include completed turns (with replies) and skip error/offline messages
    const completedTurns = currentHistory.filter(
      (h) => h.reply && !h.reply.startsWith("Ollama is offline") && !h.reply.startsWith("Model '") && !h.reply.startsWith("Error:")
    );
    // Take the most recent turns
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
    shouldStickToBottomRef.current = true;
    inputRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = inputValue.trim();
    if (!query || isLoading) return;

    const queryId = `q-${Date.now()}`;
    setInputValue("");
    setIsLoading(true);
    // Sending a new message always snaps the conversation to the bottom
    shouldStickToBottomRef.current = true;

    if (!ollamaOnline) {
      const newEntry: HistoryEntry = {
        id: queryId,
        query,
        reply: "Ollama is offline. Please make sure Ollama is running locally and default models are installed to answer questions.",
        sources: [],
      };
      setHistory((prev) => [...prev, newEntry]);
      setIsLoading(false);
      return;
    }

    const greeting = isGreeting(query);

    const newEntry: HistoryEntry = {
      id: queryId,
      query,
      reply: "",
      sources: [],
    };

    // Capture history snapshot BEFORE adding the new entry (for conversation context)
    const historySnapshot = [...history];

    setHistory((prev) => [...prev, newEntry]);

    try {
      const chatModel = await settingsRepo.getChatModel();
      const installed = await ollamaClient.listModels();
      if (!installed.includes(chatModel) && !installed.includes(`${chatModel}:latest`)) {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === queryId
              ? {
                  ...item,
                  reply: `Model '${chatModel}' is not downloaded. Go to Settings to download it, or run \`ollama pull ${chatModel}\` in your terminal.`,
                }
              : item
          )
        );
        setIsLoading(false);
        return;
      }

      if (greeting && historySnapshot.length === 0) {
        // Only treat as pure greeting on the first turn
        const systemPrompt = `You are Vera, a local AI personal assistant. Greet the user back warmly, introducing yourself as Vera, and ask how you can help them. Keep it to 1 sentence. Do NOT mention any activity data, and do NOT list any sources.`;
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ];

        await ollamaClient.chatStream(chatModel, messages, (chunk) => {
          setHistory((prev) =>
            prev.map((item) =>
              item.id === queryId ? { ...item, reply: item.reply + chunk } : item
            )
          );
        });
        setIsLoading(false);
        return;
      }

      const embeddingModel = await settingsRepo.getEmbeddingModel();

      // Gather today's stats, top apps, timeline, goals, and notes
      const [stats, topApps, timeline, dailyGoal, notes] = await Promise.all([
        activityRepo.todayStats(),
        activityRepo.topAppsToday(),
        activityRepo.timelineToday(),
        goalsRepo.getDailyGoal(),
        notesRepo.list(),
      ]);

      // Retrieve captures relevant to the query (Semantic or LIKE)
      let relevantCaptures: any[] = [];
      const embeddingModelAvailable = installed.includes(embeddingModel) || installed.includes(`${embeddingModel}:latest`);

      if (embeddingModelAvailable) {
        try {
          const queryVector = await ollamaClient.generateEmbedding(query, embeddingModel);
          const allCaptures = await capturesRepo.list();
          
          const ranked = allCaptures
            .map((c) => {
              if (!c.embedding) return { capture: c, similarity: -1 };
              try {
                const vector = JSON.parse(c.embedding);
                const sim = cosineSimilarity(queryVector, vector);
                return { capture: c, similarity: sim };
              } catch (e) {
                return { capture: c, similarity: -1 };
              }
            })
            .filter((item) => item.similarity > 0.15)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5);

          relevantCaptures = ranked.map((item) => item.capture);
        } catch (err) {
          console.error("Semantic query failed in Ask Bar:", err);
        }
      }

      if (relevantCaptures.length === 0) {
        // Fallback to SQL LIKE search
        relevantCaptures = await capturesRepo.list(query);
        relevantCaptures = relevantCaptures.slice(0, 5);
      }

      // Update references / sources on entry
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId
            ? {
                ...item,
                sources: relevantCaptures.map((c) => ({
                  app_name: c.app_name,
                  window_title: c.window_title,
                  captured_at: c.captured_at,
                })),
              }
            : item
        )
      );

      // Construct grounded prompt context (capped to prevent overflow)
      let contextText = `--- TODAY'S ACTIVITY STATS ---
Active Hours: ${stats.activeHours}
Focus Time: ${stats.focusTime}
Meetings: ${stats.meetings}
Interruptions: ${stats.interruptions}

--- TOP 5 APPS TODAY ---
${topApps.map((a) => `- ${a.name}: ${a.timeLabel} (${a.minutes} minutes)`).join("\n")}

--- TODAY'S TIMELINE ---
${timeline.filter((t) => t.minutes > 0).map((t) => `- ${t.label}: ${t.minutes} mins`).join("\n")}

--- DAILY GOAL ---
${dailyGoal ? `- Goal: ${dailyGoal.title} (${dailyGoal.target_minutes} minutes target)` : "No active daily focus goal set."}

--- NOTES ---
${notes.map((n) => `- Title: "${n.title}"\n  Body: "${n.body || ""}"`).join("\n")}

--- RELEVANT SCREEN CAPTURES ---
`;

      if (relevantCaptures.length > 0) {
        relevantCaptures.forEach((c, idx) => {
          const timeStr = new Date(c.captured_at).toLocaleTimeString();
          contextText += `\n[Capture #${idx + 1}]
Time: ${timeStr}
App: ${c.app_name}
Window Title: ${c.window_title || "Unknown"}
Content: "${c.ocr_text.replace(/\n+/g, " ").substring(0, 800)}"
`;
        });
      } else {
        contextText += "\nNo matching screen captures found in memory.";
      }

      // Trim context to max chars
      if (contextText.length > MAX_CONTEXT_CHARS) {
        contextText = contextText.substring(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
      }

      const systemPrompt = `You are Vera, a local AI personal assistant. Your job is to answer questions about the user's day based on the context provided below. This is a conversation — the user may ask follow-up questions that refer to earlier answers.
Rules:
1. Ground your answers strictly in the context (which includes activity stats, top apps, notes, goals, and screen captures).
2. Answer questions about what the user worked on or how long they spent in apps by looking at the "TODAY'S ACTIVITY STATS" and "TOP 5 APPS TODAY" sections. Do not assume you have no information if the captures list is empty; the activity stats and top apps represent real recorded history.
3. Be concise, honest, and direct.
4. If the answer cannot be found in the context (neither in stats, top apps, notes, nor captures), say "I don't have that in your data". Do not make things up.
5. Keep the response to 1-3 sentences or a brief bullet list if possible.
6. All inference is running locally. Never mention internal details like embeddings, cosine similarity, vectors, or database queries.
7. When the user asks a follow-up ("and the second?", "summarize that", "are you sure?"), use the conversation history to understand what they are referring to.`;

      // Build the full message array: system + history + new user message
      const conversationHistory = buildConversationHistory(historySnapshot);
      const messages = [
        { role: "system", content: systemPrompt + "\n\nContext:\n" + contextText },
        ...conversationHistory,
        { role: "user", content: query },
      ];

      // Stream Chat Response
      await ollamaClient.chatStream(chatModel, messages, (chunk) => {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === queryId ? { ...item, reply: item.reply + chunk } : item
          )
        );
      });
    } catch (err: any) {
      console.error(err);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId ? { ...item, reply: `Error: ${err.message || err}` } : item
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const prevLoadingRef = useRef(false);

  // Only stick to the bottom while the user is already near it, so they
  // can scroll up and read older messages without being pulled back down
  const handleChatScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  };

  // Auto-scroll to the latest message (fires on every streamed chunk too)
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el && shouldStickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [history]);

  // Return focus to the ask bar once a reply has finished streaming
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      inputRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  return (
    <div className="w-full max-w-[1000px] flex flex-col gap-5">
      {/* Main Command Input Bar */}
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
          placeholder="Ask anything about your day"
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

      {/* Offline Alert */}
      {!ollamaOnline && (
        <div className="card-style p-5 border-amber-500/20 bg-amber-500/5 text-amber-900 flex flex-col gap-2 font-sans text-[13px] leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-[14px]">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            Connect a local model to ask questions
          </div>
          <p className="text-amber-800">
            Vera's local AI assistant is offline. Please make sure <strong>Ollama</strong> is running locally. You can download it for free at <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-950 flex inline-flex items-center gap-0.5">ollama.com <ExternalLink size={12} /></a> and pull the default models (<code>llama3.2:3b</code> and <code>nomic-embed-text</code>) in settings.
          </p>
        </div>
      )}

      {/* Single Chat Window — the whole conversation lives in one card */}
      {history.length > 0 && (
        <div className="w-full flex flex-col gap-3">
          <div className="card-style flex flex-col overflow-hidden">
            {/* Scrollable messages area */}
            <div
              ref={messagesScrollRef}
              onScroll={handleChatScroll}
              className="flex flex-col overflow-y-auto px-6 py-5"
              style={{ maxHeight: "60vh" }}
            >
              {history.map((item, idx) => (
                <div key={item.id} className="flex flex-col">
                  {/* Hairline divider between conversation turns */}
                  {idx > 0 && (
                    <div className="h-px bg-border-hairline w-full my-5" />
                  )}

                  {/* User Message Bubble */}
                  <div className="flex gap-3 items-start w-full">
                    <div className="w-7 h-7 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0 mt-0.5">
                      <span className="font-sans text-[10px] font-semibold text-text-primary">
                        TM
                      </span>
                    </div>
                    <div className="flex-1 font-sans text-[14px] text-text-primary leading-relaxed pt-1 select-text">
                      {item.query}
                    </div>
                  </div>

                  {/* Hairline divider between question and reply */}
                  <div className="h-px bg-border-hairline w-full my-4" />

                  {/* Vera Response Bubble */}
                  <div className="flex gap-3 items-start w-full">
                    <div className="w-7 h-7 rounded-full bg-text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkle size={13} strokeWidth={1.5} className="text-card-surface" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2 pt-0.5">
                      <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
                        Vera
                      </span>

                      {item.reply ? (
                        <p className="font-serif text-[16px] text-text-muted italic leading-relaxed select-text whitespace-pre-wrap">
                          {item.reply}
                        </p>
                      ) : (
                        <div className="flex gap-1 items-center py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      )}

                      {/* Reference Sources */}
                      {item.sources && item.sources.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          <span className="font-sans text-[10px] text-text-faint uppercase tracking-wider font-semibold">
                            Sources referenced
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.sources.map((src, srcIdx) => {
                              const timeStr = new Date(src.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
              ))}
            </div>
          </div>

          {/* New chat button — clears the window and starts a fresh conversation */}
          {history.some((h) => h.reply) && !isLoading && (
            <button
              onClick={clearConversation}
              className="self-center flex items-center gap-1.5 font-sans text-[12px] text-text-faint hover:text-text-muted transition-colors duration-150 py-1 cursor-pointer"
            >
              <RotateCcw size={12} strokeWidth={1.5} />
              New chat
            </button>
          )}
        </div>
      )}
    </div>
  );
};
