import { cn } from '@/lib/utils';

export interface Ring {
  /** 0–1 of the goal. Values above 1 are drawn as a completed ring. */
  value: number;
  color: string;
  label: string;
}

const GEOMETRY = [
  { radius: 52, width: 11 },
  { radius: 38, width: 11 },
  { radius: 24, width: 11 },
] as const;

/**
 * Concentric progress rings — the app's primary "today at a glance" device.
 *
 * Pure SVG and server-renderable. Each ring carries its own accessible label
 * so the group is meaningful without colour.
 */
export function ActivityRings({
  rings,
  className,
  size = 128,
}: {
  rings: readonly Ring[];
  className?: string;
  size?: number;
}) {
  const visible = rings.slice(0, GEOMETRY.length);

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={visible
        .map((ring) => `${ring.label}: ${Math.round(ring.value * 100)}% of goal`)
        .join('. ')}
    >
      <g transform="rotate(-90 64 64)">
        {visible.map((ring, index) => {
          const geometry = GEOMETRY[index];
          if (!geometry) return null;
          const circumference = 2 * Math.PI * geometry.radius;
          const filled = Math.min(Math.max(ring.value, 0), 1) * circumference;

          return (
            <g key={ring.label}>
              <circle
                cx="64"
                cy="64"
                r={geometry.radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={geometry.width}
                strokeOpacity={0.16}
              />
              <circle
                cx="64"
                cy="64"
                r={geometry.radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={geometry.width}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference - filled}`}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
