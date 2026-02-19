import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GlassPanel from "../layout/GlassPanel";
import type { TurnRecord, TurnEvent } from "../../types/game";

interface BattleLogProps {
  log: TurnRecord[];
}

function getEventColor(event: TurnEvent): string {
  // Determine color by event type/content
  const text = typeof event === "string" ? event : event.type ?? "";
  if (text.includes("damage") || text.includes("attack")) return "text-red-400";
  if (text.includes("heal")) return "text-emerald-400";
  if (text.includes("burn")) return "text-orange-400";
  if (text.includes("buff")) return "text-sky-400";
  if (text.includes("debuff")) return "text-purple-400";
  if (text.includes("ko") || text.includes("KO")) return "text-red-500";
  return "text-white/60";
}

function formatEvent(event: TurnEvent): string {
  if (typeof event === "string") return event;
  // If event is an object with a message field
  if (event.message) return event.message;
  if (event.description) return event.description;
  return JSON.stringify(event);
}

export default function BattleLog({ log }: BattleLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = 0;
    }
  }, [log.length, isExpanded]);

  const reversedLog = [...log].reverse();
  const latestRound = reversedLog[0];

  return (
    <div className="w-full">
      {/* Collapsed header / toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <GlassPanel
          compact
          className="
            flex items-center justify-between
            hover:bg-white/5 transition-colors cursor-pointer
          "
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Battle Log
            </span>
            {log.length > 0 && (
              <span className="text-[10px] text-white/30 tabular-nums">
                ({log.length} rounds)
              </span>
            )}
          </div>

          {/* Latest event preview when collapsed */}
          {!isExpanded && latestRound && latestRound.events.length > 0 && (
            <span className="text-[11px] text-white/40 truncate max-w-[180px]">
              R{latestRound.round}: {formatEvent(latestRound.events[0])}
            </span>
          )}
        </GlassPanel>
      </button>

      {/* Expanded log */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="mt-1 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
            >
              {reversedLog.length === 0 ? (
                <GlassPanel compact>
                  <p className="text-xs text-white/30 text-center italic">
                    No events yet
                  </p>
                </GlassPanel>
              ) : (
                <div className="space-y-1">
                  {reversedLog.map((record) => (
                    <GlassPanel key={record.round} compact>
                      {/* Round header */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70">
                          Round {record.round}
                        </span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>

                      {/* Actions */}
                      <div className="space-y-0.5 mb-1">
                        {record.myAction && (
                          <div className="text-[11px] text-sky-400/80">
                            <span className="text-white/30">You: </span>
                            {typeof record.myAction === "string"
                              ? record.myAction
                              : record.myAction.abilityName ?? "action"}
                          </div>
                        )}
                        {record.opponentAction && (
                          <div className="text-[11px] text-red-400/80">
                            <span className="text-white/30">Foe: </span>
                            {typeof record.opponentAction === "string"
                              ? record.opponentAction
                              : record.opponentAction.abilityName ?? "action"}
                          </div>
                        )}
                      </div>

                      {/* Events */}
                      <div className="space-y-0.5">
                        {record.events.map((event, i) => (
                          <div
                            key={i}
                            className={`text-[11px] leading-relaxed ${getEventColor(event)}`}
                          >
                            {formatEvent(event)}
                          </div>
                        ))}
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
