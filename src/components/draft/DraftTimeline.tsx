import React from "react";
import { motion } from "framer-motion";
import GlassPanel from "../layout/GlassPanel";

interface DraftTimelineProps {
  pickNumber: number;
  role: "host" | "joiner";
}

// Standard A-B-B-A-A-B draft order for 6 picks
const DRAFT_SEQUENCE: ("host" | "joiner")[] = [
  "host",   // Pick 1: A
  "joiner", // Pick 2: B
  "joiner", // Pick 3: B
  "host",   // Pick 4: A
  "host",   // Pick 5: A
  "joiner", // Pick 6: B
];

const DRAFT_LABELS = ["A", "B", "B", "A", "A", "B"];

export default function DraftTimeline({
  pickNumber,
  role,
}: DraftTimelineProps) {
  return (
    <GlassPanel compact>
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 text-center">
        Draft Order
      </div>

      <div className="flex items-center justify-center gap-1">
        {DRAFT_SEQUENCE.map((picker, index) => {
          const pickIdx = index + 1;
          const isCompleted = pickIdx < pickNumber;
          const isCurrent = pickIdx === pickNumber;
          const isMyPick = picker === role;

          return (
            <React.Fragment key={index}>
              {/* Pick node */}
              <motion.div
                className={`
                  relative flex flex-col items-center gap-1
                `}
                animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                transition={
                  isCurrent
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : {}
                }
              >
                {/* Circle */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    border-2 transition-all duration-300
                    ${
                      isCompleted
                        ? "bg-emerald-500/20 border-emerald-400/50"
                        : isCurrent
                          ? isMyPick
                            ? "bg-amber-500/20 border-amber-400 shadow-lg shadow-amber-400/20"
                            : "bg-purple-500/20 border-purple-400 shadow-lg shadow-purple-400/20"
                          : "bg-white/5 border-white/15"
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg
                      className="w-3.5 h-3.5 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span
                      className={`
                        text-xs font-bold
                        ${
                          isCurrent
                            ? isMyPick
                              ? "text-amber-400"
                              : "text-purple-400"
                            : "text-white/30"
                        }
                      `}
                    >
                      {DRAFT_LABELS[index]}
                    </span>
                  )}
                </div>

                {/* Pick number */}
                <span
                  className={`
                    text-[9px] tabular-nums font-medium
                    ${
                      isCompleted
                        ? "text-emerald-400/60"
                        : isCurrent
                          ? "text-white/70"
                          : "text-white/20"
                    }
                  `}
                >
                  #{pickIdx}
                </span>

                {/* "You" / "Foe" label */}
                <span
                  className={`
                    text-[8px] uppercase tracking-wider font-semibold
                    ${
                      isMyPick
                        ? isCurrent
                          ? "text-amber-400"
                          : "text-amber-400/40"
                        : isCurrent
                          ? "text-purple-400"
                          : "text-purple-400/40"
                    }
                  `}
                >
                  {isMyPick ? "You" : "Foe"}
                </span>
              </motion.div>

              {/* Connector line */}
              {index < DRAFT_SEQUENCE.length - 1 && (
                <div className="w-4 h-[2px] rounded-full mt-[-18px]">
                  <div
                    className={`
                      h-full rounded-full transition-colors duration-300
                      ${isCompleted ? "bg-emerald-400/40" : "bg-white/10"}
                    `}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </GlassPanel>
  );
}
