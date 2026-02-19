import { motion } from "framer-motion";

export default function LoadingScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white">
          MIDEN <span className="text-amber-400">ARENA</span>
        </h1>
        <p className="mb-8 text-sm text-gray-400">Champions Battle</p>

        {/* Loading spinner */}
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-3 w-3 rounded-full bg-amber-400"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>

        <p className="mt-6 text-xs text-gray-500">Initializing WASM runtime...</p>
      </motion.div>
    </div>
  );
}
