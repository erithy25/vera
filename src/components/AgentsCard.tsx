import React from "react";
import { agents } from "../lib/config";

export const AgentsCard: React.FC = () => {
  return (
    <div className="card-style p-6 flex flex-col h-[340px] justify-between">
      {/* Header */}
      <div className="select-none">
        <h2 className="font-serif text-[20px] font-normal text-text-primary leading-tight">
          Your Agents
        </h2>
        <p className="font-sans text-[11px] text-text-muted mt-0.5 leading-tight">
          Personal AI teammates working for you.
        </p>
      </div>

      {/* Agents List */}
      <div className="flex flex-col gap-3 mt-4 flex-1 justify-center">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-3 p-1 rounded-xl hover:bg-active-hover/40 transition-all duration-150 active:scale-[0.98] active:bg-active-hover/60 select-none cursor-pointer"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0">
              <span className="font-sans text-[11px] font-semibold text-text-primary">
                {agent.avatarText}
              </span>
            </div>

            {/* Info */}
            <div className="flex flex-col min-w-0">
              <span className="font-sans text-[13px] font-medium text-text-primary leading-snug">
                {agent.name}
              </span>
              <span className="font-sans text-[11px] text-text-faint truncate leading-tight">
                {agent.description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
