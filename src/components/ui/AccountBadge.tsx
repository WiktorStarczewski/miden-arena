import React, { useState, useCallback } from "react";

interface AccountBadgeProps {
  address: string;
  label?: string;
}

function truncateAccountId(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export default function AccountBadge({ address, label }: AccountBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = address;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  return (
    <button
      onClick={handleCopy}
      className="
        inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg
        bg-white/5 border border-white/10
        hover:bg-white/10 hover:border-white/20
        active:scale-[0.97]
        transition-all duration-200
        group
      "
      title={`Click to copy: ${address}`}
    >
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
          {label}
        </span>
      )}

      <span className="font-mono text-xs text-white/70 group-hover:text-white/90 transition-colors">
        {truncateAccountId(address)}
      </span>

      {/* Copy icon / check */}
      <span className="w-4 h-4 flex items-center justify-center text-white/30 group-hover:text-white/60 transition-colors">
        {copied ? (
          <svg
            className="w-3.5 h-3.5 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
            />
          </svg>
        )}
      </span>
    </button>
  );
}
