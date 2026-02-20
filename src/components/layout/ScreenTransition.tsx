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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.25,
          ease: "easeOut",
        }}
        className="w-full h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
