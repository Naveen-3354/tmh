'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/utils';

export interface MetricPoint {
  day: string;
  /** null means "not logged" and renders as a gap, never as zero. */
  value: number | null;
}

/**
 * How to render a value.
 *
 * A name rather than a callback because this component is a Client Component
 * and its props cross the server boundary — React cannot serialise a function,
 * and TypeScript will not catch that for you.
 */
export type ValueFormat = 'integer' | 'decimal1' | 'hoursFromMinutes';

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  integer: (value) => Math.round(value).toLocaleString(),
  decimal1: (value) => value.toFixed(1),
  hoursFromMinutes: (value) => (value / 60).toFixed(1),
};

interface MetricChartProps {
  points: MetricPoint[];
  color: string;
  /** Drawn as a dashed reference line when provided. */
  target?: number | null;
  unit?: string;
  variant?: 'area' | 'bar';
  height?: number;
  /** Describes the series for screen readers and the data table fallback. */
  label: string;
  format?: ValueFormat;
}

function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

/** Step size for a "round" axis bound: 1, 2 or 5 times a power of ten. */
function niceStep(range: number): number {
  if (range <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(range));
  const normalised = range / magnitude;
  const step = normalised <= 1 ? 0.2 : normalised <= 2 ? 0.5 : normalised <= 5 ? 1 : 2;
  return step * magnitude;
}

function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const step = niceStep(value);
  return Math.ceil(value / step) * step;
}

function niceFloor(value: number): number {
  if (value <= 0) return 0;
  const step = niceStep(value);
  return Math.floor(value / step) * step;
}

export function MetricChart({
  points,
  color,
  target,
  unit = '',
  variant = 'area',
  height = 180,
  label,
  format = 'integer',
}: MetricChartProps) {
  const formatValue = FORMATTERS[format];
  const logged = points.filter((point) => point.value !== null);

  if (logged.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground"
      >
        Nothing logged in this window yet.
      </div>
    );
  }

  const values = logged.map((point) => point.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values, target ?? Number.NEGATIVE_INFINITY);
  // A little headroom so the line never touches the frame, rounded outwards to
  // a readable number — an axis tick reading 14993.05 is noise, not precision.
  const padding = Math.max((max - min) * 0.15, max * 0.05, 1);
  const domain: [number, number] = [
    variant === 'bar' ? 0 : niceFloor(Math.max(0, min - padding)),
    niceCeil(max + padding),
  ];

  const axisProps = {
    stroke: 'var(--muted-foreground)',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  } as const;

  const tooltip = (
    <Tooltip
      cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
      contentStyle={{
        background: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontSize: 12,
        color: 'var(--popover-foreground)',
      }}
      formatter={(value) =>
        [`${formatValue(Number(value))}${unit ? ` ${unit}` : ''}`, label] as [string, string]
      }
    />
  );

  const reference =
    target != null ? (
      <ReferenceLine
        y={target}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 4"
        strokeOpacity={0.6}
        label={{
          value: 'goal',
          position: 'right',
          fill: 'var(--muted-foreground)',
          fontSize: 10,
        }}
      />
    ) : null;

  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={`${label} over ${points.length} days. ${logged.length} days logged, ranging from ${formatValue(min)} to ${formatValue(Math.max(...values))} ${unit}.`}
        className={cn('tabular')}
      >
        <ResponsiveContainer width="100%" height={height}>
          {variant === 'bar' ? (
            <BarChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axisProps} />
              <YAxis domain={domain} width={44} {...axisProps} />
              {tooltip}
              {reference}
              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`fill-${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axisProps} />
              <YAxis domain={domain} width={44} {...axisProps} />
              {tooltip}
              {reference}
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#fill-${label.replace(/\W/g, '')})`}
                // A day with no entry is a gap in the line, not a drop to zero.
                connectNulls={false}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Screen-reader fallback: the same series as a table. */}
      <figcaption className="sr-only">
        <table>
          <caption>{label} by day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{label}</th>
            </tr>
          </thead>
          <tbody>
            {logged.map((point) => (
              <tr key={point.day}>
                <th scope="row">{point.day}</th>
                <td>{`${formatValue(point.value as number)} ${unit}`.trim()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
