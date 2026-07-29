import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { detectorCount } from "../lib/scan";

/**
 * The status pill in the top-right corner.
 *
 * It used to report whether background capture was paused and which AI engine
 * was answering. Neither exists any more: Vera reads a file when you hand it
 * one and does nothing in between, and there is no model anywhere in the
 * product.
 *
 * What is worth stating permanently is the thing a person has to trust before
 * they drop a recording of their own screen into a piece of software — that it
 * does not talk to anything.
 */
export const TopBar: React.FC = () => {
  const [detectors, setDetectors] = useState<number | null>(null);

  useEffect(() => {
    detectorCount()
      .then(setDetectors)
      .catch(() => setDetectors(null));
  }, []);

  return (
    <div className="flex justify-end items-center py-6 px-10 w-full">
      <div
        title="Vera makes no network requests while scanning."
        className="flex items-center gap-2 px-3 py-1.5 bg-card-surface border border-border-hairline rounded-full select-none text-text-muted"
      >
        <WifiOff size={12} strokeWidth={1.75} className="text-emerald-600" />
        <span className="text-[12px] font-sans font-medium tracking-wider uppercase">
          Offline
          {detectors !== null && (
            <span className="text-text-faint normal-case tracking-normal">
              {" "}
              · {detectors} detectors
            </span>
          )}
        </span>
      </div>
    </div>
  );
};
