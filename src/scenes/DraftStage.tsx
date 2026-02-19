import React, { useRef, useMemo, Suspense, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  AdaptiveDpr,
  PerformanceMonitor,
} from "@react-three/drei";
import { Group, Color, DataTexture, NearestFilter, RedFormat, Mesh } from "three";

import ChampionModel from "./ChampionModel";
import ElementalAura from "./ElementalAura";
import PostProcessing from "./PostProcessing";

// TYPES
// ================================================================================================

interface DraftStageProps {
  championId: number | null;
  onRotate?: boolean;
  element?: "fire" | "water" | "earth" | "wind";
}

// CONSTANTS
// ================================================================================================

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

const DEFAULT_COLOR = "#888888";
const ROTATION_SPEED = 0.4;
const CAMERA_POSITION: [number, number, number] = [0, 2.5, 4.5];

// GRADIENT MAP
// ================================================================================================

function createGradientMap(): DataTexture {
  const colors = new Uint8Array([50, 100, 160, 220]);
  const texture = new DataTexture(colors, 4, 1, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// PEDESTAL
// ================================================================================================

const Pedestal = React.memo(function Pedestal({
  elementColor,
}: {
  elementColor: string;
}) {
  const gradientMap = useMemo(() => createGradientMap(), []);
  const glowColor = useMemo(() => new Color(elementColor), [elementColor]);

  return (
    <group position={[0, -0.05, 0]} scale={[0.5, 0.5, 0.5]}>
      {/* Main pedestal cylinder */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <cylinderGeometry args={[1.0, 1.2, 0.5, 32]} />
        <meshToonMaterial
          color="#2a2a3a"
          gradientMap={gradientMap}
          emissive={glowColor}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Top ring accent */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1.02, 32]} />
        <meshBasicMaterial
          color={elementColor}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Inner glowing disc */}
      <mesh
        position={[0, -0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.85, 32]} />
        <meshBasicMaterial
          color={elementColor}
          transparent
          opacity={0.08}
        />
      </mesh>
    </group>
  );
});

// ROTATING CHAMPION WRAPPER
// ================================================================================================

const RotatingChampion = React.memo(function RotatingChampion({
  championId,
  elementColor,
  shouldRotate,
}: {
  championId: number;
  elementColor: string;
  shouldRotate: boolean;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current && shouldRotate) {
      groupRef.current.rotation.y += delta * ROTATION_SPEED;
    }
  });

  return (
    <group ref={groupRef}>
      <ChampionModel
        championId={championId}
        position={[0, 0, 0]}
        side="left"
        animation="idle"
        elementColor={elementColor}
      />
    </group>
  );
});

// DRAFT LIGHTING
// ================================================================================================

const DraftLighting = React.memo(function DraftLighting({
  elementColor,
}: {
  elementColor: string;
}) {
  return (
    <>
      {/* Low ambient for dramatic feel */}
      <ambientLight intensity={0.15} color="#6666aa" />

      {/* Dramatic top-down spotlight */}
      <spotLight
        position={[0, 8, 0]}
        angle={0.4}
        penumbra={0.8}
        intensity={2.0}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.002}
        target-position={[0, 0, 0]}
      />

      {/* Front key light, slightly warm */}
      <directionalLight
        position={[2, 3, 4]}
        intensity={0.7}
        color="#ffeedd"
      />

      {/* Back rim light for silhouette */}
      <directionalLight
        position={[-1, 3, -3]}
        intensity={0.5}
        color="#9977cc"
      />

      {/* Element-colored accent light from below */}
      <pointLight
        position={[0, 0.3, 0]}
        intensity={0.6}
        color={elementColor}
        distance={4}
        decay={2}
      />
    </>
  );
});

// EMPTY PEDESTAL PLACEHOLDER
// ================================================================================================

const EmptyPedestal = React.memo(function EmptyPedestal() {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      const pulse = 0.3 + Math.sin(Date.now() * 0.002) * 0.15;
      (meshRef.current.material as { opacity: number }).opacity = pulse;
    }
  });

  return (
    <group>
      <Pedestal elementColor="#555555" />
      {/* Floating question mark indicator */}
      <mesh ref={meshRef} position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color="#666688" transparent opacity={0.3} />
      </mesh>
    </group>
  );
});

// SCENE CONTENT
// ================================================================================================

const DraftSceneContent = React.memo(function DraftSceneContent({
  championId,
  onRotate = true,
  element,
}: DraftStageProps) {
  const elementColor = element
    ? ELEMENT_COLORS[element] ?? DEFAULT_COLOR
    : DEFAULT_COLOR;

  return (
    <>
      {/* Background */}
      <fog attach="fog" args={["#12121e", 6, 18]} />
      <color attach="background" args={["#12121e"]} />

      {/* Environment */}
      <Environment preset="night" />

      {/* Lighting */}
      <DraftLighting elementColor={elementColor} />

      {/* Scene group — shifted down so pedestal sits near bottom of viewport */}
      <group position={[0, -0.9, 0]}>
        {/* Pedestal */}
        <Pedestal elementColor={elementColor} />

        {/* Champion or empty state */}
        {championId !== null ? (
          <>
            <RotatingChampion
              championId={championId}
              elementColor={elementColor}
              shouldRotate={onRotate ?? true}
            />
            {element && (
              <ElementalAura
                element={element}
                position={[0, 0.2, 0]}
                intensity={0.8}
              />
            )}
          </>
        ) : (
          <EmptyPedestal />
        )}

        {/* Pedestal provides visual grounding; ContactShadows removed to avoid z-fighting */}
      </group>

      {/* Post-processing - softer for draft */}
      <PostProcessing
        bloomIntensity={0.6}
        vignetteEnabled={true}
        hitFlash={false}
      />
    </>
  );
});

// MAIN COMPONENT
// ================================================================================================

const DraftStage = React.memo(function DraftStage(props: DraftStageProps) {
  const [dpr, setDpr] = useState(1.5);

  return (
    <Canvas
      shadows
      dpr={dpr}
      camera={{
        position: CAMERA_POSITION,
        fov: 35,
        near: 0.1,
        far: 30,
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#12121e",
      }}
    >
      <Suspense fallback={null}>
        <PerformanceMonitor
          onIncline={() => setDpr(2)}
          onDecline={() => setDpr(1)}
        >
          <AdaptiveDpr pixelated />
          <DraftSceneContent {...props} />
        </PerformanceMonitor>
      </Suspense>
    </Canvas>
  );
});

export default DraftStage;
