// react import removed — JSX transform handles it
import { motion, AnimatePresence } from "framer-motion";

interface DamageNumberProps {
  value: number;
  type: "damage" | "heal" | "burn";
  position?: { x: number; y: number };
}

const TYPE_STYLES: Record<
  DamageNumberProps["type"],
  { color: string; prefix: string; shadow: string }
> = {
  damage: {
    color: "#ef4444",
    prefix: "-",
    shadow: "0 0 12px rgba(239, 68, 68, 0.6), 0 0 24px rgba(239, 68, 68, 0.3)",
  },
  heal: {
    color: "#4ade80",
    prefix: "+",
    shadow: "0 0 12px rgba(74, 222, 128, 0.6), 0 0 24px rgba(74, 222, 128, 0.3)",
  },
  burn: {
    color: "#fb923c",
    prefix: "-",
    shadow: "0 0 12px rgba(251, 146, 60, 0.6), 0 0 24px rgba(251, 146, 60, 0.3)",
  },
};

export default function DamageNumber({
  value,
  type,
  position,
}: DamageNumberProps) {
  const style = TYPE_STYLES[type];

  // Generate a unique key from value + timestamp to allow re-triggering
  const key = `${type}-${value}-${Date.now()}`;

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        initial={{
          opacity: 1,
          y: 0,
          scale: 0.5,
        }}
        animate={{
          opacity: [1, 1, 0],
          y: -80,
          scale: [0.5, 1.3, 1],
        }}
        exit={{
          opacity: 0,
        }}
        transition={{
          duration: 1.5,
          ease: "easeOut",
          scale: {
            duration: 0.4,
            times: [0, 0.5, 1],
          },
          opacity: {
            duration: 1.5,
            times: [0, 0.7, 1],
          },
        }}
        className="pointer-events-none select-none absolute z-50"
        style={{
          left: position?.x ?? "50%",
          top: position?.y ?? "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <span
          className="text-4xl font-black tracking-tight"
          style={{
            color: style.color,
            textShadow: style.shadow,
            WebkitTextStroke: "1px rgba(0,0,0,0.3)",
          }}
        >
          {style.prefix}
          {value}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
