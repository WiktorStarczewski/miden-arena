// react import removed — JSX transform handles it
import { motion } from "framer-motion";
import GlassPanel from "../layout/GlassPanel";

type BattlePhase =
  | "choosing"
  | "committing"
  | "waitingCommit"
  | "revealing"
  | "waitingReveal"
  | "resolving"
  | "animating";

interface TurnPhaseIndicatorProps {
  phase: BattlePhase;
}

const PHASE_CONFIG: Record<
  BattlePhase,
  { text: string; isWaiting: boolean; color: string }
> = {
  choosing: {
    text: "Choose your move",
    isWaiting: false,
    color: "text-amber-400",
  },
  committing: {
    text: "Committing action...",
    isWaiting: true,
    color: "text-sky-400",
  },
  waitingCommit: {
    text: "Waiting for opponent to commit...",
    isWaiting: true,
    color: "text-purple-400",
  },
  revealing: {
    text: "Revealing action...",
    isWaiting: true,
    color: "text-sky-400",
  },
  waitingReveal: {
    text: "Waiting for opponent to reveal...",
    isWaiting: true,
    color: "text-purple-400",
  },
  resolving: {
    text: "Resolving turn...",
    isWaiting: true,
    color: "text-teal-400",
  },
  animating: {
    text: "Battle in progress",
    isWaiting: false,
    color: "text-orange-400",
  },
};

export default function TurnPhaseIndicator({
  phase,
}: TurnPhaseIndicatorProps) {
  const config = PHASE_CONFIG[phase];

  return (
    <GlassPanel compact className="text-center">
      <div className="flex items-center justify-center gap-2">
        {/* Pulsing dot for waiting states */}
        {config.isWaiting && (
          <motion.div
            className={`w-2 h-2 rounded-full ${
              phase === "waitingCommit" || phase === "waitingReveal"
                ? "bg-purple-400"
                : "bg-sky-400"
            }`}
            animate={{
              opacity: [1, 0.3, 1],
              scale: [1, 0.85, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        <span className={`text-sm font-semibold ${config.color}`}>
          {config.text}
        </span>

        {/* Animated dots for waiting text */}
        {config.isWaiting && (
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className={`inline-block w-1 h-1 rounded-full ${
                  phase === "waitingCommit" || phase === "waitingReveal"
                    ? "bg-purple-400"
                    : "bg-sky-400"
                }`}
                animate={{ opacity: [0, 1, 0] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </span>
        )}
      </div>
    </GlassPanel>
  );
}
