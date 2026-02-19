import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface TimerProps {
  seconds: number;
  onExpire?: () => void;
  paused?: boolean;
}

export default function Timer({
  seconds,
  onExpire,
  paused = false,
}: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep callback ref current without causing re-renders
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Reset timer when seconds prop changes
  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  // Countdown logic
  useEffect(() => {
    if (paused || remaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          onExpireRef.current?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [paused, remaining <= 0]);

  const ratio = seconds > 0 ? remaining / seconds : 0;
  const isUrgent = remaining <= 10;
  const circumference = 2 * Math.PI * 18; // radius 18
  const offset = circumference * (1 - ratio);

  const formatTime = useCallback((s: number): string => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    return `${secs}`;
  }, []);

  return (
    <div className="relative inline-flex items-center justify-center w-12 h-12">
      {/* Background circle */}
      <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="2.5"
        />
        {/* Progress circle */}
        <motion.circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={isUrgent ? "#ef4444" : "#4fc3f7"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transition={{ duration: 0.5, ease: "linear" }}
        />
      </svg>

      {/* Urgent pulse ring */}
      {isUrgent && remaining > 0 && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-400"
          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.15, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}

      {/* Time text */}
      <span
        className={`
          relative text-sm font-bold tabular-nums
          ${isUrgent ? "text-red-400" : "text-white/80"}
        `}
      >
        {formatTime(remaining)}
      </span>
    </div>
  );
}
