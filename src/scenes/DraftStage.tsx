import React, { useRef, useMemo, Suspense, useState, useCallback, useEffect } from "react";
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
import DraftBackground from "./DraftBackground";
import { useLowPower } from "../utils/deviceCapabilities";

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
const DRAG_SENSITIVITY = 0.01;
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
  dragDeltaX,
}: {
  championId: number;
  elementColor: string;
  shouldRotate: boolean;
  dragDeltaX: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Apply drag rotation (consumed each frame)
    if (dragDeltaX !== 0) {
      groupRef.current.rotation.y += dragDeltaX;
    }
    // Auto-rotate on top
    if (shouldRotate) {
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
  lowPower = false,
}: {
  elementColor: string;
  lowPower?: boolean;
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
        castShadow={!lowPower}
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
  dragDeltaX,
  mousePosition,
  lowPower = false,
}: DraftStageProps & { dragDeltaX: number; mousePosition: React.RefObject<{ x: number; y: number }>; lowPower?: boolean }) {
  const elementColor = element
    ? ELEMENT_COLORS[element] ?? DEFAULT_COLOR
    : DEFAULT_COLOR;

  return (
    <>
      {/* Background — push fog far back in low-power so the brightened gradient stays visible */}
      <fog attach="fog" args={["#12121e", lowPower ? 12 : 6, lowPower ? 30 : 18]} />

      {/* Themed parallax background */}
      <DraftBackground championId={championId} mousePosition={mousePosition} lowPower={lowPower} />

      {/* Environment (skip HDR cubemap on low-power) */}
      {!lowPower && <Environment preset="night" />}

      {/* Lighting */}
      <DraftLighting elementColor={elementColor} lowPower={lowPower} />

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
              dragDeltaX={dragDeltaX}
            />
            {element && (
              <ElementalAura
                element={element}
                position={[0, 0.2, 0]}
                intensity={0.8}
                lowPower={lowPower}
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
        lowPower={lowPower}
      />
    </>
  );
});

// MAIN COMPONENT
// ================================================================================================

const DraftStage = React.memo(function DraftStage(props: DraftStageProps) {
  const lowPower = useLowPower();
  const [dpr, setDpr] = useState(lowPower ? 1 : 1.5);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const mousePosition = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPointerX = useRef(0);
  const cachedRect = useRef<DOMRect | null>(null);

  // Sync DPR when lowPower toggle changes
  useEffect(() => {
    setDpr(lowPower ? 1 : 1.5);
  }, [lowPower]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    lastPointerX.current = e.clientX;
    cachedRect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // Track mouse position for parallax (normalized -1 to 1)
    const rect = cachedRect.current ?? (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mousePosition.current.x = nx;
    mousePosition.current.y = ny;

    if (!isDragging.current) return;
    const dx = e.clientX - lastPointerX.current;
    lastPointerX.current = e.clientX;
    setDragDeltaX(dx * DRAG_SENSITIVITY);
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
    cachedRect.current = null;
    setDragDeltaX(0);
  }, []);

  return (
    <Canvas
      shadows={!lowPower}
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
        background: "#0a0a14",
        cursor: isDragging.current ? "grabbing" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <Suspense fallback={null}>
        {lowPower ? (
          <DraftSceneContent {...props} dragDeltaX={dragDeltaX} mousePosition={mousePosition} lowPower />
        ) : (
          <PerformanceMonitor
            onIncline={() => setDpr(2)}
            onDecline={() => setDpr(1)}
          >
            <AdaptiveDpr pixelated />
            <DraftSceneContent {...props} dragDeltaX={dragDeltaX} mousePosition={mousePosition} />
          </PerformanceMonitor>
        )}
      </Suspense>
    </Canvas>
  );
});

export default DraftStage;
