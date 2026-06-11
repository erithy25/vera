import React, { useState, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { AGENTS, AgentId, getAgentById, consumePendingAgentId } from "../lib/agents";
import { AgentChat } from "./AgentChat";

export const Agents: React.FC = () => {
  // A click on the Dashboard "Your Agents" card may have requested a
  // specific agent before this page mounted
  const [activeAgentId, setActiveAgentId] = useState<AgentId | null>(() =>
    consumePendingAgentId()
  );

  useEffect(() => {
    const onOpenAgent = () => {
      const id = consumePendingAgentId();
      if (id) setActiveAgentId(id);
    };
    window.addEventListener("vera-open-agent", onOpenAgent);
    return () => window.removeEventListener("vera-open-agent", onOpenAgent);
  }, []);

  const agent = activeAgentId ? getAgentById(activeAgentId) : null;

  if (agent) {
    return (
      <div className="w-full max-w-[1100px] flex flex-col items-center px-8 pb-16 mt-8">
        <AgentChat agent={agent} onBack={() => setActiveAgentId(null)} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-border-hairline pb-4">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Agents
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed">
          Personal AI teammates with their own focus. Each agent chats with your local context and can propose notes or goals — nothing happens without your approval.
        </p>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveAgentId(a.id)}
            className="card-style p-5 flex items-center justify-between gap-4 text-left transition-all duration-150 active:scale-[0.99] cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0">
                <span className="font-sans text-[12px] font-semibold text-text-primary">
                  {a.avatarText}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-serif text-[17px] font-normal text-text-primary leading-snug">
                  {a.name}
                </span>
                <span className="font-sans text-[12px] text-text-faint leading-tight truncate">
                  {a.description}
                </span>
              </div>
            </div>
            <span className="flex items-center gap-1 font-sans text-[12px] font-medium text-text-muted group-hover:text-text-primary transition-colors shrink-0">
              Open
              <ArrowUpRight size={14} strokeWidth={1.5} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
