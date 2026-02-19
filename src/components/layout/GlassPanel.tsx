import React from "react";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export default function GlassPanel({
  children,
  className = "",
  compact = false,
}: GlassPanelProps) {
  return (
    <div
      className={`
        bg-black/40 backdrop-blur-md border border-white/10 rounded-xl
        ${className}
      `}
      style={{ padding: compact ? "0.75rem" : "1.5rem" }}
    >
      {children}
    </div>
  );
}
