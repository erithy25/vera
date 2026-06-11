import React, { useState, useEffect } from "react";
import { Search, Eye, AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { capturesRepo, DbCapture, settingsRepo } from "../lib/db";
import { ollamaClient, cosineSimilarity } from "../lib/ollama";

export const Knowledge: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [captures, setCaptures] = useState<DbCapture[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [permissionMissing, setPermissionMissing] = useState(false);
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">("keyword");

  const fetchCaptures = async () => {
    try {
      const isOnline = await ollamaClient.isRunning();
      const embeddingModel = await settingsRepo.getEmbeddingModel();
      const models = await ollamaClient.listModels();
      const modelAvailable = isOnline && (models.includes(embeddingModel) || models.includes(`${embeddingModel}:latest`));

      if (searchQuery.trim().length > 0 && modelAvailable) {
        try {
          setSearchMode("semantic");
          const queryVector = await ollamaClient.generateEmbedding(searchQuery, embeddingModel);
          const allCaptures = await capturesRepo.list(); // Retrieve all captures for JS-side ranking
          
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
            .map((item) => item.capture)
            .slice(0, 45); // Limit to top 45 hits

          setCaptures(ranked);
          return;
        } catch (err) {
          console.error("Semantic search failed, falling back to keyword search:", err);
        }
      }

      setSearchMode("keyword");
      const list = await capturesRepo.list(searchQuery);
      setCaptures(list);
    } catch (err) {
      console.error("Failed to fetch captures:", err);
    }
  };

  useEffect(() => {
    fetchCaptures();

    // Listen for custom capture updates or permission warning events
    const handleUpdate = () => fetchCaptures();
    const handlePermissionMissing = () => setPermissionMissing(true);

    window.addEventListener("captures-updated", handleUpdate);
    window.addEventListener("capture-permission-missing", handlePermissionMissing);

    return () => {
      window.removeEventListener("captures-updated", handleUpdate);
      window.removeEventListener("capture-permission-missing", handlePermissionMissing);
    };
  }, [searchQuery]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getRelativeTime = (timeMs: number) => {
    const elapsedMs = Date.now() - timeMs;
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    if (elapsedSecs < 10) return "just now";
    if (elapsedSecs < 60) return `${elapsedSecs}s ago`;
    const elapsedMins = Math.floor(elapsedSecs / 60);
    if (elapsedMins < 60) return `${elapsedMins}m ago`;
    const elapsedHours = Math.floor(elapsedMins / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    return `${elapsedDays}d ago`;
  };

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      {/* Header Info */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Knowledge
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed max-w-[600px]">
          A searchable history of text captured from your screen. Fully processed locally on-device and private.
        </p>
      </div>

      {/* Screen Recording Permission Alert */}
      {permissionMissing && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl animate-fade-in">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} strokeWidth={1.5} />
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[14px] font-semibold text-amber-900 leading-tight">
              Screen Recording Permission Needed
            </span>
            <span className="font-sans text-[13px] text-amber-800 leading-normal">
              Vera needs Screen Recording permission to analyze text on your screen. Open <strong>System Settings &gt; Privacy &amp; Security &gt; Screen Recording</strong> and enable access for Vera.
            </span>
          </div>
        </div>
      )}

      {/* Search Input Control */}
      <div className="relative w-full max-w-[500px]">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-faint" size={18} strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Search screen history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-28 py-3 bg-card-surface border border-border-hairline rounded-2xl font-sans text-[14px] text-text-primary placeholder:text-text-faint outline-none soft-shadow focus:border-text-muted/40 transition-colors"
        />
        {searchQuery.trim().length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-lg bg-active-hover text-text-muted select-none border border-border-hairline">
            {searchMode === "semantic" ? "AI Semantic" : "Keyword"}
          </span>
        )}
      </div>

      {/* Capture Cards List */}
      <div className="flex flex-col gap-4 mt-2">
        {captures.length > 0 ? (
          captures.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const textSnippet = item.ocr_text.length > 280 && !isExpanded
              ? `${item.ocr_text.substring(0, 280)}...`
              : item.ocr_text;

            return (
              <div
                key={item.id}
                className="card-style p-5 flex flex-col gap-3 hover:border-text-muted/20 transition-all duration-200"
              >
                {/* Meta details */}
                <div className="flex items-center justify-between border-b border-border-hairline pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-sans text-[13px] font-semibold text-text-primary px-2.5 py-1 bg-active-hover rounded-lg">
                      {item.app_name}
                    </span>
                    {item.window_title && (
                      <span className="font-sans text-[13px] text-text-muted truncate max-w-[320px]" title={item.window_title}>
                        {item.window_title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-sans text-[11px] text-text-faint tracking-wider uppercase">
                      {item.char_count} chars
                    </span>
                    <span className="font-sans text-[12px] text-text-muted font-medium">
                      {getRelativeTime(item.captured_at)}
                    </span>
                  </div>
                </div>

                {/* OCR text segment */}
                <div className="flex flex-col gap-2">
                  <div className="font-sans text-[14px] text-text-primary leading-relaxed whitespace-pre-wrap select-text selection:bg-active-hover/80">
                    {textSnippet || (
                      <span className="text-text-faint italic font-normal">
                        No readable text captured
                      </span>
                    )}
                  </div>

                  {item.ocr_text.length > 280 && (
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="flex items-center gap-1 text-[13px] font-medium text-text-muted hover:text-text-primary self-start transition-colors mt-1 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <span>Show less</span>
                          <ChevronUp size={14} strokeWidth={1.5} />
                        </>
                      ) : (
                        <>
                          <span>Read full capture</span>
                          <ChevronDown size={14} strokeWidth={1.5} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-card-surface border border-border-hairline border-dashed rounded-3xl gap-3">
            <div className="w-12 h-12 rounded-full bg-active-hover flex items-center justify-center text-text-muted">
              <Eye size={22} strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center gap-1">
              <span className="font-serif text-[18px] text-text-primary">
                {searchQuery ? "No search results" : "Screen memory is empty"}
              </span>
              <span className="font-sans text-[13px] text-text-faint max-w-[280px]">
                {searchQuery
                  ? "We couldn't find any screen text matching your query."
                  : "Captures will appear here automatically as you use your Mac."}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
