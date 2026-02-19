import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import {
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  Color,
  AdditiveBlending,
} from "three";

// TYPES
// ================================================================================================

interface AmbientParticlesProps {
  performanceScale?: number;
}

// FLOATING LIGHT ORBS (larger, slow-moving glowing spheres)
// ================================================================================================

interface FloatingOrbsProps {
  count: number;
}

const FloatingOrbs = React.memo(function FloatingOrbs({
  count,
}: FloatingOrbsProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, orbData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data: {
      baseX: number;
      baseY: number;
      baseZ: number;
      driftSpeedX: number;
      driftSpeedY: number;
      driftSpeedZ: number;
      driftRadius: number;
      phase: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const bx = (Math.random() - 0.5) * 12;
      const by = 0.8 + Math.random() * 3.0;
      const bz = (Math.random() - 0.5) * 8;

      positions[i * 3] = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      data.push({
        baseX: bx,
        baseY: by,
        baseZ: bz,
        driftSpeedX: 0.1 + Math.random() * 0.3,
        driftSpeedY: 0.05 + Math.random() * 0.15,
        driftSpeedZ: 0.1 + Math.random() * 0.25,
        driftRadius: 0.3 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#aaaaff"),
      size: 0.06,
      transparent: true,
      opacity: 0.15,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, orbData: data };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.001;

    for (let i = 0; i < count; i++) {
      const d = orbData[i];
      posArray[i * 3] =
        d.baseX +
        Math.sin(time * d.driftSpeedX + d.phase) * d.driftRadius;
      posArray[i * 3 + 1] =
        d.baseY +
        Math.sin(time * d.driftSpeedY + d.phase * 1.7) * d.driftRadius * 0.5;
      posArray[i * 3 + 2] =
        d.baseZ +
        Math.cos(time * d.driftSpeedZ + d.phase * 0.8) * d.driftRadius;
    }
    posAttr.needsUpdate = true;

    // Gentle brightness pulse
    material.opacity = 0.12 + Math.sin(time * 0.5) * 0.04;
    material.size = 0.05 + Math.sin(time * 0.8) * 0.015;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// CATCHING-LIGHT DUST (very small particles that flash briefly when they "catch" light)
// ================================================================================================

interface CatchingDustProps {
  count: number;
}

const CatchingDust = React.memo(function CatchingDust({
  count,
}: CatchingDustProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, dustData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data: {
      x: number;
      y: number;
      z: number;
      flashPhase: number;
      flashRate: number;
      driftX: number;
      driftZ: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 16;
      const y = 0.3 + Math.random() * 4.5;
      const z = (Math.random() - 0.5) * 12;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      data.push({
        x,
        y,
        z,
        flashPhase: Math.random() * Math.PI * 2,
        flashRate: 0.3 + Math.random() * 1.5,
        driftX: (Math.random() - 0.5) * 0.001,
        driftZ: (Math.random() - 0.5) * 0.001,
      });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#ffffcc"),
      size: 0.008,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, dustData: data };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.001;

    let maxBrightness = 0;
    for (let i = 0; i < count; i++) {
      const d = dustData[i];
      // Slow drift
      posArray[i * 3] += d.driftX;
      posArray[i * 3 + 1] += Math.sin(time * 0.3 + d.flashPhase) * 0.0001;
      posArray[i * 3 + 2] += d.driftZ;

      // Wrap around
      if (posArray[i * 3] > 8) posArray[i * 3] = -8;
      if (posArray[i * 3] < -8) posArray[i * 3] = 8;
      if (posArray[i * 3 + 2] > 6) posArray[i * 3 + 2] = -6;
      if (posArray[i * 3 + 2] < -6) posArray[i * 3 + 2] = 6;

      // Calculate flash intensity for this particle
      const flashValue = Math.sin(time * d.flashRate + d.flashPhase);
      // Only flash when sine is above a high threshold (brief flash)
      const brightness = Math.max(0, (flashValue - 0.9) * 10);
      maxBrightness = Math.max(maxBrightness, brightness);
    }
    posAttr.needsUpdate = true;

    // Use the max brightness of any particle as the global opacity
    // This creates a twinkling effect
    material.opacity = maxBrightness * 0.5;
    material.size = 0.008 + maxBrightness * 0.01;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// BACKGROUND ENERGY WISPS (colored streaks that slowly traverse the scene)
// ================================================================================================

interface BackgroundWispsProps {
  count: number;
}

const BackgroundWisps = React.memo(function BackgroundWisps({
  count,
}: BackgroundWispsProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, wispData } = useMemo(() => {
    const geo = new BufferGeometry();
    // Each wisp is represented by a cluster of points forming a short trail
    const trailLength = 5;
    const totalPoints = count * trailLength;
    const positions = new Float32Array(totalPoints * 3);
    const data: {
      centerX: number;
      centerY: number;
      centerZ: number;
      orbitRadius: number;
      speed: number;
      phase: number;
      yOscSpeed: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const cx = (Math.random() - 0.5) * 10;
      const cy = 1 + Math.random() * 2.5;
      const cz = (Math.random() - 0.5) * 8;
      const orbitRadius = 1 + Math.random() * 3;

      const d = {
        centerX: cx,
        centerY: cy,
        centerZ: cz,
        orbitRadius,
        speed: 0.15 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        yOscSpeed: 0.3 + Math.random() * 0.5,
      };
      data.push(d);

      // Initialize trail positions
      for (let j = 0; j < trailLength; j++) {
        const idx = (i * trailLength + j) * 3;
        positions[idx] = cx;
        positions[idx + 1] = cy;
        positions[idx + 2] = cz;
      }
    }

    geo.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3)
    );

    const mat = new PointsMaterial({
      color: new Color("#7755bb"),
      size: 0.025,
      transparent: true,
      opacity: 0.1,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, wispData: data };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.001;
    const trailLength = 5;

    for (let i = 0; i < count; i++) {
      const d = wispData[i];

      for (let j = 0; j < trailLength; j++) {
        const trailDelay = j * 0.15;
        const t = time - trailDelay;
        const angle = d.phase + t * d.speed;
        const idx = (i * trailLength + j) * 3;

        posArray[idx] =
          d.centerX + Math.cos(angle) * d.orbitRadius;
        posArray[idx + 1] =
          d.centerY + Math.sin(t * d.yOscSpeed) * 0.5;
        posArray[idx + 2] =
          d.centerZ + Math.sin(angle) * d.orbitRadius;
      }
    }
    posAttr.needsUpdate = true;

    material.opacity = 0.08 + Math.sin(time * 0.7) * 0.03;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// MAIN COMPONENT
// ================================================================================================

const AmbientParticles = React.memo(function AmbientParticles({
  performanceScale = 1.0,
}: AmbientParticlesProps) {
  const orbCount = Math.round(15 * performanceScale);
  const dustCount = Math.round(40 * performanceScale);
  const wispCount = Math.round(8 * performanceScale);

  return (
    <group>
      {/* Floating orbs of light that drift slowly */}
      <FloatingOrbs count={orbCount} />

      {/* Tiny dust motes that flash briefly when they catch the light */}
      <CatchingDust count={dustCount} />

      {/* Background energy wisps with subtle trails */}
      <BackgroundWisps count={wispCount} />

      {/* Broad low-intensity sparkle field for general magical ambiance */}
      <Sparkles
        count={Math.round(20 * performanceScale)}
        speed={0.15}
        size={1}
        color="#8877cc"
        scale={[12, 4, 8]}
        opacity={0.08}
        noise={0.5}
      />

      {/* Secondary warm sparkle layer */}
      <Sparkles
        count={Math.round(12 * performanceScale)}
        speed={0.1}
        size={1.5}
        color="#aa8855"
        scale={[10, 3, 7]}
        opacity={0.05}
        noise={0.8}
      />
    </group>
  );
});

export default AmbientParticles;
