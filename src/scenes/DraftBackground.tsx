import React, { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  AdditiveBlending,
  ShaderMaterial,
  Mesh,
  Vector2,
  MathUtils,
  FrontSide,
} from "three";

// TYPES
// ================================================================================================

interface ThemeConfig {
  topColor: string;
  bottomColor: string;
  fogColor: string;
  particleColor: string;
  particleCount: number;
  particleSize: number;
  particleSpeed: number;
  particleDirection: "up" | "down" | "random";
  midgroundColor: string;
  midgroundShapes: "peaks" | "waves" | "dunes" | "crystals" | "clouds" | "coral" | "rays" | "tentacles";
}

interface DraftBackgroundProps {
  championId: number | null;
  mousePosition: React.RefObject<{ x: number; y: number }>;
}

// SEEDED PRNG
// ================================================================================================

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Map shape type to a stable seed
const SHAPE_SEEDS: Record<string, number> = {
  peaks: 1001, waves: 2002, dunes: 3003, crystals: 4004,
  clouds: 5005, coral: 6006, rays: 7007, tentacles: 8008,
};

// CHAMPION THEMES
// ================================================================================================

const THEMES: Record<number, ThemeConfig> = {
  0: { // Inferno — fire
    topColor: "#080200",
    bottomColor: "#2a0800",
    fogColor: "#140500",
    particleColor: "#ff6600",
    particleCount: 120,
    particleSize: 0.04,
    particleSpeed: 0.6,
    particleDirection: "up",
    midgroundColor: "#3d1200",
    midgroundShapes: "peaks",
  },
  1: { // Boulder — earth
    topColor: "#0a0804",
    bottomColor: "#1e1608",
    fogColor: "#120e06",
    particleColor: "#c4a060",
    particleCount: 80,
    particleSize: 0.025,
    particleSpeed: 0.15,
    particleDirection: "down",
    midgroundColor: "#2e2210",
    midgroundShapes: "dunes",
  },
  2: { // Ember — fire
    topColor: "#0a0404",
    bottomColor: "#2e1408",
    fogColor: "#180a04",
    particleColor: "#ffaa44",
    particleCount: 100,
    particleSize: 0.03,
    particleSpeed: 0.3,
    particleDirection: "random",
    midgroundColor: "#3a1a08",
    midgroundShapes: "dunes",
  },
  3: { // Torrent — water
    topColor: "#020408",
    bottomColor: "#061828",
    fogColor: "#040c18",
    particleColor: "#66ccff",
    particleCount: 140,
    particleSize: 0.02,
    particleSpeed: 1.2,
    particleDirection: "down",
    midgroundColor: "#0e2840",
    midgroundShapes: "waves",
  },
  4: { // Gale — wind
    topColor: "#040a06",
    bottomColor: "#102820",
    fogColor: "#081810",
    particleColor: "#88cc66",
    particleCount: 90,
    particleSize: 0.035,
    particleSpeed: 0.8,
    particleDirection: "random",
    midgroundColor: "#1a3828",
    midgroundShapes: "clouds",
  },
  5: { // Tide — water
    topColor: "#000408",
    bottomColor: "#041420",
    fogColor: "#020a14",
    particleColor: "#44ddff",
    particleCount: 100,
    particleSize: 0.04,
    particleSpeed: 0.25,
    particleDirection: "up",
    midgroundColor: "#0c2030",
    midgroundShapes: "coral",
  },
  6: { // Quake — earth
    topColor: "#060606",
    bottomColor: "#1a1408",
    fogColor: "#100c06",
    particleColor: "#cc9933",
    particleCount: 60,
    particleSize: 0.06,
    particleSpeed: 0.1,
    particleDirection: "random",
    midgroundColor: "#2a2010",
    midgroundShapes: "crystals",
  },
  7: { // Storm — wind
    topColor: "#040210",
    bottomColor: "#0c1038",
    fogColor: "#080618",
    particleColor: "#aabbff",
    particleCount: 120,
    particleSize: 0.025,
    particleSpeed: 1.0,
    particleDirection: "down",
    midgroundColor: "#161848",
    midgroundShapes: "clouds",
  },
  8: { // Phoenix — fire
    topColor: "#0a0800",
    bottomColor: "#2a2008",
    fogColor: "#181004",
    particleColor: "#ffdd66",
    particleCount: 150,
    particleSize: 0.03,
    particleSpeed: 0.7,
    particleDirection: "up",
    midgroundColor: "#3a2a0c",
    midgroundShapes: "rays",
  },
  9: { // Kraken — water
    topColor: "#020004",
    bottomColor: "#0a0418",
    fogColor: "#06020c",
    particleColor: "#8844ff",
    particleCount: 80,
    particleSize: 0.045,
    particleSpeed: 0.15,
    particleDirection: "random",
    midgroundColor: "#140828",
    midgroundShapes: "tentacles",
  },
};

const DEFAULT_THEME: ThemeConfig = {
  topColor: "#06060c",
  bottomColor: "#0c0c16",
  fogColor: "#0a0a12",
  particleColor: "#666688",
  particleCount: 40,
  particleSize: 0.02,
  particleSpeed: 0.1,
  particleDirection: "random",
  midgroundColor: "#14141e",
  midgroundShapes: "peaks",
};

// GRADIENT BACKDROP
// ================================================================================================

const gradientVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gradientFragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  varying vec2 vUv;
  void main() {
    float t = vUv.y;
    // Smooth curve for richer gradient
    t = t * t * (3.0 - 2.0 * t);
    vec3 color = mix(uBottomColor, uTopColor, t);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const GradientBackdrop = React.memo(function GradientBackdrop({
  topColor,
  bottomColor,
}: {
  topColor: string;
  bottomColor: string;
}) {
  const matRef = useRef<ShaderMaterial>(null);
  const currentTop = useRef(new Color(topColor));
  const currentBottom = useRef(new Color(bottomColor));
  const targetTop = useRef(new Color(topColor));
  const targetBottom = useRef(new Color(bottomColor));

  useEffect(() => {
    targetTop.current.set(topColor);
    targetBottom.current.set(bottomColor);
  }, [topColor, bottomColor]);

  const uniforms = useMemo(() => ({
    uTopColor: { value: currentTop.current },
    uBottomColor: { value: currentBottom.current },
  }), []);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const factor = 1 - Math.pow(0.001, delta);
    currentTop.current.lerp(targetTop.current, factor);
    currentBottom.current.lerp(targetBottom.current, factor);
    matRef.current.uniforms.uTopColor.value.copy(currentTop.current);
    matRef.current.uniforms.uBottomColor.value.copy(currentBottom.current);
  });

  return (
    <mesh position={[0, -4, -10]} renderOrder={-10}>
      <planeGeometry args={[50, 40]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={gradientVertexShader}
        fragmentShader={gradientFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        side={FrontSide}
      />
    </mesh>
  );
});

// MIDGROUND SILHOUETTES
// ================================================================================================

function generateShapeVertices(
  type: ThemeConfig["midgroundShapes"],
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const rng = seededRandom(SHAPE_SEEDS[type] ?? 9999);

  switch (type) {
    case "peaks": {
      const peakCount = 7;
      const spread = 24;
      let vertIdx = 0;
      for (let i = 0; i < peakCount; i++) {
        const x = (i / (peakCount - 1)) * spread - spread / 2;
        const h = 1.5 + Math.sin(i * 2.3) * 1.2 + rng() * 0.5;
        const w = 1.5 + rng() * 1.0;
        positions.push(x - w, -2, 0, x, -2 + h, 0, x + w, -2, 0);
        indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
        vertIdx += 3;
      }
      break;
    }
    case "waves": {
      const segments = 30;
      const w = 28;
      let vertIdx = 0;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * w - w / 2;
        const y = Math.sin(t * Math.PI * 3) * 0.8 + Math.sin(t * Math.PI * 5) * 0.4;
        positions.push(x, -2, 0);
        positions.push(x, -2 + 1.2 + y, 0);
      }
      for (let i = 0; i < segments; i++) {
        const bl = vertIdx + i * 2;
        const tl = bl + 1;
        const br = bl + 2;
        const tr = bl + 3;
        indices.push(bl, tl, br, tl, tr, br);
      }
      break;
    }
    case "dunes": {
      const segments = 30;
      const w = 28;
      let vertIdx = 0;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * w - w / 2;
        const y = Math.sin(t * Math.PI * 2) * 0.6 + Math.sin(t * Math.PI * 1.3 + 0.5) * 0.8;
        positions.push(x, -2, 0);
        positions.push(x, -2 + Math.max(0.3, 1.0 + y), 0);
      }
      for (let i = 0; i < segments; i++) {
        const bl = vertIdx + i * 2;
        const tl = bl + 1;
        const br = bl + 2;
        const tr = bl + 3;
        indices.push(bl, tl, br, tl, tr, br);
      }
      break;
    }
    case "crystals": {
      const count = 9;
      const spread = 22;
      let vertIdx = 0;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * spread - spread / 2;
        const h = 1.0 + Math.sin(i * 1.7) * 0.8;
        const w = 0.4 + rng() * 0.5;
        positions.push(x - w, -2, 0, x, -2 + h, 0, x + w, -2, 0);
        indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
        vertIdx += 3;
        if (i % 2 === 0) {
          const sh = 0.6 + rng() * 0.5;
          const sx = x + 0.8;
          positions.push(sx - w * 0.6, 3, 0, sx, 3 - sh, 0, sx + w * 0.6, 3, 0);
          indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
          vertIdx += 3;
        }
      }
      break;
    }
    case "clouds": {
      const segments = 30;
      const w = 28;
      let vertIdx = 0;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * w - w / 2;
        const y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.7 +
                  Math.abs(Math.sin(t * Math.PI * 2.5 + 1)) * 0.5;
        positions.push(x, -2, 0);
        positions.push(x, -2 + 0.5 + y, 0);
      }
      for (let i = 0; i < segments; i++) {
        const bl = vertIdx + i * 2;
        const tl = bl + 1;
        const br = bl + 2;
        const tr = bl + 3;
        indices.push(bl, tl, br, tl, tr, br);
      }
      break;
    }
    case "coral": {
      const count = 11;
      const spread = 24;
      let vertIdx = 0;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * spread - spread / 2;
        const h = 0.8 + Math.sin(i * 2.1 + 0.3) * 0.6 + rng() * 0.3;
        const w = 0.5 + rng() * 0.6;
        positions.push(x - w * 0.3, -2, 0, x, -2 + h, 0, x + w * 0.3, -2, 0);
        indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
        vertIdx += 3;
        if (i % 2 === 0) {
          const bh = h * 0.6;
          positions.push(x, -2 + h * 0.3, 0, x + w, -2 + bh, 0, x + w * 0.3, -2, 0);
          indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
          vertIdx += 3;
        }
      }
      break;
    }
    case "rays": {
      const rayCount = 9;
      let vertIdx = 0;
      for (let i = 0; i < rayCount; i++) {
        const angle = ((i / (rayCount - 1)) - 0.5) * Math.PI * 0.8;
        const length = 4 + Math.sin(i * 1.5) * 2;
        const halfWidth = 0.15 + rng() * 0.1;
        const tipX = Math.sin(angle) * length;
        const tipY = Math.cos(angle) * length;
        positions.push(
          -halfWidth, -2, 0,
          tipX, -2 + tipY, 0,
          halfWidth, -2, 0,
        );
        indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
        vertIdx += 3;
      }
      break;
    }
    case "tentacles": {
      const tentacleCount = 6;
      const spread = 20;
      let vertIdx = 0;
      for (let i = 0; i < tentacleCount; i++) {
        const baseX = (i / (tentacleCount - 1)) * spread - spread / 2;
        const h = 1.5 + Math.sin(i * 1.8) * 1.0;
        const w = 0.6 + rng() * 0.4;
        const curve = Math.sin(i * 1.3) * 1.5;
        positions.push(
          baseX - w * 0.3, -2, 0,
          baseX + curve, -2 + h, 0,
          baseX + w * 0.3, -2, 0,
        );
        indices.push(vertIdx, vertIdx + 1, vertIdx + 2);
        vertIdx += 3;
      }
      break;
    }
  }

  return { positions, indices };
}

const MidgroundSilhouettes = React.memo(function MidgroundSilhouettes({
  shapeType,
  color,
}: {
  shapeType: ThemeConfig["midgroundShapes"];
  color: string;
}) {
  const meshRef = useRef<Mesh>(null);
  const currentColor = useRef(new Color(color));
  const targetColor = useRef(new Color(color));

  useEffect(() => {
    targetColor.current.set(color);
  }, [color]);

  const geometry = useMemo(() => {
    const { positions, indices } = generateShapeVertices(shapeType);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [shapeType]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const factor = 1 - Math.pow(0.001, delta);
    currentColor.current.lerp(targetColor.current, factor);
    const mat = meshRef.current.material as unknown as { color: Color };
    mat.color.copy(currentColor.current);
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, -1, -5]} renderOrder={-8}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.85}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
});

// ATMOSPHERIC PARTICLES
// ================================================================================================

const AtmosphericParticles = React.memo(function AtmosphericParticles({
  color,
  count,
  size,
  speed,
  direction,
}: {
  color: string;
  count: number;
  size: number;
  speed: number;
  direction: "up" | "down" | "random";
}) {
  const pointsRef = useRef<Points>(null);
  const currentColor = useRef(new Color(color));
  const targetColor = useRef(new Color(color));

  useEffect(() => {
    targetColor.current.set(color);
  }, [color]);

  const { geometry, material, particleData } = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data: {
      driftX: number;
      driftY: number;
      phase: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 12;
      const z = -1 + Math.random() * -5;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const dy =
        direction === "up" ? speed :
        direction === "down" ? -speed :
        (Math.random() - 0.5) * speed * 2;

      data.push({
        driftX: (Math.random() - 0.5) * 0.3,
        driftY: dy,
        phase: Math.random() * Math.PI * 2,
      });
    }

    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const mat = new PointsMaterial({
      color: currentColor.current.clone(),
      size,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });

    return { geometry: geo, material: mat, particleData: data };
  }, [count, direction, speed, size]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    // Lerp color
    const factor = 1 - Math.pow(0.001, delta);
    currentColor.current.lerp(targetColor.current, factor);
    material.color.copy(currentColor.current);

    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const d = particleData[i];
      // Drift
      posArray[i * 3] += d.driftX * delta;
      posArray[i * 3 + 1] += d.driftY * delta;
      // Horizontal sway
      posArray[i * 3] += Math.sin(time * 0.5 + d.phase) * 0.002;

      // Wrap around vertically
      if (posArray[i * 3 + 1] > 6) {
        posArray[i * 3 + 1] = -6;
        posArray[i * 3] = (Math.random() - 0.5) * 20;
      }
      if (posArray[i * 3 + 1] < -6) {
        posArray[i * 3 + 1] = 6;
        posArray[i * 3] = (Math.random() - 0.5) * 20;
      }
      // Wrap around horizontally
      if (posArray[i * 3] > 12) posArray[i * 3] = -12;
      if (posArray[i * 3] < -12) posArray[i * 3] = 12;
    }
    posAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

// PARALLAX LAYER WRAPPER
// ================================================================================================

const ParallaxLayer = React.memo(function ParallaxLayer({
  children,
  mousePosition,
  depthFactor,
}: {
  children: React.ReactNode;
  mousePosition: React.RefObject<{ x: number; y: number }>;
  depthFactor: number;
}) {
  const groupRef = useRef<Group>(null);
  const current = useRef(new Vector2(0, 0));

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const mouse = mousePosition.current;
    const targetX = mouse.x * depthFactor;
    const targetY = mouse.y * depthFactor * 0.5;
    const factor = 1 - Math.pow(0.001, delta);
    current.current.x = MathUtils.lerp(current.current.x, targetX, factor);
    current.current.y = MathUtils.lerp(current.current.y, targetY, factor);
    groupRef.current.position.x = current.current.x;
    groupRef.current.position.y = current.current.y;
  });

  return <group ref={groupRef}>{children}</group>;
});

// MAIN COMPONENT
// ================================================================================================

const DraftBackground = React.memo(function DraftBackground({
  championId,
  mousePosition,
}: DraftBackgroundProps) {
  const scene = useThree((state) => state.scene);
  const theme = championId !== null ? (THEMES[championId] ?? DEFAULT_THEME) : DEFAULT_THEME;

  // Lerp scene fog color
  const fogTarget = useRef(new Color(theme.fogColor));
  useEffect(() => {
    fogTarget.current.set(theme.fogColor);
  }, [theme.fogColor]);

  useFrame((_, delta) => {
    if (scene.fog && "color" in scene.fog) {
      const factor = 1 - Math.pow(0.001, delta);
      scene.fog.color.lerp(fogTarget.current, factor);
    }
  });

  return (
    <group>
      {/* Back layer: gradient sky — subtle parallax */}
      <ParallaxLayer mousePosition={mousePosition} depthFactor={0.1}>
        <GradientBackdrop
          topColor={theme.topColor}
          bottomColor={theme.bottomColor}
        />
      </ParallaxLayer>

      {/* Mid layer: silhouette shapes — moderate parallax */}
      <ParallaxLayer mousePosition={mousePosition} depthFactor={0.3}>
        <MidgroundSilhouettes
          shapeType={theme.midgroundShapes}
          color={theme.midgroundColor}
        />
      </ParallaxLayer>

      {/* Front layer: atmospheric particles — pronounced parallax */}
      <ParallaxLayer mousePosition={mousePosition} depthFactor={0.5}>
        <AtmosphericParticles
          color={theme.particleColor}
          count={theme.particleCount}
          size={theme.particleSize}
          speed={theme.particleSpeed}
          direction={theme.particleDirection}
        />
      </ParallaxLayer>
    </group>
  );
});

export default DraftBackground;
