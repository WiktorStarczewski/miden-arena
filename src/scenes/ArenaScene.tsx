import React, {
  useRef,
  useState,
  useMemo,
  Suspense,
  useCallback,
  useEffect,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor, Sparkles } from "@react-three/drei";
import {
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  Color,
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
} from "three";

import ArenaEnvironment from "./ArenaEnvironment";
import AmbientParticles from "./AmbientParticles";
import ChampionModel from "./ChampionModel";
import ElementalAura from "./ElementalAura";
import AttackEffect from "./AttackEffect";
import {
  registerCameraShake,
  unregisterCameraShake,
  triggerCameraShake,
  type CameraShakeConfig,
} from "./AttackEffect";
import PostProcessing from "./PostProcessing";

// TYPES
// ================================================================================================

interface ChampionState {
  id: number;
  animation: string;
  element?: "fire" | "water" | "earth" | "wind";
}

interface AttackState {
  from: "left" | "right";
  element: string;
}

interface ArenaSceneProps {
  myChampion?: ChampionState;
  opponentChampion?: ChampionState;
  attackEffect?: AttackState;
  onAttackComplete?: () => void;
  /** Set to "left" or "right" to trigger a KO explosion at that position */
  koTarget?: "left" | "right" | null;
  /** Set to true to trigger victory celebration particles */
  showVictory?: boolean;
}

// CONSTANTS
// ================================================================================================

const LEFT_POSITION: [number, number, number] = [-2, 0, 0];
const RIGHT_POSITION: [number, number, number] = [2, 0, 0];

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

const DEFAULT_ELEMENT_COLOR = "#888888";

const CAMERA_POSITION: [number, number, number] = [0, 4, 7];
const CAMERA_LOOK_AT: [number, number, number] = [0, 0.8, 0];

// CAMERA CONTROLLER (subtle drift + screen shake)
// ================================================================================================

function CameraController() {
  const { camera } = useThree();
  const basePosition = useRef(new Vector3(...CAMERA_POSITION));
  const lookTarget = useMemo(() => new Vector3(...CAMERA_LOOK_AT), []);

  // Camera shake state
  const shakeIntensity = useRef(0);
  const shakeDuration = useRef(0);
  const shakeElapsed = useRef(0);

  // Register the camera shake callback
  useEffect(() => {
    registerCameraShake((config: CameraShakeConfig) => {
      shakeIntensity.current = config.intensity;
      shakeDuration.current = config.duration;
      shakeElapsed.current = 0;
    });
    return () => {
      unregisterCameraShake();
    };
  }, []);

  useFrame((_, delta) => {
    const time = Date.now() * 0.0003;

    // Subtle orbital drift
    const driftX = Math.sin(time) * 0.15;
    const driftY = Math.cos(time * 0.7) * 0.05;
    const driftZ = Math.cos(time * 0.5) * 0.1;

    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;

    // Camera shake
    if (shakeElapsed.current < shakeDuration.current) {
      shakeElapsed.current += delta;
      const progress = shakeElapsed.current / shakeDuration.current;
      const decay = 1 - progress; // Linear decay
      const decaySq = decay * decay; // Quadratic decay for snappier falloff
      const intensity = shakeIntensity.current * decaySq;

      // Use high-frequency noise for shake displacement
      const t = shakeElapsed.current * 40;
      shakeX = Math.sin(t * 1.0) * intensity;
      shakeY = Math.cos(t * 1.3) * intensity * 0.7;
      shakeZ = Math.sin(t * 0.9) * intensity * 0.5;
    }

    camera.position.set(
      basePosition.current.x + driftX + shakeX,
      basePosition.current.y + driftY + shakeY,
      basePosition.current.z + driftZ + shakeZ
    );

    camera.lookAt(lookTarget);
  });

  return null;
}

// KO EXPLOSION EFFECT (massive particle burst when a champion is knocked out)
// ================================================================================================

interface KoExplosionProps {
  position: [number, number, number];
  active: boolean;
}

const KO_DURATION = 1.5; // seconds
const KO_PARTICLE_COUNT = 80;

const KoExplosion = React.memo(function KoExplosion({
  position,
  active,
}: KoExplosionProps) {
  const pointsRef = useRef<Points>(null);
  const flashRef = useRef<Mesh>(null);
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  const progressRef = useRef(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      progressRef.current = 0;
      setVisible(true);
    }
  }, [active]);

  const { geometry, material, velocities } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(KO_PARTICLE_COUNT * 3);
    const vels: Vector3[] = [];

    for (let i = 0; i < KO_PARTICLE_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 5;
      vels.push(
        new Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed * 0.8 + 2.0,
          Math.sin(phi) * Math.sin(theta) * speed
        )
      );
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#ff4444"),
      size: 0.08,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, velocities: vels };
  }, []);

  useFrame((_, delta) => {
    if (!visible) return;

    progressRef.current += delta / KO_DURATION;
    if (progressRef.current >= 1) {
      setVisible(false);
      return;
    }

    const t = progressRef.current;

    // Update particle positions
    if (pointsRef.current) {
      const posAttr = geometry.attributes.position;
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < KO_PARTICLE_COUNT; i++) {
        posArray[i * 3] = velocities[i].x * t;
        posArray[i * 3 + 1] =
          velocities[i].y * t - 4.0 * t * t;
        posArray[i * 3 + 2] = velocities[i].z * t;
      }
      posAttr.needsUpdate = true;
      material.opacity = Math.max(0, 1 - t * 1.2);
      material.size = 0.08 * (1 + t * 0.5);
    }

    // Flash sphere
    if (flashRef.current) {
      const flashT = Math.min(1, t / 0.2);
      flashRef.current.scale.setScalar(flashT * 2.5);
      const mat = flashRef.current.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - flashT) * 0.95);
    }

    // Expanding rings
    if (ring1Ref.current) {
      const ringScale = t * 4.0;
      ring1Ref.current.scale.set(ringScale, ringScale, 1);
      const mat = ring1Ref.current.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - t) * 0.6);
    }
    if (ring2Ref.current) {
      const ring2T = Math.max(0, (t - 0.1) / 0.9);
      const ringScale = ring2T * 5.0;
      ring2Ref.current.scale.set(ringScale, ringScale, 1);
      const mat = ring2Ref.current.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - ring2T) * 0.4);
    }
  });

  if (!visible) return null;

  return (
    <group position={position}>
      {/* Flash sphere */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Expanding ring 1 */}
      <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 1.0, 32]} />
        <meshBasicMaterial
          color="#ff4444"
          transparent
          opacity={0.6}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Expanding ring 2 (delayed) */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.0, 32]} />
        <meshBasicMaterial
          color="#ff8844"
          transparent
          opacity={0.4}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Debris particles */}
      <points ref={pointsRef} geometry={geometry} material={material} />

      {/* Intense sparkles */}
      <Sparkles
        count={50}
        speed={5}
        size={6}
        color="#ff6644"
        scale={[2, 2, 2]}
        opacity={0.9}
        noise={5}
      />
      <Sparkles
        count={30}
        speed={3}
        size={4}
        color="#ffaa44"
        scale={[3, 3, 3]}
        opacity={0.6}
        noise={3}
      />

      {/* Bright KO light */}
      <pointLight
        color="#ff4444"
        intensity={8 * Math.max(0, 1 - progressRef.current * 2)}
        distance={10}
        decay={2}
      />
    </group>
  );
});

// VICTORY CELEBRATION (golden sparkles raining down)
// ================================================================================================

interface VictoryCelebrationProps {
  active: boolean;
}

const VICTORY_PARTICLE_COUNT = 120;

const VictoryCelebration = React.memo(function VictoryCelebration({
  active,
}: VictoryCelebrationProps) {
  const pointsRef = useRef<Points>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
    } else {
      // Allow fade out
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [active]);

  const { geometry, material, particleData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(VICTORY_PARTICLE_COUNT * 3);
    const data: {
      x: number;
      fallSpeed: number;
      wobbleSpeed: number;
      wobbleRadius: number;
      phase: number;
      startY: number;
    }[] = [];

    for (let i = 0; i < VICTORY_PARTICLE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 10;
      const startY = 5 + Math.random() * 3;

      positions[i * 3] = x;
      positions[i * 3 + 1] = startY;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      data.push({
        x,
        fallSpeed: 0.5 + Math.random() * 1.5,
        wobbleSpeed: 1 + Math.random() * 3,
        wobbleRadius: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        startY,
      });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#ffd700"),
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, particleData: data };
  }, []);

  useFrame(() => {
    if (!visible || !pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.001;

    for (let i = 0; i < VICTORY_PARTICLE_COUNT; i++) {
      const d = particleData[i];

      // Fall downward
      posArray[i * 3 + 1] -= d.fallSpeed * 0.016;

      // Wobble side to side
      posArray[i * 3] =
        d.x + Math.sin(time * d.wobbleSpeed + d.phase) * d.wobbleRadius;

      // Reset to top when it falls below ground
      if (posArray[i * 3 + 1] < -0.5) {
        posArray[i * 3 + 1] = d.startY;
      }
    }
    posAttr.needsUpdate = true;

    // Sparkle effect - vary size
    material.size = 0.035 + Math.sin(time * 5) * 0.01;
    material.opacity = active ? 0.8 : Math.max(0, material.opacity - 0.005);
  });

  if (!visible) return null;

  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} />

      {/* Additional sparkle layers for richness */}
      <Sparkles
        count={60}
        speed={1}
        size={3}
        color="#ffd700"
        scale={[10, 6, 6]}
        opacity={0.5}
        noise={2}
      />
      <Sparkles
        count={30}
        speed={0.5}
        size={4}
        color="#fff8e1"
        scale={[8, 5, 5]}
        opacity={0.3}
        noise={1}
      />
      <Sparkles
        count={20}
        speed={1.5}
        size={2}
        color="#ffab00"
        scale={[12, 4, 8]}
        opacity={0.4}
        noise={3}
      />

      {/* Warm golden light from above */}
      <pointLight
        color="#ffd700"
        intensity={1.5}
        distance={12}
        decay={2}
        position={[0, 5, 0]}
      />
    </group>
  );
});

// SCENE CONTENT (rendered inside Canvas)
// ================================================================================================

const SceneContent = React.memo(function SceneContent({
  myChampion,
  opponentChampion,
  attackEffect,
  onAttackComplete,
  hitFlash,
  koTarget,
  showVictory,
  performanceScale,
}: ArenaSceneProps & {
  hitFlash: boolean;
  performanceScale: number;
}) {
  const myColor = myChampion?.element
    ? ELEMENT_COLORS[myChampion.element] ?? DEFAULT_ELEMENT_COLOR
    : DEFAULT_ELEMENT_COLOR;

  const opponentColor = opponentChampion?.element
    ? ELEMENT_COLORS[opponentChampion.element] ?? DEFAULT_ELEMENT_COLOR
    : DEFAULT_ELEMENT_COLOR;

  // Calculate attack effect positions
  const attackFrom = useMemo(() => {
    if (!attackEffect) return null;
    const pos = attackEffect.from === "left" ? LEFT_POSITION : RIGHT_POSITION;
    return [pos[0], pos[1] + 1, pos[2]] as [number, number, number];
  }, [attackEffect]);

  const attackTo = useMemo(() => {
    if (!attackEffect) return null;
    const pos = attackEffect.from === "left" ? RIGHT_POSITION : LEFT_POSITION;
    return [pos[0], pos[1] + 1, pos[2]] as [number, number, number];
  }, [attackEffect]);

  // KO explosion position
  const koPosition = useMemo((): [number, number, number] | null => {
    if (!koTarget) return null;
    const pos = koTarget === "left" ? LEFT_POSITION : RIGHT_POSITION;
    return [pos[0], pos[1] + 0.8, pos[2]];
  }, [koTarget]);

  return (
    <>
      {/* Camera with subtle drift and screen shake */}
      <CameraController />

      {/* Arena environment (ground, lights, fog, ambient particles) */}
      <ArenaEnvironment performanceScale={performanceScale} />

      {/* Dedicated ambient particle system */}
      <AmbientParticles performanceScale={performanceScale} />

      {/* Left champion (player) */}
      {myChampion && (
        <>
          <ChampionModel
            championId={myChampion.id}
            position={LEFT_POSITION}
            side="left"
            animation={myChampion.animation}
            elementColor={myColor}
          />
          {myChampion.element && (
            <ElementalAura
              element={myChampion.element}
              position={[
                LEFT_POSITION[0],
                LEFT_POSITION[1] + 0.1,
                LEFT_POSITION[2],
              ]}
              intensity={myChampion.animation === "idle" ? 0.6 : 1.0}
              performanceScale={performanceScale}
            />
          )}
        </>
      )}

      {/* Right champion (opponent) */}
      {opponentChampion && (
        <>
          <ChampionModel
            championId={opponentChampion.id}
            position={RIGHT_POSITION}
            side="right"
            animation={opponentChampion.animation}
            elementColor={opponentColor}
          />
          {opponentChampion.element && (
            <ElementalAura
              element={opponentChampion.element}
              position={[
                RIGHT_POSITION[0],
                RIGHT_POSITION[1] + 0.1,
                RIGHT_POSITION[2],
              ]}
              intensity={
                opponentChampion.animation === "idle" ? 0.6 : 1.0
              }
              performanceScale={performanceScale}
            />
          )}
        </>
      )}

      {/* Attack effect */}
      {attackEffect && attackFrom && attackTo && (
        <AttackEffect
          from={attackFrom}
          to={attackTo}
          element={attackEffect.element}
          onComplete={onAttackComplete}
        />
      )}

      {/* KO explosion effect */}
      {koPosition && (
        <KoExplosion position={koPosition} active={!!koTarget} />
      )}

      {/* Victory celebration */}
      <VictoryCelebration active={!!showVictory} />

      {/* Post-processing */}
      <PostProcessing
        bloomIntensity={0.8}
        vignetteEnabled={true}
        hitFlash={hitFlash}
      />
    </>
  );
});

// MAIN COMPONENT
// ================================================================================================

const ArenaScene = React.memo(function ArenaScene({
  myChampion,
  opponentChampion,
  attackEffect,
  onAttackComplete,
  koTarget,
  showVictory,
}: ArenaSceneProps) {
  const [dpr, setDpr] = useState(1.5);
  const [hitFlash, setHitFlash] = useState(false);
  const [performanceScale, setPerformanceScale] = useState(1.0);

  // Trigger hit flash when attack completes, plus camera shake
  const handleAttackComplete = useCallback(() => {
    setHitFlash(true);
    setTimeout(() => setHitFlash(false), 200);
    onAttackComplete?.();
  }, [onAttackComplete]);

  // Trigger big camera shake on KO
  useEffect(() => {
    if (koTarget) {
      // Large shake for KO, small delay so the KO explosion visual starts first
      const timer = setTimeout(() => {
        triggerCameraShake({ intensity: 0.35, duration: 0.6 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [koTarget]);

  return (
    <Canvas
      shadows
      dpr={dpr}
      camera={{
        position: CAMERA_POSITION,
        fov: 40,
        near: 0.1,
        far: 50,
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#1a1a2e",
      }}
    >
      <Suspense fallback={null}>
        <PerformanceMonitor
          onIncline={() => {
            setDpr(2);
            setPerformanceScale(1.0);
          }}
          onDecline={() => {
            setDpr(1);
            setPerformanceScale(0.5);
          }}
        >
          <AdaptiveDpr pixelated />
          <SceneContent
            myChampion={myChampion}
            opponentChampion={opponentChampion}
            attackEffect={attackEffect}
            onAttackComplete={handleAttackComplete}
            hitFlash={hitFlash}
            koTarget={koTarget}
            showVictory={showVictory}
            performanceScale={performanceScale}
          />
        </PerformanceMonitor>
      </Suspense>
    </Canvas>
  );
});

export default ArenaScene;
