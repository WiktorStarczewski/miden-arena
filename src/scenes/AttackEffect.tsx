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

const TRAVEL_DURATION = 0.45; // seconds
const IMPACT_DURATION = 0.6; // seconds (extended for more dramatic impact)
const LINGER_DURATION = 1.0; // seconds for lingering particles
const PROJECTILE_BASE_SIZE = 0.2;
const IMPACT_MAX_SCALE = 3.5;
const SHOCKWAVE_MAX_SCALE = 5.0;
const TRAIL_SEGMENT_COUNT = 12;

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
        const fadeOpacity = (1 - t) * opacity * 0.8;
        const scale = (1 - t * 0.7) * 0.08;
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
      {/* Core flame */}
      <mesh>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Surrounding flame lobes */}
      {[0, 1.2, 2.4, 3.6, 4.8].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * 0.5,
            Math.sin(angle) * 0.5,
            (i % 2 === 0 ? 0.3 : -0.3),
          ]}
          scale={0.6}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ffab40"
            transparent
            opacity={0.8}
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
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const time = Date.now() * 0.003;
    meshRef.current.rotation.z = time * 2;
    const waveScale = 1 + Math.sin(time * 8) * 0.15;
    meshRef.current.scale.set(
      scale * 1.5 * waveScale,
      scale * 0.6,
      scale * 0.8
    );
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* Trailing water droplets */}
      {[0.3, 0.6, 0.9].map((offset, i) => (
        <mesh key={i} position={[0, 0, offset]} scale={scale * (0.4 - i * 0.1)}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#80deea"
            transparent
            opacity={0.5 - i * 0.1}
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
      {/* Central boulder */}
      <mesh>
        <boxGeometry args={[1.5, 1.2, 1.3]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      {/* Orbiting rock chunks */}
      {[0, 1.5, 3.0, 4.5].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * 0.8,
            Math.sin(angle) * 0.6,
            (i % 2 === 0 ? 0.4 : -0.4),
          ]}
          scale={0.4}
        >
          <boxGeometry args={[1, 0.8, 0.9]} />
          <meshBasicMaterial
            color="#a1887f"
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
    groupRef.current.rotation.z = time * 8; // fast spin
  });

  return (
    <group ref={groupRef} scale={scale}>
      {/* Spinning blade arms */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i / 4) * Math.PI * 2) * 0.7,
            Math.sin((i / 4) * Math.PI * 2) * 0.7,
            0,
          ]}
          scale={[0.8, 0.15, 0.3]}
          rotation={[0, 0, (i / 4) * Math.PI * 2]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
      {/* Center vortex */}
      <mesh scale={0.4}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#dcedc8"
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
});

const ElementProjectile = React.memo(function ElementProjectile({
  element,
  color,
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
        <mesh scale={scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
          />
        </mesh>
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
}

const ImpactDebris = React.memo(function ImpactDebris({
  position,
  color,
  progress,
  count,
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

      // Random outward velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 1.5 + Math.random() * 3;
      vels.push(
        new Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed * 0.6 + 1.0,
          Math.sin(phi) * Math.sin(theta) * speed
        )
      );
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color(color),
      size: 0.06,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, velocities: vels };
  }, [count, color]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      posArray[i * 3] = velocities[i].x * progress;
      posArray[i * 3 + 1] =
        velocities[i].y * progress - 2.0 * progress * progress; // gravity
      posArray[i * 3 + 2] = velocities[i].z * progress;
    }
    posAttr.needsUpdate = true;

    // Fade out
    material.opacity = Math.max(0, 1 - progress * 1.2);
    material.size = 0.06 * (1 - progress * 0.5);
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
    const opacity = Math.max(0, 1 - progress * 1.5);

    if (innerRef.current) {
      innerRef.current.scale.set(scale, scale, 1);
      const mat = innerRef.current.material as MeshBasicMaterial;
      mat.opacity = opacity * 0.7;
    }
    if (outerRef.current) {
      const outerScale = scale * 1.3;
      outerRef.current.scale.set(outerScale, outerScale, 1);
      const mat = outerRef.current.material as MeshBasicMaterial;
      mat.opacity = opacity * 0.3;
    }
  });

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={innerRef}>
        <ringGeometry args={[0.7, 1.0, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
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
          opacity={0.3}
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
      const delay = i * 0.15;
      const localProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
      const scale = localProgress * (2.0 + i * 0.8);
      ref.current.scale.set(scale, scale, 1);
      const mat = ref.current.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - localProgress) * 0.6);
    });
  });

  return (
    <group position={position}>
      {/* Horizontal expanding rings */}
      <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.6, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.65, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Vertical expanding ring */}
      <mesh ref={ring3Ref}>
        <ringGeometry args={[0.3, 0.5, 24]} />
        <meshBasicMaterial
          color={color}
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
    // Very fast expand and fade in first 30% of impact
    const localT = Math.min(1, progress / 0.3);
    const scale = localT * 1.5;
    meshRef.current.scale.setScalar(scale);
    const mat = meshRef.current.material as MeshBasicMaterial;
    mat.opacity = Math.max(0, (1 - localT) * 0.9);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.9}
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
    const count = 30;
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels: Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.8;
      vels.push(
        new Vector3(
          Math.cos(theta) * speed,
          0.5 + Math.random() * 1.0,
          Math.sin(theta) * speed
        )
      );
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color(color),
      size: 0.04,
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
    material.size = 0.04 * (1 - t * 0.6);
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

  // Trail positions stored in a ref for real-time updates
  const trailPositions = useRef<Vector3[]>([]);

  // Raise the arc midpoint for a parabolic trajectory
  const midpoint = useMemo(() => {
    const mid = new Vector3().lerpVectors(startVec, endVec, 0.5);
    mid.y += 1.5;
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

  // Call onComplete when done
  useEffect(() => {
    if (phase === "done" && onComplete) {
      onComplete();
    }
  }, [phase, onComplete]);

  // Trigger camera shake on impact
  useEffect(() => {
    if (phase === "impact" && cameraShakeCallback) {
      cameraShakeCallback({ intensity: 0.15, duration: 0.3 });
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

      // Move projectile along bezier curve
      if (projectileRef.current) {
        const pos = getPositionOnCurve(progressRef.current);
        projectileRef.current.position.copy(pos);

        // Pulsate size during travel
        const pulse =
          1 + Math.sin(progressRef.current * Math.PI * 6) * 0.3;
        const travelScale = PROJECTILE_BASE_SIZE * pulse;
        projectileRef.current.scale.setScalar(travelScale);

        // Update trail positions
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

      // Expand and fade impact sphere
      if (impactRef.current) {
        const t = impactProgressRef.current;
        const scale = PROJECTILE_BASE_SIZE + t * IMPACT_MAX_SCALE;
        impactRef.current.scale.setScalar(scale);

        const mat = impactRef.current.material as MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - t * 1.5);
      }
    }
  });

  if (phase === "done") return null;

  return (
    <group ref={groupRef}>
      {/* Traveling projectile */}
      {phase === "travel" && (
        <>
          <group ref={projectileRef} position={from}>
            {/* Element-specific projectile shape */}
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
            opacity={0.8}
          />

          {/* Trail sparkles that follow the projectile */}
          <group
            position={
              trailPositions.current.length > 0
                ? trailPositions.current[trailPositions.current.length - 1]
                    .toArray() as [number, number, number]
                : from
            }
          >
            <Sparkles
              count={20}
              speed={3}
              size={4}
              color={color}
              scale={[0.6, 0.6, 0.6]}
              opacity={0.7}
              noise={2}
            />
            <Sparkles
              count={10}
              speed={5}
              size={2}
              color={secondaryColor}
              scale={[0.4, 0.4, 0.4]}
              opacity={0.5}
              noise={1}
            />
          </group>

          {/* Point light on projectile for glow */}
          <pointLight
            color={color}
            intensity={3}
            distance={4}
            decay={2}
            position={
              trailPositions.current.length > 0
                ? trailPositions.current[trailPositions.current.length - 1]
                    .toArray() as [number, number, number]
                : from
            }
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

          {/* Debris particles flying outward */}
          <ImpactDebris
            position={[0, 0, 0]}
            color={color}
            progress={impactProgressRef.current}
            count={40}
          />
          <ImpactDebris
            position={[0, 0, 0]}
            color={secondaryColor}
            progress={impactProgressRef.current * 0.8}
            count={25}
          />

          {/* Dense impact sparkles - layer 1 */}
          <Sparkles
            count={40}
            speed={6}
            size={5}
            color={color}
            scale={[2.0, 2.0, 2.0]}
            opacity={0.9}
            noise={4}
          />

          {/* Dense impact sparkles - layer 2 */}
          <Sparkles
            count={25}
            speed={4}
            size={3}
            color={secondaryColor}
            scale={[2.5, 2.5, 2.5]}
            opacity={0.6}
            noise={3}
          />

          {/* Flash sparkles - bright and fast */}
          <Sparkles
            count={15}
            speed={8}
            size={6}
            color={flashColor}
            scale={[1.0, 1.0, 1.0]}
            opacity={0.8}
            noise={5}
          />

          {/* Impact glow lights */}
          <pointLight
            color={color}
            intensity={6 * (1 - impactProgressRef.current)}
            distance={8}
            decay={2}
          />
          <pointLight
            color={flashColor}
            intensity={3 * Math.max(0, 1 - impactProgressRef.current * 2)}
            distance={5}
            decay={2}
            position={[0, 0.5, 0]}
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
