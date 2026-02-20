import { motion } from "framer-motion";
import GlassPanel from "../components/layout/GlassPanel";

interface ErrorScreenProps {
  error?: Error | string;
  onRetry?: () => void;
}

export default function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  const message = error instanceof Error ? error.message : error ?? "An unknown error occurred";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center">
          <div className="mb-4 text-5xl text-red-400">&#9888;</div>
          <h2 className="text-2xl font-bold text-white">Something Went Wrong</h2>
        </div>

        <GlassPanel>
          <p className="break-words text-sm text-red-300">{message}</p>
        </GlassPanel>

        <div className="flex justify-center gap-4">
          {onRetry && (
            <motion.button
              onClick={onRetry}
              className="cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 font-bold text-white"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Retry
            </motion.button>
          )}
          <motion.button
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-xl border border-white/10 bg-black/40 px-8 py-3 font-bold text-gray-300"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Reload
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
