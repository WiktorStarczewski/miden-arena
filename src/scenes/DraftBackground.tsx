import React, { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  Group,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  AdditiveBlending,
  ShaderMaterial,
  Vector2,
  MathUtils,
  FrontSide,
  SRGBColorSpace,
} from "three";
import type { Element } from "../types/game";

const BASE = import.meta.env.BASE_URL;

interface ThemeConfig {
  topColor: string;
  bottomColor: string;
  particleColor: string;
  particleCount: number;
  particleSize: number;
  particleSpeed: number;
  particleDirection: "up" | "down" | "random";
  element: Element | null;
}

interface DraftBackgroundProps {
  championId: number | null;
  mousePosition: React.RefObject<{ x: number; y: number }>;
  lowPower?: boolean;
}

// CHAMPION THEMES
// ================================================================================================

const THEMES: Record<number, ThemeConfig> = {
  0: { // Inferno
    element: "fire", topColor: "#080200", bottomColor: "#2a0800",
    particleColor: "#ff6600", particleCount: 120, particleSize: 0.04,
    particleSpeed: 0.6, particleDirection: "up",
  },
  1: { // Boulder
    element: "earth", topColor: "#0a0804", bottomColor: "#1e1608",
    particleColor: "#c4a060", particleCount: 80, particleSize: 0.025,
    particleSpeed: 0.15, particleDirection: "down",
  },
  2: { // Ember
    element: "fire", topColor: "#0a0404", bottomColor: "#2e1408",
    particleColor: "#ffaa44", particleCount: 100, particleSize: 0.03,
    particleSpeed: 0.3, particleDirection: "random",
  },
  3: { // Torrent
    element: "water", topColor: "#020408", bottomColor: "#061828",
    particleColor: "#66ccff", particleCount: 140, particleSize: 0.02,
    particleSpeed: 1.2, particleDirection: "down",
  },
  4: { // Gale
    element: "wind", topColor: "#040a06", bottomColor: "#102820",
    particleColor: "#88cc66", particleCount: 90, particleSize: 0.035,
    particleSpeed: 0.8, particleDirection: "random",
  },
  5: { // Tide
    element: "water", topColor: "#000408", bottomColor: "#041420",
    particleColor: "#44ddff", particleCount: 100, particleSize: 0.04,
    particleSpeed: 0.25, particleDirection: "up",
  },
  6: { // Quake
    element: "earth", topColor: "#060606", bottomColor: "#1a1408",
    particleColor: "#cc9933", particleCount: 60, particleSize: 0.06,
    particleSpeed: 0.1, particleDirection: "random",
  },
  7: { // Storm
    element: "wind", topColor: "#040210", bottomColor: "#0c1038",
    particleColor: "#aabbff", particleCount: 120, particleSize: 0.025,
    particleSpeed: 1.0, particleDirection: "down",
  },
};

const DEFAULT_THEME: ThemeConfig = {
  element: null, topColor: "#06060c", bottomColor: "#0c0c16",
  particleColor: "#666688", particleCount: 40, particleSize: 0.02,
  particleSpeed: 0.1, particleDirection: "random",
};

// IMAGE PATHS PER ELEMENT
// ================================================================================================

const BG_PATHS: Record<Element, string> = {
  fire: `${BASE}textures/draft-bg/fire/bg.jpg`,
  water: `${BASE}textures/draft-bg/water/bg.jpg`,
  earth: `${BASE}textures/draft-bg/earth/bg.jpg`,
  wind: `${BASE}textures/draft-bg/wind/bg.jpg`,
};

// Preload all element backgrounds so switching champions is instant
Object.values(BG_PATHS).forEach((url) => useTexture.preload(url));

// GRADIENT BACKDROP (base layer / fallback while images load)
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

  const uniforms = useMemo(
    () => ({
      uTopColor: { value: currentTop.current },
      uBottomColor: { value: currentBottom.current },
    }),
    [],
  );

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

// TEXTURED LAYER
// ================================================================================================

const TexturedLayer = React.memo(function TexturedLayer({
  url,
  z,
  renderOrder,
  transparent = false,
  opacity = 1,
}: {
  url: string;
  z: number;
  renderOrder: number;
  transparent?: boolean;
  opacity?: number;
}) {
  const texture = useTexture(url);

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  // Size the plane generously to cover the full viewport from the camera angle
  const aspect = texture.image.width / texture.image.height;
  const w = Math.max(30, 20 * aspect);
  const h = w / aspect;

  return (
    <mesh position={[0, -4, z]} renderOrder={renderOrder}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
        transparent={transparent || opacity < 1}
        opacity={opacity}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
});

// IMAGE BACKGROUND (single photorealistic image per element)
// ================================================================================================

const ImageBackground = React.memo(function ImageBackground({
  element,
  mousePosition,
}: {
  element: Element;
  mousePosition: React.RefObject<{ x: number; y: number }>;
}) {
  const url = BG_PATHS[element];

  return (
    <ParallaxLayer mousePosition={mousePosition} depthFactor={0.15}>
      <TexturedLayer url={url} z={-9} renderOrder={-9} opacity={0.55} />
    </ParallaxLayer>
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
    const data: { driftX: number; driftY: number; phase: number }[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = -1 + Math.random() * -5;

      const dy =
        direction === "up"
          ? speed
          : direction === "down"
            ? -speed
            : (Math.random() - 0.5) * speed * 2;

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

    const factor = 1 - Math.pow(0.001, delta);
    currentColor.current.lerp(targetColor.current, factor);
    material.color.copy(currentColor.current);

    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const d = particleData[i];
      posArray[i * 3] += d.driftX * delta;
      posArray[i * 3 + 1] += d.driftY * delta;
      posArray[i * 3] += Math.sin(time * 0.5 + d.phase) * 0.002;

      if (posArray[i * 3 + 1] > 6) {
        posArray[i * 3 + 1] = -6;
        posArray[i * 3] = (Math.random() - 0.5) * 20;
      }
      if (posArray[i * 3 + 1] < -6) {
        posArray[i * 3 + 1] = 6;
        posArray[i * 3] = (Math.random() - 0.5) * 20;
      }
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

function brightenHex(hex: string, factor: number): string {
  const c = new Color(hex);
  c.r = Math.min(1, c.r * factor + 0.04);
  c.g = Math.min(1, c.g * factor + 0.04);
  c.b = Math.min(1, c.b * factor + 0.04);
  return "#" + c.getHexString();
}

const DraftBackground = React.memo(function DraftBackground({
  championId,
  mousePosition,
  lowPower = false,
}: DraftBackgroundProps) {
  const scene = useThree((state) => state.scene);
  const baseTheme =
    championId !== null ? (THEMES[championId] ?? DEFAULT_THEME) : DEFAULT_THEME;
  const element: Element | null = baseTheme.element ?? null;

  // In low-power mode, brighten the gradient so it's not just black
  const theme = useMemo(() => {
    if (!lowPower) return baseTheme;
    return {
      ...baseTheme,
      topColor: brightenHex(baseTheme.topColor, 3.0),
      bottomColor: brightenHex(baseTheme.bottomColor, 2.5),
    };
  }, [baseTheme, lowPower]);

  // Lerp scene fog color
  const fogTarget = useRef(new Color(theme.topColor));
  useEffect(() => {
    fogTarget.current.set(theme.topColor);
  }, [theme.topColor]);

  useFrame((_, delta) => {
    if (scene.fog && "color" in scene.fog) {
      const factor = 1 - Math.pow(0.001, delta);
      scene.fog.color.lerp(fogTarget.current, factor);
    }
  });

  return (
    <group>
      {/* Base gradient (always present — shows during load & through transparent areas) */}
      <ParallaxLayer mousePosition={mousePosition} depthFactor={0.1}>
        <GradientBackdrop
          topColor={theme.topColor}
          bottomColor={theme.bottomColor}
        />
      </ParallaxLayer>

      {/* Photorealistic background image (skip in low-power mode to save GPU) */}
      {element && !lowPower && (
        <Suspense fallback={null}>
          <ImageBackground element={element} mousePosition={mousePosition} />
        </Suspense>
      )}

      {/* Atmospheric particles */}
      <ParallaxLayer mousePosition={mousePosition} depthFactor={0.5}>
        <AtmosphericParticles
          color={theme.particleColor}
          count={
            lowPower
              ? Math.round(theme.particleCount * 0.15)
              : theme.particleCount
          }
          size={theme.particleSize}
          speed={theme.particleSpeed}
          direction={theme.particleDirection}
        />
      </ParallaxLayer>
    </group>
  );
});

export default DraftBackground;
