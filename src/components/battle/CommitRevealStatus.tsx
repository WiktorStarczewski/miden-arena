// react import removed — JSX transform handles it
import { motion } from "framer-motion";
import GlassPanel from "../layout/GlassPanel";

interface CommitRevealStatusProps {
  myCommitted: boolean;
  opponentCommitted: boolean;
  myRevealed: boolean;
  opponentRevealed: boolean;
  verified?: boolean;
}

interface StepRowProps {
  label: string;
  done: boolean;
  inProgress: boolean;
}

function StepRow({ label, done, inProgress }: StepRowProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Status icon */}
      <div className="w-5 h-5 flex items-center justify-center">
        {done ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center"
          >
            <svg
              className="w-3 h-3 text-emerald-400"
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
          </motion.div>
        ) : inProgress ? (
          <motion.div
            className="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          <div className="w-4 h-4 rounded-full border border-white/20" />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-xs font-medium ${
          done
            ? "text-emerald-400/80"
            : inProgress
              ? "text-sky-400"
              : "text-white/30"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default function CommitRevealStatus({
  myCommitted,
  opponentCommitted,
  myRevealed,
  opponentRevealed,
  verified = false,
}: CommitRevealStatusProps) {
  return (
    <GlassPanel compact>
      <div className="grid grid-cols-2 gap-4">
        {/* You column */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
            You
          </div>
          <div className="space-y-2">
            <StepRow
              label="Committed"
              done={myCommitted}
              inProgress={!myCommitted}
            />
            <StepRow
              label="Revealed"
              done={myRevealed}
              inProgress={myCommitted && !myRevealed}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10" />

          {/* Opponent column */}
          <div className="pl-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
              Opponent
            </div>
            <div className="space-y-2">
              <StepRow
                label="Committed"
                done={opponentCommitted}
                inProgress={myCommitted && !opponentCommitted}
              />
              <StepRow
                label="Revealed"
                done={opponentRevealed}
                inProgress={
                  myRevealed && opponentCommitted && !opponentRevealed
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Verified badge */}
      {verified && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 pt-2 border-t border-white/5 flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
            />
          </svg>
          <span className="text-[11px] font-semibold text-emerald-400">
            ZK Verified
          </span>
        </motion.div>
      )}
    </GlassPanel>
  );
}
