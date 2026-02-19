import React, { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import {
  Group,
  Mesh,
  DataTexture,
  NearestFilter,
  RedFormat,
  Color,
  SkinnedMesh,
} from "three";
import { getChampion } from "../constants/champions";

// TYPES
// ================================================================================================

interface ChampionModelProps {
  championId: number;
  position: [number, number, number];
  side: "left" | "right";
  animation: string;
  elementColor: string;
}

// GRADIENT MAP
// ================================================================================================

function createGradientMap(steps: number = 4): DataTexture {
  const colors = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    colors[i] = Math.round((i / (steps - 1)) * 255);
  }
  const texture = new DataTexture(colors, steps, 1, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// FALLBACK BOX
// ================================================================================================

const FallbackBox = React.memo(function FallbackBox({
  position,
  side,
  elementColor,
}: {
  position: [number, number, number];
  side: "left" | "right";
  elementColor: string;
}) {
  const meshRef = useRef<Mesh>(null);
  const gradientMap = useMemo(() => createGradientMap(), []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3 * (side === "left" ? 1 : -1);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={[0.6, 1.2, 0.4]}
      castShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial
        color={elementColor}
        gradientMap={gradientMap}
        emissive={new Color(elementColor)}
        emissiveIntensity={0.15}
      />
    </mesh>
  );
});

// LOADED MODEL
// ================================================================================================

const LoadedModel = React.memo(function LoadedModel({
  championId,
  position,
  side,
  animation,
  elementColor: _elementColor,
}: ChampionModelProps) {
  const groupRef = useRef<Group>(null);
  const champion = getChampion(championId);
  const modelPath = champion.modelPath;

  // Derive animation file path: /models/ember.glb + "idle" → /models/ember.idle.glb
  const animPath = modelPath.replace(".glb", `.${animation}.glb`);

  const { scene, animations: modelAnims } = useGLTF(modelPath);
  const { animations: externalAnims } = useGLTF(animPath);

  // Merge clips: prefer external animation file, fall back to embedded clips
  const allAnimations = useMemo(
    () => [...externalAnims, ...modelAnims],
    [externalAnims, modelAnims],
  );

  const { actions, mixer } = useAnimations(allAnimations, groupRef);

  // Force champion into the opaque render pass so aura rings stay behind
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof Mesh || child instanceof SkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          mat.depthWrite = true;
          mat.transparent = false;
        }
      }
    });
  }, [scene]);

  // Play the requested animation
  useEffect(() => {
    const action = actions[animation];
    if (action) {
      action.reset().fadeIn(0.25).play();
      return () => {
        action.fadeOut(0.25);
      };
    }

    // Try partial match (e.g., "idle" matches "Idle" or "mixamo_idle")
    const lowerAnim = animation.toLowerCase();
    const matchKey = Object.keys(actions).find(
      (key) => key.toLowerCase().includes(lowerAnim)
    );
    if (matchKey && actions[matchKey]) {
      const fallbackAction = actions[matchKey]!;
      fallbackAction.reset().fadeIn(0.25).play();
      return () => {
        fallbackAction.fadeOut(0.25);
      };
    }

    // Play first available animation as last resort
    const firstKey = Object.keys(actions)[0];
    if (firstKey && actions[firstKey]) {
      const firstAction = actions[firstKey]!;
      firstAction.reset().fadeIn(0.25).play();
      return () => {
        firstAction.fadeOut(0.25);
      };
    }
  }, [animation, actions, mixer]);

  // Rotate champions to face each other. Pure facing would be ±π/2
  // (profile to camera), so we use ±π/3 (~60°) for a 3/4 view where
  // they clearly face each other while remaining visible from the front.
  // Mirror X on the right side for a flipped fighting stance.
  const scaleX = side === "right" ? -1 : 1;
  const rotationY = side === "left" ? Math.PI / 3 : -Math.PI / 3;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={[scaleX, 1, 1]}
    >
      <primitive object={scene} />
    </group>
  );
});

// MAIN COMPONENT
// ================================================================================================

const ChampionModel = React.memo(function ChampionModel(
  props: ChampionModelProps
) {
  return (
    <React.Suspense
      fallback={
        <FallbackBox
          position={props.position}
          side={props.side}
          elementColor={props.elementColor}
        />
      }
    >
      <LoadedModel key={props.championId} {...props} />
    </React.Suspense>
  );
});

export default ChampionModel;
