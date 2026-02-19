import React, { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

// TYPES
// ================================================================================================

interface PostProcessingProps {
  bloomIntensity?: number;
  vignetteEnabled?: boolean;
  hitFlash?: boolean;
}

// CONSTANTS
// ================================================================================================

const DEFAULT_BLOOM_INTENSITY = 0.8;
const HIT_FLASH_BLOOM_INTENSITY = 3.0;
const HIT_FLASH_DECAY_SPEED = 8.0;

const BLOOM_LUMINANCE_THRESHOLD = 0.6;
const BLOOM_LUMINANCE_SMOOTHING = 0.4;
const BLOOM_RADIUS = 0.85;

const VIGNETTE_OFFSET = 0.3;
const VIGNETTE_DARKNESS = 0.7;

// LOW QUALITY FALLBACK SETTINGS
const LOW_BLOOM_RADIUS = 0.5;
const LOW_BLOOM_LUMINANCE_THRESHOLD = 0.8;

// HIT FLASH CONTROLLER
// ================================================================================================

function useHitFlashIntensity(
  baseIntensity: number,
  hitFlash: boolean
): number {
  const currentIntensity = useRef(baseIntensity);
  const targetIntensity = useRef(baseIntensity);

  useEffect(() => {
    if (hitFlash) {
      targetIntensity.current = HIT_FLASH_BLOOM_INTENSITY;
      currentIntensity.current = HIT_FLASH_BLOOM_INTENSITY;
    } else {
      targetIntensity.current = baseIntensity;
    }
  }, [hitFlash, baseIntensity]);

  useFrame((_, delta) => {
    if (currentIntensity.current > targetIntensity.current) {
      currentIntensity.current = Math.max(
        targetIntensity.current,
        currentIntensity.current - delta * HIT_FLASH_DECAY_SPEED
      );
    }
  });

  return currentIntensity.current;
}

// MAIN COMPONENT
// ================================================================================================

const PostProcessing = React.memo(function PostProcessing({
  bloomIntensity = DEFAULT_BLOOM_INTENSITY,
  vignetteEnabled = true,
  hitFlash = false,
}: PostProcessingProps) {
  const [performanceLevel, setPerformanceLevel] = useState<
    "high" | "low"
  >("high");

  // Track performance via a simple FPS check
  const frameTimesRef = useRef<number[]>([]);
  const lastCheckRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    frameTimesRef.current.push(now);

    // Check every 2 seconds
    if (now - lastCheckRef.current > 2000) {
      lastCheckRef.current = now;
      const recentFrames = frameTimesRef.current.filter(
        (t) => now - t < 2000
      );
      frameTimesRef.current = recentFrames;
      const fps = recentFrames.length / 2;

      if (fps < 25 && performanceLevel === "high") {
        setPerformanceLevel("low");
      } else if (fps > 45 && performanceLevel === "low") {
        setPerformanceLevel("high");
      }
    }
  });

  const actualBloomIntensity = useHitFlashIntensity(
    bloomIntensity,
    hitFlash
  );

  const isHighQuality = performanceLevel === "high";
  const bloomRadius = isHighQuality ? BLOOM_RADIUS : LOW_BLOOM_RADIUS;
  const bloomThreshold = isHighQuality
    ? BLOOM_LUMINANCE_THRESHOLD
    : LOW_BLOOM_LUMINANCE_THRESHOLD;

  // On very low performance, disable post-processing entirely
  if (performanceLevel === "low" && !hitFlash) {
    return null;
  }

  if (vignetteEnabled) {
    return (
      <EffectComposer multisampling={isHighQuality ? 4 : 0}>
        <Bloom
          intensity={actualBloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={BLOOM_LUMINANCE_SMOOTHING}
          radius={bloomRadius}
          mipmapBlur={isHighQuality}
        />
        <Vignette
          offset={VIGNETTE_OFFSET}
          darkness={VIGNETTE_DARKNESS}
        />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={isHighQuality ? 4 : 0}>
      <Bloom
        intensity={actualBloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={BLOOM_LUMINANCE_SMOOTHING}
        radius={bloomRadius}
        mipmapBlur={isHighQuality}
      />
    </EffectComposer>
  );
});

export default PostProcessing;
