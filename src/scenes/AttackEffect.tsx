import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import {
  Group,
  Mesh,
  Color,
  Vector3,
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

interface AttackEffectProps {
  from: [number, number, number];
  to: [number, number, number];
  element: string;
  onComplete?: () => void;
}

export interface CameraShakeConfig {
  intensity: number;
  duration: number;
}

// CONSTANTS
// ================================================================================================

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

const ELEMENT_SECONDARY_COLORS: Record<string, string> = {
  fire: "#ffab40",
  water: "#80deea",
  earth: "#bcaaa4",
  wind: "#c5e1a5",
};

const ELEMENT_FLASH_COLORS: Record<string, string> = {
  fire: "#fff176",
  water: "#e0f7fa",
  earth: "#d7ccc8",
  wind: "#f1f8e9",
};

const TRAVEL_DURATION = 0.40;
const IMPACT_DURATION = 0.55;
const LINGER_DURATION = 0.8;
const PROJECTILE_BASE_SIZE = 0.35;
const IMPACT_MAX_SCALE = 5.0;
const SHOCKWAVE_MAX_SCALE = 7.0;
const TRAIL_SEGMENT_COUNT = 18;

// CAMERA SHAKE HOOK
// ================================================================================================

let cameraShakeCallback: ((config: CameraShakeConfig) => void) | null = null;

export function useCameraShake(): (config: CameraShakeConfig) => void {
  const trigger = useCallback((config: CameraShakeConfig) => {
    if (cameraShakeCallback) {
      cameraShakeCallback(config);
    }
  }, []);
  return trigger;
}

export function registerCameraShake(
  cb: (config: CameraShakeConfig) => void
): void {
  cameraShakeCallback = cb;
}

export function unregisterCameraShake(): void {
  cameraShakeCallback = null;
}

export function triggerCameraShake(config: CameraShakeConfig): void {
  if (cameraShakeCallback) {
    cameraShakeCallback(config);
  }
}

// TRAIL PARTICLES (mesh-based trail segments behind the projectile)
// ================================================================================================

interface TrailProps {
  positions: Vector3[];
  color: string;
  secondaryColor: string;
  opacity: number;
}

const Trail = React.memo(function Trail({
  positions,
  color,
  secondaryColor,
  opacity,
}: TrailProps) {
  return (
    <group>
      {positions.map((pos, i) => {
        const t = i / positions.length;
        const fadeOpacity = (1 - t) * opacity * 0.85;
        const scale = (1 - t * 0.6) * 0.12;
        return (
          <mesh key={i} position={pos} scale={scale}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? color : secondaryColor}
              transparent
              opacity={fadeOpacity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
});

// ELEMENT-SPECIFIC PROJECTILE SHAPES
// ================================================================================================

interface ProjectileShapeProps {
  element: string;
  color: Color;
  secondaryColor: string;
  scale: number;
}

const FireProjectile = React.memo(function FireProjectile({
  color,
  scale,
}: {
  color: Color;
  scale: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.005;
    groupRef.current.rotation.x = time * 3;
    groupRef.current.rotation.z = time * 2;
  });

  return (
    <group ref={groupRef} scale={scale}>
      {/* Bright inner core */}
      <mesh>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#fff176"
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Main fireball body */}
      <mesh scale={1.4}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Outer corona */}
      <mesh scale={1.9}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#ffab40"
          transparent
          opacity={0.35}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Flame tongues erupting outward */}
      {[0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * 0.7,
            Math.sin(angle) * 0.7,
            (i % 3 === 0 ? 0.4 : i % 3 === 1 ? -0.3 : 0.1),
          ]}
          scale={0.55 + (i % 2) * 0.2}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#ff6b35" : "#ffab40"}
            transparent
            opacity={0.75}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
});

const WaterProjectile = React.memo(function WaterProjectile({
  color,
  scale,
}: {
  color: Color;
  scale: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.003;
    groupRef.current.rotation.z = time * 2;
    const waveScale = 1 + Math.sin(time * 8) * 0.12;
    groupRef.current.scale.set(
      scale * 1.8 * waveScale,
      scale * 0.9,
      scale * 1.1
    );
  });

  return (
    <group ref={groupRef}>
      {/* Bright inner core */}
      <mesh>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshBasicMaterial
          color="#e0f7fa"
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Main water body */}
      <mesh>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Outer splash halo */}
      <mesh scale={1.5}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color="#80deea"
          transparent
          opacity={0.3}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Trailing water droplets */}
      {[0.4, 0.7, 1.0, 1.3].map((offset, i) => (
        <mesh key={i} position={[0, (i % 2 === 0 ? 0.15 : -0.15), offset]} scale={0.35 - i * 0.06}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#80deea"
            transparent
            opacity={0.55 - i * 0.1}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
});

const EarthProjectile = React.memo(function EarthProjectile({
  color,
  scale,
}: {
  color: Color;
  scale: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.004;
    groupRef.current.rotation.x = time * 2;
    groupRef.current.rotation.y = time * 1.5;
  });

  return (
    <group ref={groupRef} scale={scale}>
      {/* Central massive boulder */}
      <mesh>
        <dodecahedronGeometry args={[1.2, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      {/* Rocky crust layer */}
      <mesh scale={1.35}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color="#a1887f"
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* Orbiting rock chunks */}
      {[0, 1.0, 2.1, 3.1, 4.2, 5.2].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * 1.0,
            Math.sin(angle) * 0.8,
            (i % 2 === 0 ? 0.5 : -0.5),
          ]}
          scale={0.3 + (i % 3) * 0.1}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#8d6e63" : "#a1887f"}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
});

const WindProjectile = React.memo(function WindProjectile({
  color,
  scale,
}: {
  color: Color;
  scale: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const time = Date.now() * 0.003;
    groupRef.current.rotation.z = time * 10;
  });

  return (
    <group ref={groupRef} scale={scale}>
      {/* Central vortex eye */}
      <mesh scale={0.5}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color="#f1f8e9"
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Inner vortex ring */}
      <mesh scale={0.9}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Spinning blade arms */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i / 6) * Math.PI * 2) * 0.9,
            Math.sin((i / 6) * Math.PI * 2) * 0.9,
            0,
          ]}
          scale={[1.0, 0.18, 0.35]}
          rotation={[0, 0, (i / 6) * Math.PI * 2]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? color : new Color("#c5e1a5")}
            transparent
            opacity={0.75}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
      {/* Outer wispy ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={1.4}>
        <ringGeometry args={[0.6, 1.0, 24]} />
        <meshBasicMaterial
          color="#c5e1a5"
          transparent
          opacity={0.3}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

const ElementProjectile = React.memo(function ElementProjectile({
  element,
  color,
  secondaryColor,
  scale,
}: ProjectileShapeProps) {
  switch (element) {
    case "fire":
      return <FireProjectile color={color} scale={scale} />;
    case "water":
      return <WaterProjectile color={color} scale={scale} />;
    case "earth":
      return <EarthProjectile color={color} scale={scale} />;
    case "wind":
      return <WindProjectile color={color} scale={scale} />;
    default:
      return (
        <group scale={scale}>
          <mesh>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.95}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh scale={1.5}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial
              color={secondaryColor}
              transparent
              opacity={0.3}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      );
  }
});

// IMPACT DEBRIS PARTICLES (custom Points system)
// ================================================================================================

interface ImpactDebrisProps {
  position: [number, number, number];
  color: string;
  progress: number;
  count: number;
  speed?: number;
}

const ImpactDebris = React.memo(function ImpactDebris({
  position,
  color,
  progress,
  count,
  speed = 1,
}: ImpactDebrisProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, velocities } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels: Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = (1.5 + Math.random() * 3.5) * speed;
      vels.push(
        new Vector3(
          Math.sin(phi) * Math.cos(theta) * spd,
          Math.cos(phi) * spd * 0.6 + 1.5,
          Math.sin(phi) * Math.sin(theta) * spd
        )
      );
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color(color),
      size: 0.07,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, velocities: vels };
  }, [count, color, speed]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      posArray[i * 3] = velocities[i].x * progress;
      posArray[i * 3 + 1] =
        velocities[i].y * progress - 3.0 * progress * progress;
      posArray[i * 3 + 2] = velocities[i].z * progress;
    }
    posAttr.needsUpdate = true;

    material.opacity = Math.max(0, 1 - progress * 1.1);
    material.size = 0.07 * (1 - progress * 0.4);
  });

  return (
    <group position={position}>
      <points ref={pointsRef} geometry={geometry} material={material} />
    </group>
  );
});

// SHOCKWAVE RING
// ================================================================================================

interface ShockwaveProps {
  position: [number, number, number];
  color: string;
  progress: number;
}

const ShockwaveRing = React.memo(function ShockwaveRing({
  position,
  color,
  progress,
}: ShockwaveProps) {
  const innerRef = useRef<Mesh>(null);
  const outerRef = useRef<Mesh>(null);

  useFrame(() => {
    const scale = progress * SHOCKWAVE_MAX_SCALE;
    const opacity = Math.max(0, 1 - progress * 1.3);

    if (innerRef.current) {
      innerRef.current.scale.set(scale, scale, 1);
      const mat = innerRef.current.material as MeshBasicMaterial;
      mat.opacity = opacity * 0.8;
    }
    if (outerRef.current) {
      const outerScale = scale * 1.4;
      outerRef.current.scale.set(outerScale, outerScale, 1);
      const mat = outerRef.current.material as MeshBasicMaterial;
      mat.opacity = opacity * 0.35;
    }
  });

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={innerRef}>
        <ringGeometry args={[0.7, 1.0, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={outerRef}>
        <ringGeometry args={[0.85, 1.0, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

// IMPACT EXPANDING RINGS
// ================================================================================================

interface ExpandingRingsProps {
  position: [number, number, number];
  color: string;
  progress: number;
}

const ExpandingRings = React.memo(function ExpandingRings({
  position,
  color,
  progress,
}: ExpandingRingsProps) {
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  const ring3Ref = useRef<Mesh>(null);

  useFrame(() => {
    const rings = [ring1Ref, ring2Ref, ring3Ref];
    rings.forEach((ref, i) => {
      if (!ref.current) return;
      const delay = i * 0.12;
      const localProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
      const scale = localProgress * (2.5 + i * 1.0);
      ref.current.scale.set(scale, scale, 1);
      const mat = ref.current.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - localProgress) * 0.7);
    });
  });

  return (
    <group position={position}>
      <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.7, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.75, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Vertical expanding ring */}
      <mesh ref={ring3Ref}>
        <ringGeometry args={[0.3, 0.6, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

// IMPACT FLASH (bright sphere that rapidly expands and fades)
// ================================================================================================

const ImpactFlash = React.memo(function ImpactFlash({
  position,
  color,
  progress,
}: {
  position: [number, number, number];
  color: string;
  progress: number;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const localT = Math.min(1, progress / 0.25);
    const scale = localT * 2.2;
    meshRef.current.scale.setScalar(scale);
    const mat = meshRef.current.material as MeshBasicMaterial;
    mat.opacity = Math.max(0, (1 - localT) * 0.95);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.95}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
});

// LINGERING PARTICLES (stay at impact site and fade over time)
// ================================================================================================

interface LingeringParticlesProps {
  position: [number, number, number];
  color: string;
  active: boolean;
}

const LingeringParticles = React.memo(function LingeringParticles({
  position,
  color,
  active,
}: LingeringParticlesProps) {
  const pointsRef = useRef<Points>(null);
  const progressRef = useRef(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      progressRef.current = 0;
      setVisible(true);
    }
  }, [active]);

  const { geometry, material, velocities } = useMemo(() => {
    const count = 40;
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels: Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 1.0;
      vels.push(
        new Vector3(
          Math.cos(theta) * speed,
          0.6 + Math.random() * 1.2,
          Math.sin(theta) * speed
        )
      );
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color(color),
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, velocities: vels };
  }, [color]);

  useFrame((_, delta) => {
    if (!visible || !pointsRef.current) return;

    progressRef.current += delta / LINGER_DURATION;
    if (progressRef.current >= 1) {
      setVisible(false);
      return;
    }

    const t = progressRef.current;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const count = velocities.length;

    for (let i = 0; i < count; i++) {
      posArray[i * 3] = velocities[i].x * t * 0.5;
      posArray[i * 3 + 1] =
        velocities[i].y * t - 1.5 * t * t;
      posArray[i * 3 + 2] = velocities[i].z * t * 0.5;
    }
    posAttr.needsUpdate = true;
    material.opacity = Math.max(0, 0.8 * (1 - t));
    material.size = 0.05 * (1 - t * 0.5);
  });

  if (!visible) return null;

  return (
    <group position={position}>
      <points ref={pointsRef} geometry={geometry} material={material} />
    </group>
  );
});

// ATTACK PROJECTILE (main component)
// ================================================================================================

const AttackEffect = React.memo(function AttackEffect({
  from,
  to,
  element,
  onComplete,
}: AttackEffectProps) {
  const groupRef = useRef<Group>(null);
  const projectileRef = useRef<Group>(null);
  const impactRef = useRef<Mesh>(null);

  const [phase, setPhase] = useState<"travel" | "impact" | "linger" | "done">(
    "travel"
  );
  const progressRef = useRef(0);
  const impactProgressRef = useRef(0);

  const color = useMemo(
    () => ELEMENT_COLORS[element] ?? "#ffffff",
    [element]
  );
  const secondaryColor = useMemo(
    () => ELEMENT_SECONDARY_COLORS[element] ?? color,
    [element, color]
  );
  const flashColor = useMemo(
    () => ELEMENT_FLASH_COLORS[element] ?? "#ffffff",
    [element]
  );
  const threeColor = useMemo(() => new Color(color), [color]);

  const startVec = useMemo(() => new Vector3(...from), [from]);
  const endVec = useMemo(() => new Vector3(...to), [to]);

  const trailPositions = useRef<Vector3[]>([]);

  // Raise the arc midpoint for a parabolic trajectory
  const midpoint = useMemo(() => {
    const mid = new Vector3().lerpVectors(startVec, endVec, 0.5);
    mid.y += 1.8;
    return mid;
  }, [startVec, endVec]);

  // Quadratic bezier interpolation
  const getPositionOnCurve = useMemo(() => {
    return (t: number): Vector3 => {
      const invT = 1 - t;
      const x =
        invT * invT * startVec.x +
        2 * invT * t * midpoint.x +
        t * t * endVec.x;
      const y =
        invT * invT * startVec.y +
        2 * invT * t * midpoint.y +
        t * t * endVec.y;
      const z =
        invT * invT * startVec.z +
        2 * invT * t * midpoint.z +
        t * t * endVec.z;
      return new Vector3(x, y, z);
    };
  }, [startVec, midpoint, endVec]);

  // Call onComplete when transitioning to linger
  useEffect(() => {
    if (phase === "linger" && onComplete) {
      onComplete();
    }
  }, [phase, onComplete]);

  // Trigger camera shake on impact
  useEffect(() => {
    if (phase === "impact" && cameraShakeCallback) {
      cameraShakeCallback({ intensity: 0.25, duration: 0.5 });
    }
  }, [phase]);

  useFrame((_, delta) => {
    if (phase === "travel") {
      progressRef.current += delta / TRAVEL_DURATION;

      if (progressRef.current >= 1) {
        progressRef.current = 1;
        setPhase("impact");
        return;
      }

      if (projectileRef.current) {
        const pos = getPositionOnCurve(progressRef.current);
        projectileRef.current.position.copy(pos);

        // Pulsate size — grows as it approaches target
        const growFactor = 1 + progressRef.current * 0.4;
        const pulse =
          1 + Math.sin(progressRef.current * Math.PI * 6) * 0.2;
        const travelScale = PROJECTILE_BASE_SIZE * pulse * growFactor;
        projectileRef.current.scale.setScalar(travelScale);

        const newTrail = [...trailPositions.current, pos.clone()];
        if (newTrail.length > TRAIL_SEGMENT_COUNT) {
          newTrail.shift();
        }
        trailPositions.current = newTrail;
      }
    }

    if (phase === "impact") {
      impactProgressRef.current += delta / IMPACT_DURATION;

      if (impactProgressRef.current >= 1) {
        setPhase("linger");
        return;
      }

      if (impactRef.current) {
        const t = impactProgressRef.current;
        const scale = PROJECTILE_BASE_SIZE + t * IMPACT_MAX_SCALE;
        impactRef.current.scale.setScalar(scale);

        const mat = impactRef.current.material as MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - t * 1.4);
      }
    }
  });

  if (phase === "done") return null;

  const currentProjectilePos =
    trailPositions.current.length > 0
      ? trailPositions.current[trailPositions.current.length - 1]
          .toArray() as [number, number, number]
      : from;

  return (
    <group ref={groupRef}>
      {/* Traveling projectile */}
      {phase === "travel" && (
        <>
          <group ref={projectileRef} position={from}>
            <ElementProjectile
              element={element}
              color={threeColor}
              secondaryColor={secondaryColor}
              scale={PROJECTILE_BASE_SIZE}
            />
          </group>

          {/* Mesh-based trailing particles */}
          <Trail
            positions={trailPositions.current}
            color={color}
            secondaryColor={secondaryColor}
            opacity={0.85}
          />

          {/* Sparkle cloud around projectile */}
          <group position={currentProjectilePos}>
            <Sparkles
              count={30}
              speed={4}
              size={5}
              color={color}
              scale={[0.8, 0.8, 0.8]}
              opacity={0.8}
              noise={3}
            />
            <Sparkles
              count={15}
              speed={6}
              size={3}
              color={secondaryColor}
              scale={[0.5, 0.5, 0.5]}
              opacity={0.6}
              noise={2}
            />
            <Sparkles
              count={8}
              speed={8}
              size={7}
              color={flashColor}
              scale={[0.4, 0.4, 0.4]}
              opacity={0.5}
              noise={4}
            />
          </group>

          {/* Strong point light on projectile */}
          <pointLight
            color={color}
            intensity={6}
            distance={6}
            decay={2}
            position={currentProjectilePos}
          />
          {/* Secondary glow for more presence */}
          <pointLight
            color={flashColor}
            intensity={3}
            distance={4}
            decay={2}
            position={currentProjectilePos}
          />
        </>
      )}

      {/* Impact explosion */}
      {phase === "impact" && (
        <group position={to}>
          {/* Main expanding impact sphere */}
          <mesh ref={impactRef} scale={PROJECTILE_BASE_SIZE}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial
              color={threeColor}
              transparent
              opacity={1}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Secondary expanding sphere (element glow) */}
          <mesh scale={PROJECTILE_BASE_SIZE + impactProgressRef.current * IMPACT_MAX_SCALE * 0.7}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial
              color={secondaryColor}
              transparent
              opacity={Math.max(0, 0.6 - impactProgressRef.current * 1.2)}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Bright flash */}
          <ImpactFlash
            position={[0, 0, 0]}
            color={flashColor}
            progress={impactProgressRef.current}
          />

          {/* Expanding rings */}
          <ExpandingRings
            position={[0, 0, 0]}
            color={color}
            progress={impactProgressRef.current}
          />

          {/* Shockwave ring on the ground */}
          <ShockwaveRing
            position={[0, -to[1] + 0.05, 0]}
            color={color}
            progress={impactProgressRef.current}
          />

          {/* Heavy debris — primary burst */}
          <ImpactDebris
            position={[0, 0, 0]}
            color={color}
            progress={impactProgressRef.current}
            count={60}
            speed={1.2}
          />
          {/* Secondary debris wave */}
          <ImpactDebris
            position={[0, 0, 0]}
            color={secondaryColor}
            progress={impactProgressRef.current * 0.85}
            count={40}
          />
          {/* Fine flash sparks */}
          <ImpactDebris
            position={[0, 0, 0]}
            color={flashColor}
            progress={impactProgressRef.current * 0.7}
            count={25}
            speed={1.5}
          />

          {/* Dense impact sparkles */}
          <Sparkles
            count={50}
            speed={7}
            size={6}
            color={color}
            scale={[2.5, 2.5, 2.5]}
            opacity={0.9}
            noise={5}
          />
          <Sparkles
            count={35}
            speed={5}
            size={4}
            color={secondaryColor}
            scale={[3.0, 3.0, 3.0]}
            opacity={0.7}
            noise={4}
          />
          <Sparkles
            count={20}
            speed={9}
            size={8}
            color={flashColor}
            scale={[1.5, 1.5, 1.5]}
            opacity={0.85}
            noise={6}
          />

          {/* Intense impact glow */}
          <pointLight
            color={color}
            intensity={10 * Math.max(0, 1 - impactProgressRef.current)}
            distance={10}
            decay={2}
          />
          <pointLight
            color={flashColor}
            intensity={6 * Math.max(0, 1 - impactProgressRef.current * 1.8)}
            distance={7}
            decay={2}
            position={[0, 0.5, 0]}
          />
          {/* Ground-bounce light */}
          <pointLight
            color={secondaryColor}
            intensity={4 * Math.max(0, 1 - impactProgressRef.current * 1.5)}
            distance={6}
            decay={2}
            position={[0, -0.5, 0]}
          />
        </group>
      )}

      {/* Lingering particles at impact site */}
      <LingeringParticles
        position={to}
        color={color}
        active={phase === "linger"}
      />
    </group>
  );
});

export default AttackEffect;
