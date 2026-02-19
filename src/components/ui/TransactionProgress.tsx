import React from "react";
import { motion } from "framer-motion";

type TxStage =
  | "idle"
  | "executing"
  | "proving"
  | "submitting"
  | "complete"
  | "error";

interface TransactionProgressProps {
  stage: TxStage;
  error?: string;
}

interface StepDef {
  key: TxStage;
  label: string;
}

const STEPS: StepDef[] = [
  { key: "executing", label: "Execute" },
  { key: "proving", label: "Prove" },
  { key: "submitting", label: "Submit" },
  { key: "complete", label: "Done" },
];

function getStepState(
  stepKey: TxStage,
  currentStage: TxStage
): "pending" | "active" | "completed" {
  const order: TxStage[] = ["idle", "executing", "proving", "submitting", "complete"];
  const stepIdx = order.indexOf(stepKey);
  const currentIdx = order.indexOf(currentStage);

  if (currentStage === "error") {
    // On error, mark everything up to the last active step as appropriate
    return "pending";
  }
  if (currentIdx > stepIdx) return "completed";
  if (currentIdx === stepIdx) return "active";
  return "pending";
}

export default function TransactionProgress({
  stage,
  error,
}: TransactionProgressProps) {
  if (stage === "idle") return null;

  return (
    <div className="w-full">
      {/* Progress steps */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const state = getStepState(step.key, stage);
          const isError = stage === "error" && state === "active";

          return (
            <React.Fragment key={step.key}>
              {/* Step indicator */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="relative flex items-center justify-center">
                  {/* Circle */}
                  <div
                    className={`
                      w-6 h-6 rounded-full flex items-center justify-center
                      border-2 transition-colors duration-300
                      ${
                        state === "completed"
                          ? "bg-emerald-500/20 border-emerald-400"
                          : state === "active" && !isError
                            ? "bg-sky-500/20 border-sky-400"
                            : isError
                              ? "bg-red-500/20 border-red-400"
                              : "bg-white/5 border-white/20"
                      }
                    `}
                  >
                    {state === "completed" ? (
                      <svg
                        className="w-3 h-3 text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : state === "active" && !isError ? (
                      <motion.div
                        className="w-2 h-2 rounded-full bg-sky-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    ) : isError ? (
                      <span className="text-red-400 text-xs font-bold">!</span>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </div>

                {/* Label */}
                <span
                  className={`
                    text-[9px] uppercase tracking-wider font-medium
                    ${
                      state === "completed"
                        ? "text-emerald-400/80"
                        : state === "active"
                          ? isError
                            ? "text-red-400"
                            : "text-sky-400"
                          : "text-white/30"
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-shrink-0 w-6 h-[2px] -mt-4 rounded-full overflow-hidden bg-white/10">
                  <motion.div
                    className={`h-full rounded-full ${
                      getStepState(STEPS[i + 1].key, stage) !== "pending"
                        ? "bg-emerald-400"
                        : state === "active" || state === "completed"
                          ? "bg-sky-400"
                          : "bg-transparent"
                    }`}
                    initial={{ width: "0%" }}
                    animate={{
                      width:
                        getStepState(step.key, stage) === "completed"
                          ? "100%"
                          : state === "active"
                            ? "50%"
                            : "0%",
                    }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Error message */}
      {stage === "error" && error && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
