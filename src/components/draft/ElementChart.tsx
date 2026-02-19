import GlassPanel from "../layout/GlassPanel";

const ELEMENTS = [
  { id: "fire", label: "Fire", color: "#ff6b35", icon: "🔥" },
  { id: "water", label: "Water", color: "#4fc3f7", icon: "💧" },
  { id: "earth", label: "Earth", color: "#8d6e63", icon: "🪨" },
  { id: "wind", label: "Wind", color: "#aed581", icon: "🌪️" },
] as const;

// Advantage cycle: Fire → Earth → Wind → Water → Fire
// Layout: Fire (top), Earth (right), Water (bottom), Wind (left)
// Arrows go clockwise for the "beats" direction

const CX = 70;
const CY = 58;
const R = 30;

// Positions: top, right, bottom, left
const POSITIONS = [
  { x: CX, y: CY - R },       // Fire (top)
  { x: CX + R, y: CY },       // Earth (right)
  { x: CX, y: CY + R },       // Water (bottom)
  { x: CX - R, y: CY },       // Wind (left)
];

// Advantage arrows: Fire→Earth, Earth→Wind, Wind→Water, Water→Fire
const ARROWS: [number, number][] = [
  [0, 1], // Fire → Earth
  [1, 3], // Earth → Wind
  [3, 2], // Wind → Water
  [2, 0], // Water → Fire
];

function arcPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bulge: number,
): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = -dy;
  const ny = dx;
  const len = Math.sqrt(nx * nx + ny * ny);
  const cx = mx + (nx / len) * bulge;
  const cy = my + (ny / len) * bulge;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

export default function ElementChart() {
  return (
    <GlassPanel compact>
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1 text-center">
        Element Chart
      </div>

      <svg viewBox="0 0 140 120" className="w-full max-w-[180px] mx-auto" overflow="visible">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 8 6"
            refX="7"
            refY="3"
            markerWidth="6"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 3 L 0 6 Z" fill="white" fillOpacity={0.5} />
          </marker>
          {ELEMENTS.map((el, i) => (
            <radialGradient key={el.id} id={`glow-${el.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={el.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={el.color} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Advantage arrows */}
        {ARROWS.map(([fromIdx, toIdx], i) => {
          const from = POSITIONS[fromIdx];
          const to = POSITIONS[toIdx];
          // Shorten the path so arrow doesn't overlap the node
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const shrink = 11;
          const f = { x: from.x + (dx / len) * shrink, y: from.y + (dy / len) * shrink };
          const t = { x: to.x - (dx / len) * shrink, y: to.y - (dy / len) * shrink };
          return (
            <path
              key={i}
              d={arcPath(f, t, 10)}
              fill="none"
              stroke="white"
              strokeOpacity={0.25}
              strokeWidth={1.2}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Element nodes */}
        {ELEMENTS.map((el, i) => {
          const pos = POSITIONS[i];
          return (
            <g key={el.id}>
              {/* Glow */}
              <circle cx={pos.x} cy={pos.y} r={14} fill={`url(#glow-${el.id})`} />
              {/* Ring */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={10}
                fill="black"
                fillOpacity={0.5}
                stroke={el.color}
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
              {/* Icon */}
              <text
                x={pos.x}
                y={pos.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
              >
                {el.icon}
              </text>
              {/* Label */}
              <text
                x={pos.x}
                y={pos.y + (i === 0 ? -15 : i === 2 ? 16 : 0)}
                dx={i === 1 ? 15 : i === 3 ? -15 : 0}
                textAnchor={i === 1 ? "start" : i === 3 ? "end" : "middle"}
                dominantBaseline={i === 0 ? "auto" : i === 2 ? "hanging" : "central"}
                fill={el.color}
                fontSize={7}
                fontWeight={600}
                opacity={0.9}
              >
                {el.label}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fillOpacity={0.15}
          fontSize={6}
          fontWeight={700}
        >
          1.5x
        </text>
      </svg>
    </GlassPanel>
  );
}
