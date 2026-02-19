import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { initAudio, playMusic } from "../audio/audioManager";

export default function TitleScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a] px-4">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-radial from-amber-900/20 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 text-center"
      >
        {/* Title */}
        <h1 className="mb-2 text-6xl font-black tracking-tighter text-white sm:text-7xl">
          MIDEN
        </h1>
        <h2 className="mb-1 text-4xl font-bold tracking-wide text-amber-400 sm:text-5xl">
          ARENA
        </h2>
        <p className="mb-12 text-sm tracking-widest text-gray-400 uppercase">
          Champions Battle
        </p>

        {/* Play button */}
        <motion.button
          onClick={() => {
            initAudio().then(() => playMusic("menu"));
            setScreen("setup");
          }}
          className="rounded-3xl bg-gradient-to-r from-amber-500 to-orange-600 text-5xl font-black tracking-widest text-white shadow-2xl shadow-amber-500/40 transition-all hover:shadow-amber-500/60 active:scale-95"
          style={{ marginTop: "3rem", marginBottom: "3rem", padding: "3rem 5rem" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          PLAY
        </motion.button>

        {/* Subtitle */}
        <p className="mt-8 text-xs text-gray-500">
          Provably fair on-chain card battles
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Powered by Miden, the Privacy Blockchain
        </p>
      </motion.div>

      {/* Decorative elements */}
      <div className="pointer-events-none absolute bottom-8 flex gap-4 text-xs text-gray-600">
        <span>10 Champions</span>
        <span>&#183;</span>
        <span>4 Elements</span>
        <span>&#183;</span>
        <span>Commit-Reveal Combat</span>
      </div>
    </div>
  );
}
