import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useGLTF, useProgress } from "@react-three/drei";
import { useGameStore } from "../store/gameStore";
import { getChampion } from "../constants/champions";

/** Animations used during battle — must match BattleScreen's getAnimationForPhase */
const BATTLE_ANIMATIONS = ["idle", "attack1", "hit_reaction"] as const;

/**
 * Build the full list of .glb URLs that battle needs for a set of champion IDs.
 * Each champion requires: base model + one file per animation.
 */
function getPreloadUrls(championIds: number[]): string[] {
  const urls: string[] = [];
  for (const id of championIds) {
    const { modelPath } = getChampion(id);
    urls.push(modelPath);
    for (const anim of BATTLE_ANIMATIONS) {
      urls.push(modelPath.replace(".glb", `.${anim}.glb`));
    }
  }
  return urls;
}

export default function PreBattleLoadingScreen() {
  const myChampions = useGameStore((s) => s.battle.myChampions);
  const opponentChampions = useGameStore((s) => s.battle.opponentChampions);
  const setScreen = useGameStore((s) => s.setScreen);

  const preloadStarted = useRef(false);
  const transitioned = useRef(false);

  // Build URL list once
  const urls = useMemo(() => {
    const allIds = [
      ...myChampions.map((c) => c.id),
      ...opponentChampions.map((c) => c.id),
    ];
    return getPreloadUrls(allIds);
  }, [myChampions, opponentChampions]);

  // Kick off preloading
  useEffect(() => {
    if (urls.length === 0) return;
    preloadStarted.current = true;
    for (const url of urls) {
      useGLTF.preload(url);
    }
  }, [urls]);

  // Track loading progress
  const { progress, active, errors } = useProgress();

  const goToBattle = () => {
    if (transitioned.current) return;
    transitioned.current = true;
    setScreen("battle");
  };

  // Transition to battle once everything is loaded (or on error/timeout)
  useEffect(() => {
    if (!preloadStarted.current) return;

    // All assets loaded successfully
    if (progress >= 100 && !active) {
      goToBattle();
      return;
    }

    // Loading stopped but with errors — transition anyway (BattleScreen has Suspense fallbacks)
    if (errors.length > 0 && !active) {
      console.warn("[PreBattleLoading] some assets failed to load:", errors);
      goToBattle();
      return;
    }

    // Safety net: if nothing is actively loading after a short delay, assets may
    // already be cached (useProgress never fires for cached three.js assets).
    const timeout = setTimeout(() => {
      if (!transitioned.current && !active) {
        goToBattle();
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [progress, active, errors, setScreen]);

  // Champion info for display
  const myTeamInfo = useMemo(
    () => myChampions.map((c) => ({ id: c.id, name: getChampion(c.id).name })),
    [myChampions],
  );
  const opponentTeamInfo = useMemo(
    () => opponentChampions.map((c) => ({ id: c.id, name: getChampion(c.id).name })),
    [opponentChampions],
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex w-full max-w-lg flex-col items-center px-6"
      >
        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 text-3xl font-bold tracking-widest text-white sm:text-4xl"
        >
          PREPARING FOR <span className="text-amber-400">BATTLE</span>
        </motion.h1>

        {/* Team columns */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-10 grid w-full grid-cols-2 gap-8 text-center"
        >
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-400/80">
              Your Team
            </h2>
            <ul className="space-y-1.5">
              {myTeamInfo.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                  className="text-sm text-gray-300"
                >
                  {c.name}
                </motion.li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-purple-400/80">
              Opponent
            </h2>
            <ul className="space-y-1.5">
              {opponentTeamInfo.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                  className="text-sm text-gray-300"
                >
                  {c.name}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.8 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="w-full"
        >
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
              animate={{
                boxShadow: [
                  "0 0 8px rgba(245,158,11,0.4)",
                  "0 0 16px rgba(168,85,247,0.5)",
                  "0 0 8px rgba(245,158,11,0.4)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <p className="mt-3 text-center text-sm text-gray-400">
            {Math.round(progress)}%
          </p>
        </motion.div>

        {/* Loading dots */}
        <div className="mt-6 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-2 w-2 rounded-full bg-amber-400"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
