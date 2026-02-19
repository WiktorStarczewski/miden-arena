import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, ContactShadows, Sparkles } from "@react-three/drei";
import {
  DataTexture,
  NearestFilter,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
} from "three";

// TYPES
// ================================================================================================

interface ArenaEnvironmentProps {
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
  groundColor?: string;
  ambientIntensity?: number;
  performanceScale?: number;
}

// GRADIENT MAP
// ================================================================================================

function createGroundGradientMap(): DataTexture {
  const colors = new Uint8Array([40, 80, 120, 180]);
  const texture = new DataTexture(colors, 4, 1);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// FLOATING DUST MOTES (always present, subtle ambient particles)
// ================================================================================================

interface DustMotesProps {
  count: number;
  areaSize: number;
}

const DustMotes = React.memo(function DustMotes({
  count,
  areaSize,
}: DustMotesProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * areaSize;
      positions[i * 3 + 1] = Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * areaSize;
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#b0a090"),
      size: 0.015,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
      depthWrite: false,
    });

    return { geometry: geo, material: mat };
  }, [count, areaSize]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.0001;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // Gentle drift
      posArray[idx] += Math.sin(time * 3 + i * 0.7) * 0.0003;
      posArray[idx + 1] += Math.cos(time * 2 + i * 1.3) * 0.0002;
      posArray[idx + 2] += Math.sin(time * 2.5 + i * 0.9) * 0.0003;

      // Wrap around boundaries
      if (posArray[idx] > areaSize / 2) posArray[idx] = -areaSize / 2;
      if (posArray[idx] < -areaSize / 2) posArray[idx] = areaSize / 2;
      if (posArray[idx + 1] > 4) posArray[idx + 1] = 0;
      if (posArray[idx + 1] < 0) posArray[idx + 1] = 4;
      if (posArray[idx + 2] > areaSize / 2) posArray[idx + 2] = -areaSize / 2;
      if (posArray[idx + 2] < -areaSize / 2) posArray[idx + 2] = areaSize / 2;
    }
    posAttr.needsUpdate = true;

    // Subtle pulsing opacity
    material.opacity = 0.25 + Math.sin(time * 5) * 0.05;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// MAGICAL ENERGY WISPS (faint glowing particles drifting across the scene)
// ================================================================================================

interface EnergyWispsProps {
  count: number;
}

const EnergyWisps = React.memo(function EnergyWisps({
  count,
}: EnergyWispsProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, wispData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data: { phase: number; speed: number; radius: number; yBase: number }[] = [];

    for (let i = 0; i < count; i++) {
      const phase = Math.random() * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.5;
      const radius = 3 + Math.random() * 5;
      const yBase = 0.5 + Math.random() * 3;

      positions[i * 3] = Math.cos(phase) * radius;
      positions[i * 3 + 1] = yBase;
      positions[i * 3 + 2] = Math.sin(phase) * radius;

      data.push({ phase, speed, radius, yBase });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#9966dd"),
      size: 0.04,
      transparent: true,
      opacity: 0.2,
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
    const time = Date.now() * 0.0005;

    for (let i = 0; i < count; i++) {
      const d = wispData[i];
      const angle = d.phase + time * d.speed;
      posArray[i * 3] = Math.cos(angle) * d.radius;
      posArray[i * 3 + 1] =
        d.yBase + Math.sin(time * 2 + d.phase) * 0.5;
      posArray[i * 3 + 2] = Math.sin(angle) * d.radius;
    }
    posAttr.needsUpdate = true;

    material.opacity = 0.15 + Math.sin(time * 3) * 0.05;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// FIREFLY SPARKLES (occasional bright flashes in the background)
// ================================================================================================

const FireflySparkles = React.memo(function FireflySparkles({
  count,
}: {
  count: number;
}) {
  const pointsRef = useRef<Points>(null);

  const { geometry, material, fireflyData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data: { x: number; y: number; z: number; phase: number; blinkSpeed: number }[] = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 16;
      const y = 0.5 + Math.random() * 3.5;
      const z = (Math.random() - 0.5) * 12;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      data.push({
        x,
        y,
        z,
        phase: Math.random() * Math.PI * 2,
        blinkSpeed: 0.5 + Math.random() * 2.0,
      });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: new Color("#ffee88"),
      size: 0.03,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat, fireflyData: data };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = Date.now() * 0.001;

    // Animate individual firefly positions slightly
    for (let i = 0; i < count; i++) {
      const d = fireflyData[i];
      posArray[i * 3] = d.x + Math.sin(time * 0.5 + d.phase) * 0.3;
      posArray[i * 3 + 1] = d.y + Math.sin(time * 0.7 + d.phase * 2) * 0.2;
      posArray[i * 3 + 2] = d.z + Math.cos(time * 0.4 + d.phase) * 0.3;
    }
    posAttr.needsUpdate = true;

    // Global blink effect - stagger individual fireflies
    // Use a quick sine pulse that mostly stays at 0 but flashes briefly
    const globalPhase = time * 0.3;
    const flashValue = Math.max(0, Math.sin(globalPhase * Math.PI));
    material.opacity = flashValue * 0.4;
    material.size = 0.02 + flashValue * 0.03;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// GROUND MIST (fog particles near the edges of the arena)
// ================================================================================================

const GroundMist = React.memo(function GroundMist({
  count,
}: {
  count: number;
}) {
  const mistData = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 14,
      z: (Math.random() - 0.5) * 10,
      scale: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      driftSpeed: 0.1 + Math.random() * 0.3,
    }));
  }, [count]);

  return (
    <group>
      {mistData.map((mist, i) => (
        <MistPatch
          key={i}
          x={mist.x}
          z={mist.z}
          scale={mist.scale}
          phase={mist.phase}
          driftSpeed={mist.driftSpeed}
        />
      ))}
    </group>
  );
});

// Individual mist patch that animates independently
const MistPatch = React.memo(function MistPatch({
  x,
  z,
  scale,
  phase,
  driftSpeed,
}: {
  x: number;
  z: number;
  scale: number;
  phase: number;
  driftSpeed: number;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const time = Date.now() * 0.001;
    const opacity = 0.04 + Math.sin(time * driftSpeed + phase) * 0.02;
    const mat = meshRef.current.material as MeshBasicMaterial;
    mat.opacity = Math.max(0, opacity);

    meshRef.current.position.x =
      x + Math.sin(time * driftSpeed * 0.5 + phase) * 0.5;
    meshRef.current.position.z =
      z + Math.cos(time * driftSpeed * 0.3 + phase) * 0.3;
  });

  return (
    <mesh
      ref={meshRef}
      position={[x, 0.05, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={scale}
    >
      <circleGeometry args={[1, 16]} />
      <meshBasicMaterial
        color="#8080a0"
        transparent
        opacity={0.04}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
});

// GROUND PLANE
// ================================================================================================

const ArenaGround = React.memo(function ArenaGround({
  groundColor,
}: {
  groundColor: string;
}) {
  const gradientMap = useMemo(() => createGroundGradientMap(), []);

  return (
    <group>
      {/* Main ground plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[20, 20]} />
        <meshToonMaterial
          color={groundColor}
          gradientMap={gradientMap}
        />
      </mesh>

      {/* Subtle grid overlay */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[12, 8]} />
        <meshToonMaterial
          color={new Color(groundColor).multiplyScalar(1.15)}
          gradientMap={gradientMap}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Arena boundary markers - four corner pillars */}
      {(
        [
          [-4, 0, -3],
          [4, 0, -3],
          [-4, 0, 3],
          [4, 0, 3],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <cylinderGeometry args={[0.15, 0.2, 1.5, 8]} />
          <meshToonMaterial
            color="#3a3a4a"
            gradientMap={gradientMap}
            emissive={new Color("#6644aa")}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}

      {/* Center line indicator */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
      >
        <planeGeometry args={[0.05, 6]} />
        <meshBasicMaterial
          color="#4a4a5a"
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
});

// LIGHTING RIG
// ================================================================================================

const ArenaLighting = React.memo(function ArenaLighting({
  ambientIntensity,
}: {
  ambientIntensity: number;
}) {
  return (
    <>
      {/* Ambient fill light */}
      <ambientLight intensity={ambientIntensity} color="#8888aa" />

      {/* Key light - from upper right */}
      <directionalLight
        position={[5, 8, 3]}
        intensity={1.2}
        color="#ffeedd"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-bias={-0.002}
      />

      {/* Fill light - from left, cooler tone */}
      <directionalLight
        position={[-4, 5, -2]}
        intensity={0.4}
        color="#aabbee"
      />

      {/* Rim light - from behind for silhouette separation */}
      <directionalLight
        position={[0, 4, -6]}
        intensity={0.6}
        color="#9977cc"
      />

      {/* Subtle ground bounce light */}
      <pointLight
        position={[0, 0.5, 0]}
        intensity={0.2}
        color="#554466"
        distance={8}
        decay={2}
      />
    </>
  );
});

// PILLAR GLOW EFFECTS (sparkles around arena boundary pillars)
// ================================================================================================

const PILLAR_POSITIONS: [number, number, number][] = [
  [-4, 0.75, -3],
  [4, 0.75, -3],
  [-4, 0.75, 3],
  [4, 0.75, 3],
];

const PillarGlows = React.memo(function PillarGlows() {
  return (
    <>
      {PILLAR_POSITIONS.map((pos, i) => (
        <group key={i} position={pos}>
          <Sparkles
            count={8}
            speed={0.5}
            size={2}
            color="#6644aa"
            scale={[0.4, 1.0, 0.4]}
            opacity={0.3}
            noise={0.5}
          />
          <pointLight
            color="#6644aa"
            intensity={0.15}
            distance={2}
            decay={2}
          />
        </group>
      ))}
    </>
  );
});

// MAIN COMPONENT
// ================================================================================================

const ArenaEnvironment = React.memo(function ArenaEnvironment({
  fogColor = "#1a1a2e",
  fogNear = 8,
  fogFar = 25,
  groundColor = "#2a2a3a",
  ambientIntensity = 0.35,
  performanceScale = 1.0,
}: ArenaEnvironmentProps) {
  const dustCount = Math.round(80 * performanceScale);
  const wispCount = Math.round(20 * performanceScale);
  const fireflyCount = Math.round(15 * performanceScale);
  const mistCount = Math.round(12 * performanceScale);

  return (
    <>
      {/* Fog for atmospheric depth */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />

      {/* Background color */}
      <color attach="background" args={[fogColor]} />

      {/* Environment map for subtle reflections */}
      <Environment preset="night" />

      {/* Lighting */}
      <ArenaLighting ambientIntensity={ambientIntensity} />

      {/* Ground and arena elements */}
      <ArenaGround groundColor={groundColor} />

      {/* Contact shadows for grounding characters */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.6}
        scale={12}
        blur={2.5}
        far={4}
        color="#000020"
      />

      {/* --- AMBIENT PARTICLE SYSTEMS --- */}

      {/* Floating dust motes throughout the arena */}
      <DustMotes count={dustCount} areaSize={14} />

      {/* Magical energy wisps drifting across the scene */}
      <EnergyWisps count={wispCount} />

      {/* Firefly-like sparkles in the background */}
      <FireflySparkles count={fireflyCount} />

      {/* Ground-level mist near the edges */}
      <GroundMist count={mistCount} />

      {/* Pillar glow effects */}
      <PillarGlows />

      {/* Broad ambient sparkles across the arena for magical feel */}
      <Sparkles
        count={Math.round(30 * performanceScale)}
        speed={0.2}
        size={1.5}
        color="#6644aa"
        scale={[14, 5, 10]}
        opacity={0.12}
        noise={1.0}
      />
    </>
  );
});

export default ArenaEnvironment;
