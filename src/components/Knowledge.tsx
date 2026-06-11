import React, { useState, useEffect } from "react";
import { Search, Eye, AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { capturesRepo, DbCapture, settingsRepo } from "../lib/db";
import { ollamaClient, cosineSimilarity } from "../lib/ollama";

const PAGE_SIZE = 80;

function dayLabel(timeMs: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const day = new Date(timeMs);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return new Date(timeMs).toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });
}

function timeLabel(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const Knowledge: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [captures, setCaptures] = useState<DbCapture[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [permissionMissing, setPermissionMissing] = useState(false);
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">("keyword");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
    setVisibleCount(PAGE_SIZE);
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

  const handleDelete = async (id: number) => {
    try {
      await capturesRepo.remove(id);
      setCaptures((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete capture:", err);
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  const visibleCaptures = captures.slice(0, visibleCount);

  // Group browsing results by day for a scannable overview; search results
  // stay in relevance order as a flat list
  const dayGroups: { label: string; items: DbCapture[] }[] = [];
  if (!isSearching) {
    for (const capture of visibleCaptures) {
      const label = dayLabel(capture.captured_at);
      const lastGroup = dayGroups[dayGroups.length - 1];
      if (lastGroup && lastGroup.label === label) {
        lastGroup.items.push(capture);
      } else {
        dayGroups.push({ label, items: [capture] });
      }
    }
  }

  const renderCaptureRow = (item: DbCapture, idx: number) => {
    const isExpanded = expandedIds.has(item.id);
    return (
      <div key={item.id} className="flex flex-col">
        {idx > 0 && <div className="h-px bg-border-hairline w-full" />}
        <div
          onClick={() => toggleExpand(item.id)}
          className="group flex flex-col gap-1.5 py-3 px-1 rounded-lg hover:bg-active-hover/30 transition-colors cursor-pointer"
        >
          {/* Meta row */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-sans text-[12px] font-semibold text-text-primary px-2 py-0.5 bg-active-hover rounded-md shrink-0">
              {item.app_name}
            </span>
            {item.window_title && (
              <span
                className="font-sans text-[12px] text-text-muted truncate min-w-0"
                title={item.window_title}
              >
                {item.window_title}
              </span>
            )}
            <span className="font-sans text-[11px] text-text-faint shrink-0 ml-auto">
              {timeLabel(item.captured_at)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item.id);
              }}
              title="Delete this capture"
              className="opacity-0 group-hover:opacity-100 transition-all duration-150 text-text-faint hover:text-red-600 p-1 rounded hover:bg-active-hover active:scale-90 cursor-pointer shrink-0"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
            {isExpanded ? (
              <ChevronUp size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />
            ) : (
              <ChevronDown size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />
            )}
          </div>

          {/* Text: compact two-line preview, full text on click */}
          {isExpanded ? (
            <div className="font-sans text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap select-text selection:bg-active-hover/80 pt-1">
              {item.ocr_text || (
                <span className="text-text-faint italic font-normal">No readable text captured</span>
              )}
            </div>
          ) : (
            <p className="font-sans text-[13px] text-text-muted leading-relaxed line-clamp-2">
              {item.ocr_text.replace(/\n+/g, "  ") || (
                <span className="text-text-faint italic font-normal">No readable text captured</span>
              )}
            </p>
          )}
        </div>
      </div>
    );
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
      <div className="flex items-center gap-4">
        <div className="relative w-full max-w-[500px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-faint" size={18} strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search screen history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-28 py-3 bg-card-surface border border-border-hairline rounded-2xl font-sans text-[14px] text-text-primary placeholder:text-text-faint outline-none soft-shadow focus:border-text-muted/40 transition-colors"
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-lg bg-active-hover text-text-muted select-none border border-border-hairline">
              {searchMode === "semantic" ? "AI Semantic" : "Keyword"}
            </span>
          )}
        </div>
        <span className="font-sans text-[12px] text-text-faint shrink-0">
          {captures.length} {captures.length === 1 ? "capture" : "captures"}
        </span>
      </div>

      {/* Captures — grouped by day while browsing, flat while searching */}
      {captures.length > 0 ? (
        <div className="flex flex-col gap-6">
          {isSearching ? (
            <div className="card-style px-5 py-2 flex flex-col">
              {visibleCaptures.map((item, idx) => renderCaptureRow(item, idx))}
            </div>
          ) : (
            dayGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                    {group.label}
                  </span>
                  <span className="font-sans text-[10px] text-text-faint">
                    · {group.items.length}
                  </span>
                </div>
                <div className="card-style px-5 py-2 flex flex-col">
                  {group.items.map((item, idx) => renderCaptureRow(item, idx))}
                </div>
              </div>
            ))
          )}

          {captures.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="self-center flex items-center gap-1.5 px-4 py-2 border border-border-hairline rounded-xl font-sans text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
            >
              <ChevronDown size={14} strokeWidth={1.5} />
              Show older captures ({captures.length - visibleCount} more)
            </button>
          )}
        </div>
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
  );
};
