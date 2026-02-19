import React, { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import {
  Group,
  Mesh,
  DataTexture,
  NearestFilter,
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
  const texture = new DataTexture(colors, steps, 1);
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
  elementColor,
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

  // Add a subtle element-colored emissive tint while preserving original materials
  useEffect(() => {
    const tint = new Color(elementColor);
    scene.traverse((child) => {
      if (
        child instanceof Mesh ||
        child instanceof SkinnedMesh
      ) {
        const mat = child.material as {
          emissive?: Color;
          emissiveIntensity?: number;
        };
        if (mat && "emissive" in mat) {
          mat.emissive = tint;
          mat.emissiveIntensity = 0.08;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene, elementColor]);

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

  // Mirror the model for the right side so champions face each other
  const scaleX = side === "right" ? -1 : 1;
  const rotationY = side === "right" ? Math.PI : 0;

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
