import React from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ScreenTransitionProps {
  children: React.ReactNode;
  screenKey: string;
}

export default function ScreenTransition({
  children,
  screenKey,
}: ScreenTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screenKey}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{
          duration: 0.3,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
