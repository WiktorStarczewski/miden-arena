import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import {
  Group,
  Mesh,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  AdditiveBlending,
  MeshBasicMaterial,
  DoubleSide,
} from "three";

// TYPES
// ================================================================================================

type Element = "fire" | "water" | "earth" | "wind";

interface ElementalAuraProps {
  element: Element;
  position: [number, number, number];
  intensity?: number;
  performanceScale?: number;
}

// ELEMENT CONFIGURATIONS
// ================================================================================================

interface AuraConfig {
  color: string;
  count: number;
  speed: number;
  size: number;
  scale: [number, number, number];
  opacity: number;
  noise: number;
}

const ELEMENT_CONFIGS: Record<Element, AuraConfig> = {
  fire: {
    color: "#ff6b35",
    count: 100,
    speed: 2.2,
    size: 3.5,
    scale: [1.4, 3.0, 1.4],
    opacity: 0.9,
    noise: 1.8,
  },
  water: {
    color: "#4fc3f7",
    count: 80,
    speed: 1.0,
    size: 3,
    scale: [2.2, 1.8, 2.2],
    opacity: 0.75,
    noise: 2.2,
  },
  earth: {
    color: "#8d6e63",
    count: 60,
    speed: 0.5,
    size: 4.5,
    scale: [2.0, 1.5, 2.0],
    opacity: 0.85,
    noise: 0.6,
  },
  wind: {
    color: "#aed581",
    count: 120,
    speed: 3.5,
    size: 2.5,
    scale: [3.0, 2.5, 3.0],
    opacity: 0.65,
    noise: 3.5,
  },
};

// SECONDARY SPARKLES (inner glow layer)
// ================================================================================================

const SECONDARY_CONFIGS: Record<Element, Partial<AuraConfig>> = {
  fire: {
    color: "#ffab40",
    count: 50,
    speed: 3.0,
    size: 2.5,
    scale: [0.8, 2.2, 0.8],
  },
  water: {
    color: "#80deea",
    count: 40,
    speed: 1.5,
    size: 2,
    scale: [1.6, 1.2, 1.6],
  },
  earth: {
    color: "#bcaaa4",
    count: 30,
    speed: 0.8,
    size: 3,
    scale: [1.2, 1.0, 1.2],
  },
  wind: {
    color: "#c5e1a5",
    count: 60,
    speed: 5.0,
    size: 1.5,
    scale: [2.4, 1.8, 2.4],
  },
};

// TERTIARY SPARKLES (accent layer)
// ================================================================================================

const TERTIARY_CONFIGS: Record<Element, Partial<AuraConfig>> = {
  fire: {
    color: "#fff176",
    count: 35,
    speed: 4.0,
    size: 1.5,
    scale: [0.5, 3.5, 0.5],
    opacity: 0.5,
    noise: 2.5,
  },
  water: {
    color: "#e0f7fa",
    count: 30,
    speed: 0.6,
    size: 1.8,
    scale: [2.5, 0.6, 2.5],
    opacity: 0.4,
    noise: 1.0,
  },
  earth: {
    color: "#a1887f",
    count: 20,
    speed: 1.2,
    size: 2,
    scale: [2.5, 0.5, 2.5],
    opacity: 0.6,
    noise: 0.3,
  },
  wind: {
    color: "#dcedc8",
    count: 45,
    speed: 6.0,
    size: 1,
    scale: [1.5, 3.0, 1.5],
    opacity: 0.4,
    noise: 4.0,
  },
};

// QUATERNARY SPARKLES (outermost haze layer)
// ================================================================================================

const QUATERNARY_CONFIGS: Record<Element, Partial<AuraConfig>> = {
  fire: {
    color: "#ff8a65",
    count: 25,
    speed: 1.0,
    size: 5,
    scale: [2.0, 0.3, 2.0],
    opacity: 0.3,
    noise: 0.8,
  },
  water: {
    color: "#b3e5fc",
    count: 25,
    speed: 0.4,
    size: 4,
    scale: [3.0, 0.8, 3.0],
    opacity: 0.25,
    noise: 1.5,
  },
  earth: {
    color: "#d7ccc8",
    count: 18,
    speed: 0.3,
    size: 5,
    scale: [3.0, 0.4, 3.0],
    opacity: 0.35,
    noise: 0.2,
  },
  wind: {
    color: "#f1f8e9",
    count: 35,
    speed: 2.0,
    size: 3,
    scale: [4.0, 0.5, 4.0],
    opacity: 0.2,
    noise: 2.5,
  },
};

// ORBITING PARTICLES (custom BufferGeometry particles that orbit the champion)
// ================================================================================================

interface OrbitParticlesProps {
  element: Element;
  intensity: number;
  performanceScale: number;
}

const ORBIT_CONFIGS: Record<
  Element,
  {
    count: number;
    radius: number;
    speed: number;
    yRange: number;
    color: string;
    particleSize: number;
    wobble: number;
  }
> = {
  fire: {
    count: 18,
    radius: 0.9,
    speed: 2.5,
    yRange: 2.0,
    color: "#ff5722",
    particleSize: 3.0,
    wobble: 0.3,
  },
  water: {
    count: 14,
    radius: 1.2,
    speed: 1.0,
    yRange: 1.0,
    color: "#29b6f6",
    particleSize: 4.0,
    wobble: 0.15,
  },
  earth: {
    count: 10,
    radius: 1.0,
    speed: 0.4,
    yRange: 0.8,
    color: "#795548",
    particleSize: 5.0,
    wobble: 0.05,
  },
  wind: {
    count: 22,
    radius: 1.5,
    speed: 4.0,
    yRange: 1.8,
    color: "#8bc34a",
    particleSize: 2.5,
    wobble: 0.5,
  },
};

const OrbitParticles = React.memo(function OrbitParticles({
  element,
  intensity,
  performanceScale,
}: OrbitParticlesProps) {
  const pointsRef = useRef<Points>(null);
  const config = ORBIT_CONFIGS[element];
  const count = Math.round(config.count * intensity * performanceScale);

  const { geometry, material } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    // Initialize positions in a ring
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * config.radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * config.yRange;
      positions[i * 3 + 2] = Math.sin(angle) * config.radius;
    }
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color(config.color),
      size: config.particleSize * 0.02 * intensity,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat };
  }, [count, config, intensity]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const positions = geometry.attributes.position;
    const posArray = positions.array as Float32Array;
    const time = Date.now() * 0.001;

    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2;
      const angle = baseAngle + time * config.speed;
      const wobble = Math.sin(time * 3 + i * 1.7) * config.wobble;
      const r = config.radius + wobble;

      posArray[i * 3] = Math.cos(angle) * r;
      posArray[i * 3 + 1] =
        Math.sin(time * 1.5 + i * 0.8) * config.yRange * 0.5 +
        config.yRange * 0.5;
      posArray[i * 3 + 2] = Math.sin(angle) * r;
    }
    positions.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// GROUND GLOW RING (pulsing ring on the ground beneath the champion)
// ================================================================================================

const GROUND_RING_COLORS: Record<Element, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

const GroundGlowRing = React.memo(function GroundGlowRing({
  element,
  intensity,
}: {
  element: Element;
  intensity: number;
}) {
  const innerRingRef = useRef<Mesh>(null);
  const outerRingRef = useRef<Mesh>(null);
  const color = GROUND_RING_COLORS[element];

  useFrame(() => {
    const time = Date.now() * 0.001;
    const pulse = 0.5 + Math.sin(time * 2.0) * 0.3;
    const outerPulse = 0.5 + Math.sin(time * 1.5 + 1.0) * 0.2;

    if (innerRingRef.current) {
      const scale = (0.8 + pulse * 0.4) * intensity;
      innerRingRef.current.scale.set(scale, scale, 1);
      const mat = innerRingRef.current.material as MeshBasicMaterial;
      mat.opacity = pulse * 0.6 * intensity;
    }
    if (outerRingRef.current) {
      const scale = (1.2 + outerPulse * 0.5) * intensity;
      outerRingRef.current.scale.set(scale, scale, 1);
      const mat = outerRingRef.current.material as MeshBasicMaterial;
      mat.opacity = outerPulse * 0.3 * intensity;
    }
  });

  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Inner ring */}
      <mesh ref={innerRingRef}>
        <ringGeometry args={[0.6, 0.75, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Outer ring */}
      <mesh ref={outerRingRef}>
        <ringGeometry args={[0.9, 1.0, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Static fill disc */}
      <mesh>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.08 * intensity}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

// ELEMENT-SPECIFIC EFFECTS
// ================================================================================================

// Fire: rising ember meshes that float upward and fade
const FireEmbers = React.memo(function FireEmbers({
  intensity,
  performanceScale,
}: {
  intensity: number;
  performanceScale: number;
}) {
  const groupRef = useRef<Group>(null);
  const count = Math.round(8 * performanceScale);

  const emberData = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      offset: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.5,
      radius: 0.2 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      scale: 0.02 + Math.random() * 0.04,
    }));
  }, [count]);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.001;
    const children = groupRef.current.children;

    for (let i = 0; i < children.length; i++) {
      const data = emberData[i];
      const mesh = children[i] as Mesh;
      const t = ((time * data.speed + data.phase) % 3.0) / 3.0;

      mesh.position.x = Math.cos(data.offset + time * 0.5) * data.radius;
      mesh.position.y = t * 2.5;
      mesh.position.z = Math.sin(data.offset + time * 0.5) * data.radius;

      const fadeIn = Math.min(t * 4, 1);
      const fadeOut = 1 - Math.max((t - 0.6) / 0.4, 0);
      const opacity = fadeIn * fadeOut * intensity;

      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = opacity;

      const flicker = 1 + Math.sin(time * 10 + i * 3) * 0.3;
      mesh.scale.setScalar(data.scale * flicker * intensity);
    }
  });

  return (
    <group ref={groupRef}>
      {emberData.map((data, i) => (
        <mesh key={i} position={[0, 0, 0]}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ff9800"
            transparent
            opacity={0.8}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});

// Water: floating bubble meshes
const WaterBubbles = React.memo(function WaterBubbles({
  intensity,
  performanceScale,
}: {
  intensity: number;
  performanceScale: number;
}) {
  const groupRef = useRef<Group>(null);
  const count = Math.round(10 * performanceScale);

  const bubbleData = useMemo(() => {
    return Array.from({ length: count }, () => ({
      offset: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
      radius: 0.3 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      scale: 0.015 + Math.random() * 0.03,
    }));
  }, [count]);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.001;
    const children = groupRef.current.children;

    for (let i = 0; i < children.length; i++) {
      const data = bubbleData[i];
      const mesh = children[i] as Mesh;
      const t = ((time * data.speed + data.phase) % 4.0) / 4.0;

      mesh.position.x =
        Math.cos(data.offset + time * 0.3) * data.radius +
        Math.sin(time * 2 + i) * 0.1;
      mesh.position.y = t * 1.8 + 0.2;
      mesh.position.z = Math.sin(data.offset + time * 0.3) * data.radius;

      const fadeIn = Math.min(t * 5, 1);
      const fadeOut = 1 - Math.max((t - 0.7) / 0.3, 0);
      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = fadeIn * fadeOut * 0.5 * intensity;

      const wobble = 1 + Math.sin(time * 4 + i * 2) * 0.15;
      mesh.scale.setScalar(data.scale * wobble * intensity);
    }
  });

  return (
    <group ref={groupRef}>
      {bubbleData.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial
            color="#b3e5fc"
            transparent
            opacity={0.4}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});

// Earth: orbiting rock fragment meshes (small boxes)
const EarthFragments = React.memo(function EarthFragments({
  intensity,
  performanceScale,
}: {
  intensity: number;
  performanceScale: number;
}) {
  const groupRef = useRef<Group>(null);
  const count = Math.round(6 * performanceScale);

  const fragmentData = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      orbitAngle: (i / count) * Math.PI * 2,
      orbitRadius: 0.6 + Math.random() * 0.5,
      orbitSpeed: 0.3 + Math.random() * 0.4,
      yOffset: 0.3 + Math.random() * 1.2,
      yBob: 0.1 + Math.random() * 0.2,
      bobSpeed: 1 + Math.random() * 2,
      scale: 0.03 + Math.random() * 0.04,
      rotSpeed: 1 + Math.random() * 3,
    }));
  }, [count]);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.001;
    const children = groupRef.current.children;

    for (let i = 0; i < children.length; i++) {
      const data = fragmentData[i];
      const mesh = children[i] as Mesh;
      const angle = data.orbitAngle + time * data.orbitSpeed;

      mesh.position.x = Math.cos(angle) * data.orbitRadius;
      mesh.position.y =
        data.yOffset + Math.sin(time * data.bobSpeed) * data.yBob;
      mesh.position.z = Math.sin(angle) * data.orbitRadius;

      mesh.rotation.x = time * data.rotSpeed;
      mesh.rotation.z = time * data.rotSpeed * 0.7;
      mesh.scale.setScalar(data.scale * intensity);
    }
  });

  return (
    <group ref={groupRef}>
      {fragmentData.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[1, 0.7, 0.8]} />
          <meshBasicMaterial color="#6d4c41" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
});

// Wind: animated swirling leaf-like particles
const WindLeaves = React.memo(function WindLeaves({
  intensity,
  performanceScale,
}: {
  intensity: number;
  performanceScale: number;
}) {
  const groupRef = useRef<Group>(null);
  const count = Math.round(10 * performanceScale);

  const leafData = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      orbitAngle: (i / count) * Math.PI * 2,
      orbitRadius: 0.8 + Math.random() * 0.8,
      orbitSpeed: 2.0 + Math.random() * 2.0,
      yOffset: 0.5 + Math.random() * 1.5,
      yBob: 0.2 + Math.random() * 0.4,
      bobSpeed: 1.5 + Math.random() * 2,
      scale: 0.025 + Math.random() * 0.03,
      spinSpeed: 3 + Math.random() * 5,
    }));
  }, [count]);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.001;
    const children = groupRef.current.children;

    for (let i = 0; i < children.length; i++) {
      const data = leafData[i];
      const mesh = children[i] as Mesh;
      const angle = data.orbitAngle + time * data.orbitSpeed;
      const radiusWobble =
        data.orbitRadius + Math.sin(time * 3 + i * 2) * 0.2;

      mesh.position.x = Math.cos(angle) * radiusWobble;
      mesh.position.y =
        data.yOffset + Math.sin(time * data.bobSpeed + i) * data.yBob;
      mesh.position.z = Math.sin(angle) * radiusWobble;

      mesh.rotation.x = time * data.spinSpeed;
      mesh.rotation.y = time * data.spinSpeed * 0.6;
      mesh.scale.setScalar(data.scale * intensity);

      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = 0.6 + Math.sin(time * 2 + i) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      {leafData.map((_, i) => (
        <mesh key={i}>
          <planeGeometry args={[1, 0.5]} />
          <meshBasicMaterial
            color="#7cb342"
            transparent
            opacity={0.6}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});

// AURA GROUP (animated container)
// ================================================================================================

const AuraGroup = React.memo(function AuraGroup({
  element,
  intensity,
  children,
}: {
  element: Element;
  intensity: number;
  children: React.ReactNode;
}) {
  const groupRef = useRef<Group>(null);

  // Element-specific rotation behavior
  const rotationSpeed = useMemo(() => {
    switch (element) {
      case "fire":
        return 0.3;
      case "water":
        return 0.15;
      case "earth":
        return 0.08;
      case "wind":
        return 0.6;
    }
  }, [element]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * rotationSpeed * intensity;

    // Fire bobs up slightly
    if (element === "fire") {
      groupRef.current.position.y =
        Math.sin(Date.now() * 0.002) * 0.05 * intensity;
    }
    // Wind wobbles on x-axis
    if (element === "wind") {
      groupRef.current.rotation.x =
        Math.sin(Date.now() * 0.003) * 0.1 * intensity;
    }
  });

  return <group ref={groupRef}>{children}</group>;
});

// HELPER: apply performance scale to a sparkle count
// ================================================================================================

function scaledCount(base: number, intensity: number, perf: number): number {
  return Math.max(2, Math.round(base * intensity * perf));
}

// MAIN COMPONENT
// ================================================================================================

const ElementalAura = React.memo(function ElementalAura({
  element,
  position,
  intensity = 1.0,
  performanceScale = 1.0,
}: ElementalAuraProps) {
  const config = ELEMENT_CONFIGS[element];
  const secondary = SECONDARY_CONFIGS[element];
  const tertiary = TERTIARY_CONFIGS[element];
  const quaternary = QUATERNARY_CONFIGS[element];
  const perf = performanceScale;

  const scaledPrimary: [number, number, number] = [
    config.scale[0] * intensity,
    config.scale[1] * intensity,
    config.scale[2] * intensity,
  ];

  const scaledSecondary: [number, number, number] = [
    (secondary.scale?.[0] ?? 1) * intensity,
    (secondary.scale?.[1] ?? 1) * intensity,
    (secondary.scale?.[2] ?? 1) * intensity,
  ];

  const scaledTertiary: [number, number, number] = [
    (tertiary.scale?.[0] ?? 1) * intensity,
    (tertiary.scale?.[1] ?? 1) * intensity,
    (tertiary.scale?.[2] ?? 1) * intensity,
  ];

  const scaledQuaternary: [number, number, number] = [
    (quaternary.scale?.[0] ?? 1) * intensity,
    (quaternary.scale?.[1] ?? 1) * intensity,
    (quaternary.scale?.[2] ?? 1) * intensity,
  ];

  return (
    <group position={position}>
      <AuraGroup element={element} intensity={intensity}>
        {/* Layer 1: Primary sparkles (densest, core aura) */}
        <Sparkles
          count={scaledCount(config.count, intensity, perf)}
          speed={config.speed * intensity}
          size={config.size * intensity}
          scale={scaledPrimary}
          color={config.color}
          opacity={config.opacity}
          noise={config.noise}
        />

        {/* Layer 2: Secondary inner glow */}
        <Sparkles
          count={scaledCount(secondary.count ?? 20, intensity, perf)}
          speed={(secondary.speed ?? 1) * intensity}
          size={(secondary.size ?? 2) * intensity}
          scale={scaledSecondary}
          color={secondary.color ?? config.color}
          opacity={(config.opacity ?? 0.7) * 0.6}
          noise={config.noise * 0.5}
        />

        {/* Layer 3: Tertiary accent sparkles */}
        <Sparkles
          count={scaledCount(tertiary.count ?? 15, intensity, perf)}
          speed={(tertiary.speed ?? 1) * intensity}
          size={(tertiary.size ?? 1.5) * intensity}
          scale={scaledTertiary}
          color={tertiary.color ?? config.color}
          opacity={tertiary.opacity ?? 0.4}
          noise={tertiary.noise ?? config.noise * 0.8}
        />

        {/* Layer 4: Quaternary outermost haze */}
        <Sparkles
          count={scaledCount(quaternary.count ?? 10, intensity, perf)}
          speed={(quaternary.speed ?? 0.5) * intensity}
          size={(quaternary.size ?? 3) * intensity}
          scale={scaledQuaternary}
          color={quaternary.color ?? config.color}
          opacity={quaternary.opacity ?? 0.25}
          noise={quaternary.noise ?? 1.0}
        />

        {/* Element-specific mesh-based effects */}
        {element === "fire" && (
          <FireEmbers intensity={intensity} performanceScale={perf} />
        )}
        {element === "water" && (
          <WaterBubbles intensity={intensity} performanceScale={perf} />
        )}
        {element === "earth" && (
          <EarthFragments intensity={intensity} performanceScale={perf} />
        )}
        {element === "wind" && (
          <WindLeaves intensity={intensity} performanceScale={perf} />
        )}

        {/* Orbiting custom particles */}
        <OrbitParticles
          element={element}
          intensity={intensity}
          performanceScale={perf}
        />
      </AuraGroup>

      {/* Pulsing ground glow ring */}
      <GroundGlowRing element={element} intensity={intensity} />

      {/* Ground glow point light */}
      <pointLight
        color={config.color}
        intensity={0.8 * intensity}
        distance={4}
        decay={2}
        position={[0, 0.1, 0]}
      />

      {/* Secondary elevated light for aura illumination */}
      <pointLight
        color={secondary.color ?? config.color}
        intensity={0.3 * intensity}
        distance={2.5}
        decay={2}
        position={[0, 1.2, 0]}
      />
    </group>
  );
});

export default ElementalAura;
