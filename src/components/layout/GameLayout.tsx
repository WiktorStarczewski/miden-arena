import React from "react";
import { useAccount } from "@miden-sdk/react";
import { useGameStore } from "../../store/gameStore";
import { formatMiden } from "../../utils/formatting";
import GlassPanel from "./GlassPanel";

interface GameLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

function BalanceDisplay() {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const { assets, isLoading } = useAccount(sessionWalletId ?? undefined);

  if (!sessionWalletId) return null;

  // Sum all fungible asset balances (session wallet should only hold MIDEN)
  const totalBalance = assets.reduce((sum, a) => sum + a.amount, 0n);

  return (
    <span className="text-xs font-medium text-amber-400/80">
      {isLoading ? "..." : formatMiden(totalBalance).slice(0, formatMiden(totalBalance).indexOf('.') + 3)} MIDEN
    </span>
  );
}

export default function GameLayout({
  children,
  title,
  showBackButton = false,
  onBack,
}: GameLayoutProps) {
  return (
    <div className="h-screen bg-[#0a0a1a] text-[#e0e0e0] flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="sticky top-0 z-50 px-3 pt-3">
        <GlassPanel compact className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <button
                onClick={onBack}
                className="
                  flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer
                  bg-white/5 hover:bg-white/10 active:bg-white/15
                  border border-white/10 transition-colors
                "
                aria-label="Go back"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            {title && (
              <h1 className="font-display text-lg font-bold tracking-wide uppercase text-white/90">
                {title}
              </h1>
            )}
          </div>

          {/* Balance + Sync status */}
          <div className="flex items-center gap-3">
            <BalanceDisplay />
            <span className="text-xs text-white/40">Miden Arena</span>
            <div className="relative flex items-center justify-center w-3 h-3">
              <div className="absolute w-3 h-3 rounded-full bg-emerald-400/30 animate-ping" />
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          </div>
        </GlassPanel>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col px-3 py-3 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
