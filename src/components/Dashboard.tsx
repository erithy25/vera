import React from "react";
import { Wordmark } from "./Wordmark";
import { CommandBar } from "./CommandBar";
import { TodayCard } from "./TodayCard";
import { TopAppsCard } from "./TopAppsCard";
import { TimelineCard } from "./TimelineCard";
import { AgentsCard } from "./AgentsCard";

export const Dashboard: React.FC = () => {
  return (
    <div className="w-full max-w-[1100px] flex flex-col items-center gap-14 px-8 pb-16">
      {/* Brand Centered Header Area */}
      <div className="w-full flex flex-col items-center gap-8 mt-12">
        <Wordmark />
        <CommandBar />
      </div>

      {/* Grid of Dashboard Activity Cards */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <TodayCard />
        <TopAppsCard />
        <TimelineCard />
        <AgentsCard />
      </div>
    </div>
  );
};
