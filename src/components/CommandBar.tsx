import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkle, ArrowUpRight, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { activityRepo, notesRepo, goalsRepo, settingsRepo } from "../lib/db";
import { ollamaClient } from "../lib/ollama";
import { retrieveRelevantFrames } from "../lib/retrieval";
import { useUserProfile } from "../lib/useUserProfile";

interface SourceReference {
  app_name: string;
  window_title: string | null;
  captured_at: number;
}

interface FrameSource {
  app: string | null;
  window_title: string | null;
  timestamp: number;
  thumbnail_path: string | null;
}

interface HistoryEntry {
  id: string;
  query: string;
  reply: string;
  sources: SourceReference[];
  frameSources?: FrameSource[];
  thinkingSteps?: string[];
  reasoning?: string;
  visionReply?: string;
  visionModel?: string;
  visionBusy?: boolean;
}

// Vera is told to think out loud first, then write a line starting with
// "ANSWER:" before its final reply. This splits a (possibly partial, mid-stream)
// response into that self-talk and the answer. The marker is matched only at a
// line start (tolerating markdown like ** or #) so prose such as "the answer is"
// never trips it. Until the marker streams in, everything is reasoning; the
// caller falls back to treating the whole text as the answer if it never comes.
const ANSWER_MARKER = /(^|\n)[\s>*#-]*answer\s*\**\s*:\**/i;
const splitReasoning = (raw: string): { reasoning: string; answer: string } => {
  const match = raw.match(ANSWER_MARKER);
  if (!match || match.index === undefined) {
    return { reasoning: raw, answer: "" };
  }
  const markerEnd = match.index + match[0].length;
  return {
    reasoning: raw.slice(0, match.index).trim(),
    answer: raw.slice(markerEnd).trim(),
  };
};

// Collapsible panel showing Vera's REAL thinking for an answer: the retrieval
// pipeline steps plus the model's own out-loud reasoning, streamed live.
const ThinkingPanel: React.FC<{ steps: string[]; reasoning?: string; live: boolean }> = ({
  steps,
  reasoning,
  live,
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);
  const reasoningText = (reasoning || "").trim();
  const hasReasoning = reasoningText.length > 0;
  const hasSteps = !!steps && steps.length > 0;
  if (!hasSteps && !hasReasoning) return null;
  const count = (steps?.length || 0) + (hasReasoning ? 1 : 0);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="self-start flex items-center gap-1.5 font-sans text-[10px] uppercase tracking-wider font-semibold text-text-faint hover:text-text-muted transition-colors cursor-pointer"
      >
        {live ? (
          <span className="flex gap-1 items-center">
            <span className="w-1 h-1 rounded-full bg-text-muted animate-pulse" />
            Thinking
          </span>
        ) : (
          <span>Thought process</span>
        )}
        <span className="text-text-faint normal-case tracking-normal">
          {open ? "▾" : "▸"} {count}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 pl-3 border-l border-border-hairline">
          {hasSteps && (
            <ol className="flex flex-col gap-1">
              {steps.map((s, i) => (
                <li key={i} className="font-sans text-[11px] text-text-muted leading-snug">
                  {s}
                </li>
              ))}
            </ol>
          )}
          {hasReasoning && (
            <p className="font-serif text-[12px] text-text-muted italic leading-relaxed whitespace-pre-wrap select-text">
              {reasoningText}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// A cited frame from the visual memory: decrypts its thumbnail on demand (so the
// store stays encrypted), shows the redaction-baked image, click to enlarge and
// jump to that moment in the Timeline.
const FrameThumbnail: React.FC<{ frame: FrameSource }> = ({ frame }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (frame.thumbnail_path) {
      invoke<string>("get_frame_thumbnail", { thumbnailPath: frame.thumbnail_path })
        .then((url) => {
          if (!cancelled) setSrc(url);
        })
        .catch((e) => console.error("Thumbnail decrypt failed:", e));
    }
    return () => {
      cancelled = true;
    };
  }, [frame.thumbnail_path]);

  const timeStr = new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (!src) {
    return <div className="w-[120px] h-[76px] rounded-lg bg-active-hover border border-border-hairline animate-pulse" />;
  }

  return (
    <>
      <button
        onClick={() => setEnlarged(true)}
        className="group flex flex-col gap-1 cursor-pointer text-left"
        title={`${frame.app || "Screen"} — ${frame.window_title || ""} @ ${timeStr}`}
      >
        <img
          src={src}
          alt="captured frame"
          className="w-[120px] h-[76px] object-cover rounded-lg border border-border-hairline group-hover:border-text-faint transition-colors"
        />
        <span className="text-[10px] text-text-faint truncate max-w-[120px]">
          {frame.app || "Screen"} · {timeStr}
        </span>
      </button>
      {enlarged && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
          onClick={() => setEnlarged(false)}
        >
          <div className="flex flex-col gap-3 items-center" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt="captured frame" className="max-w-[80vw] max-h-[70vh] rounded-xl border border-white/10" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("vera-open-timeline", { detail: frame.timestamp }));
                  setEnlarged(false);
                }}
                className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[12px] hover:bg-white/20 transition-colors cursor-pointer"
              >
                Jump to Timeline
              </button>
              <button
                onClick={() => setEnlarged(false)}
                className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[12px] hover:bg-white/20 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

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
  const [engineState, setEngineState] = useState<"local" | "cloud">("local");
  const inputRef = useRef<HTMLInputElement>(null);
  const { initials: userInitials } = useUserProfile();

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

  const refreshEngine = async () => {
    try {
      setEngineState(await settingsRepo.getAiEngine());
    } catch (err) {
      console.error("Failed to read AI engine setting:", err);
    }
  };

  useEffect(() => {
    checkOllama();
    refreshEngine();
    const interval = setInterval(checkOllama, 10000);
    const onEngineUpdated = () => refreshEngine();
    window.addEventListener("ai-engine-updated", onEngineUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("ai-engine-updated", onEngineUpdated);
    };
  }, []);

  // Cloud mode: the Rust command reads the stored key and calls the provider.
  // Errors are surfaced in the answer area — no silent fallback to local.
  const runCloudCompletion = async (
    messages: { role: string; content: string }[],
    queryId: string,
    parseReasoning = false
  ) => {
    try {
      const raw = await invoke<string>("generate_chat_completion", { messages });
      if (parseReasoning) {
        // Cloud returns the whole response at once: split the out-loud reasoning
        // from the final answer, falling back to the whole text if no marker.
        const { reasoning, answer } = splitReasoning(raw);
        setHistory((prev) =>
          prev.map((item) =>
            item.id === queryId
              ? { ...item, reasoning: answer ? reasoning : "", reply: answer || raw.trim() }
              : item
          )
        );
      } else {
        setHistory((prev) =>
          prev.map((item) => (item.id === queryId ? { ...item, reply: raw } : item))
        );
      }
      await settingsRepo.setCloudLastStatus("ok");
    } catch (err: any) {
      const message = typeof err === "string" ? err : err?.message || String(err);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId ? { ...item, reply: `Error: ${message}` } : item
        )
      );
      try {
        await settingsRepo.setCloudLastStatus("failed");
      } catch (statusErr) {
        console.error("Failed to persist cloud status:", statusErr);
      }
    } finally {
      window.dispatchEvent(new CustomEvent("ai-engine-updated"));
    }
  };

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

  // Append a live thinking step to an in-flight answer (reflects real progress).
  const addStep = (id: string, step: string) => {
    setHistory((prev) =>
      prev.map((it) => (it.id === id ? { ...it, thinkingSteps: [...(it.thinkingSteps || []), step] } : it))
    );
  };

  // Optional, explicit vision pass: run a local vision model on the top few
  // cited frames only. Off the normal hot path; clear fallback when unavailable.
  const runVisionPass = async (entry: HistoryEntry) => {
    if (!entry.frameSources || entry.frameSources.length === 0) return;
    setHistory((prev) => prev.map((it) => (it.id === entry.id ? { ...it, visionBusy: true } : it)));
    try {
      const installed = await ollamaClient.listModels();
      const visionModels = ollamaClient.visionModels(installed);
      if (visionModels.length === 0) {
        setHistory((prev) =>
          prev.map((it) =>
            it.id === entry.id
              ? {
                  ...it,
                  visionBusy: false,
                  visionReply:
                    "No local vision model is installed. Install one (e.g. `ollama pull llava`) to analyze the frames visually — this answer is based on the extracted text only.",
                }
              : it
          )
        );
        return;
      }
      const model = visionModels[0];
      // Decrypt only the top few candidate thumbnails.
      const frames = entry.frameSources.slice(0, 3);
      const images: string[] = [];
      for (const f of frames) {
        if (!f.thumbnail_path) continue;
        try {
          const dataUrl = await invoke<string>("get_frame_thumbnail", { thumbnailPath: f.thumbnail_path });
          const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
          if (b64) images.push(b64);
        } catch (e) {
          console.error("Vision decrypt failed:", e);
        }
      }
      if (images.length === 0) {
        setHistory((prev) =>
          prev.map((it) =>
            it.id === entry.id ? { ...it, visionBusy: false, visionReply: "Could not decrypt the frames for visual analysis." } : it
          )
        );
        return;
      }
      const prompt = `These are screenshots from the user's own screen. Answer their question concisely based on what is visible: ${entry.query}`;
      const reply = await ollamaClient.visionAnswer(model, prompt, images);
      setHistory((prev) =>
        prev.map((it) => (it.id === entry.id ? { ...it, visionBusy: false, visionReply: reply, visionModel: model } : it))
      );
    } catch (err: any) {
      setHistory((prev) =>
        prev.map((it) =>
          it.id === entry.id ? { ...it, visionBusy: false, visionReply: `Visual analysis failed: ${err.message || err}` } : it
        )
      );
    }
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

    // Read the engine fresh on every submit so a change in Settings applies immediately
    let engine: "local" | "cloud" = "local";
    try {
      engine = await settingsRepo.getAiEngine();
    } catch (err) {
      console.error("Failed to read AI engine setting:", err);
    }

    if (engine === "local" && !ollamaOnline) {
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
      if (engine === "local" && !installed.includes(chatModel) && !installed.includes(`${chatModel}:latest`)) {
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

        if (engine === "cloud") {
          await runCloudCompletion(messages, queryId);
        } else {
          await ollamaClient.chatStream(chatModel, messages, (chunk) => {
            setHistory((prev) =>
              prev.map((item) =>
                item.id === queryId ? { ...item, reply: item.reply + chunk } : item
              )
            );
          });
        }
        setIsLoading(false);
        return;
      }

      addStep(queryId, "Searching your memory…");

      // Gather today's stats, top apps, timeline, goals, and notes
      const [stats, topApps, timeline, dailyGoal, notes] = await Promise.all([
        activityRepo.todayStats(),
        activityRepo.topAppsToday(),
        activityRepo.timelineToday(),
        goalsRepo.getDailyGoal(),
        notesRepo.list(),
      ]);

      // Search the encrypted visual memory (frames): keyword + semantic + an
      // optional time filter. Only a handful of candidates; nothing decrypts here.
      const { hits: frameHits, timeRange } = await retrieveRelevantFrames(query);

      if (frameHits.length > 0) {
        const apps = Array.from(new Set(frameHits.map((h) => h.frame.app).filter(Boolean))) as string[];
        const topTime = new Date(frameHits[0].frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        addStep(
          queryId,
          `Found ${frameHits.length} matching frame${frameHits.length > 1 ? "s" : ""}${
            timeRange ? ` (${timeRange.label})` : ""
          }${apps.length ? ` in ${apps.slice(0, 3).join(", ")}` : ""}, near ${topTime}`
        );
      } else {
        addStep(queryId, `No matching frames${timeRange ? ` for ${timeRange.label}` : ""}; using your activity, notes & goals`);
      }
      addStep(queryId, "Reading the top matches and writing the answer…");

      // Cite the frames (thumbnails shown under the answer).
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId
            ? {
                ...item,
                frameSources: frameHits.map((h) => ({
                  app: h.frame.app,
                  window_title: h.frame.window_title,
                  timestamp: h.frame.timestamp,
                  thumbnail_path: h.frame.thumbnail_path,
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
`;

      // Visual memory (frames) — the actual screen content, with timestamps the
      // answer can cite. The matching thumbnails are shown under the answer.
      contextText += `\n\n--- RELEVANT SCREEN FRAMES (visual memory${
        timeRange ? `, filtered to ${timeRange.label}` : ""
      }) ---\n`;
      if (frameHits.length > 0) {
        frameHits.forEach((h, idx) => {
          const t = new Date(h.frame.timestamp).toLocaleTimeString();
          contextText += `\n[Frame #${idx + 1}]
Time: ${t}
App: ${h.frame.app || "Unknown"}
Window/Tab: ${h.frame.window_title || h.frame.url || "Unknown"}
Content: "${(h.frame.ocr_text || "").replace(/\n+/g, " ").substring(0, 600)}"
`;
        });
      } else {
        contextText += "\nNo matching frames in visual memory.";
      }

      // Trim context to max chars
      if (contextText.length > MAX_CONTEXT_CHARS) {
        contextText = contextText.substring(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
      }

      const systemPrompt = `You are Vera, a local AI personal assistant. Answer questions about the user's day based ONLY on the context provided below. This is a conversation — the user may ask follow-ups that refer to earlier answers.

THINK OUT LOUD FIRST. Before answering, reason through the problem step by step, in the first person, like you are talking to yourself. Restate what the user is really asking. Walk through the context — the activity stats, top apps, notes, goals, and especially the screen frames (each has a time, an app, a window/tab, and the text content that was on screen). Name the specific frames, apps, and times you are leaning on ("The frame at 14:32 in Chrome shows…", "So that tells me…"), weigh what is relevant, and reason toward a conclusion. Be concrete — quote what you actually see in the context.

Then, on a NEW LINE, write exactly "ANSWER:" and give your final reply.

Rules for the final answer:
1. Ground it strictly in the context. The "TODAY'S ACTIVITY STATS" and "TOP 5 APPS TODAY" sections are real recorded history — never claim you have no information just because the frames list is short.
2. Be concise, honest, and direct: 1-3 sentences or a short bullet list.
3. If the answer genuinely is not in the context (not in stats, top apps, notes, goals, nor frames), say "I don't have that in your data." Do not make things up.
4. Use the conversation history to resolve follow-ups ("and the second?", "summarize that", "are you sure?").
5. All inference runs locally. Never mention internal mechanics like embeddings, cosine similarity, vectors, or database queries.`;

      // Build the full message array: system + history + new user message
      const conversationHistory = buildConversationHistory(historySnapshot);
      const messages = [
        { role: "system", content: systemPrompt + "\n\nContext:\n" + contextText },
        ...conversationHistory,
        { role: "user", content: query },
      ];

      // Generate the answer with the configured engine (retrieval stayed local).
      // Vera reasons out loud first; we stream that self-talk into the thinking
      // panel and the final answer into the reply as the marker arrives.
      if (engine === "cloud") {
        await runCloudCompletion(messages, queryId, true);
      } else {
        let raw = "";
        await ollamaClient.chatStream(chatModel, messages, (chunk) => {
          raw += chunk;
          const { reasoning, answer } = splitReasoning(raw);
          setHistory((prev) =>
            prev.map((item) =>
              item.id === queryId ? { ...item, reasoning, reply: answer } : item
            )
          );
        });
        // Stream finished: if the model never emitted an "ANSWER:" marker, treat
        // its whole response as the answer so the user always sees a reply.
        const { answer } = splitReasoning(raw);
        if (!answer) {
          setHistory((prev) =>
            prev.map((item) =>
              item.id === queryId ? { ...item, reasoning: "", reply: raw.trim() } : item
            )
          );
        }
      }
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

      {/* Offline Alert — only relevant while the local engine is selected */}
      {engineState === "local" && !ollamaOnline && (
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
                        {userInitials}
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

                      {((item.thinkingSteps && item.thinkingSteps.length > 0) ||
                        (item.reasoning && item.reasoning.trim())) && (
                        <ThinkingPanel
                          steps={item.thinkingSteps || []}
                          reasoning={item.reasoning}
                          live={isLoading && idx === history.length - 1 && !item.reply}
                        />
                      )}

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

                      {/* Cited frames from the visual memory (decrypted on demand) */}
                      {item.frameSources && item.frameSources.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <span className="font-sans text-[10px] text-text-faint uppercase tracking-wider font-semibold">
                            From your screen
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {item.frameSources.map((fs, i) => (
                              <FrameThumbnail key={i} frame={fs} />
                            ))}
                          </div>

                          {/* Optional, explicit vision pass over the cited frames */}
                          {item.reply && (
                            <div className="mt-1 flex flex-col gap-2">
                              {!item.visionReply && !item.visionBusy && (
                                <button
                                  onClick={() => runVisionPass(item)}
                                  className="self-start font-sans text-[11px] px-2.5 py-1 rounded-full border border-border-hairline text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
                                >
                                  Look at the frames (vision)
                                </button>
                              )}
                              {item.visionBusy && (
                                <span className="font-sans text-[11px] text-text-faint italic">
                                  Analyzing the frames visually…
                                </span>
                              )}
                              {item.visionReply && (
                                <div className="flex flex-col gap-1 p-3 rounded-xl bg-active-hover/50 border border-border-hairline">
                                  <span className="font-sans text-[10px] text-text-faint uppercase tracking-wider font-semibold">
                                    Visual analysis{item.visionModel ? ` · ${item.visionModel}` : ""}
                                  </span>
                                  <p className="font-sans text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap select-text">
                                    {item.visionReply}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
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
