import { describe, expect, it } from 'vitest';

import { generateInsights, MIN_GROUP_SIZE, type DailyMetrics } from './insights';

const CONTEXT = { windowDays: 30, waterTargetMl: 2000, proteinTargetG: 120 };

function day(index: number, over: Partial<DailyMetrics> = {}): DailyMetrics {
  const dayNumber = String(index + 1).padStart(2, '0');
  return {
    day: `2026-06-${dayNumber}`,
    sleepMinutes: null,
    mood: null,
    steps: null,
    activeMinutes: 0,
    waterMl: 0,
    calories: null,
    proteinG: null,
    weightKg: null,
    ...over,
  };
}

/** n short-sleep days and n adequate-sleep days, with the given moods. */
function sleepMoodDays(count: number, shortMood: number, adequateMood: number): DailyMetrics[] {
  const days: DailyMetrics[] = [];
  for (let index = 0; index < count; index += 1) {
    days.push(day(index, { sleepMinutes: 5 * 60, mood: shortMood }));
  }
  for (let index = 0; index < count; index += 1) {
    days.push(day(count + index, { sleepMinutes: 8 * 60, mood: adequateMood }));
  }
  return days;
}

const find = (days: DailyMetrics[], id: string) =>
  generateInsights(days, CONTEXT).find((insight) => insight.id === id);

describe('safety constraints', () => {
  it('says nothing at all when there is no data', () => {
    expect(generateInsights([], CONTEXT)).toEqual([]);
  });

  it('stays silent below the minimum group size', () => {
    const days = sleepMoodDays(MIN_GROUP_SIZE - 1, 2, 4.5);
    expect(find(days, 'sleep-mood')).toBeUndefined();
  });

  it('speaks once the minimum group size is reached', () => {
    const days = sleepMoodDays(MIN_GROUP_SIZE, 2, 4.5);
    expect(find(days, 'sleep-mood')).toBeDefined();
  });

  it('always states its sample size and window', () => {
    for (const insight of generateInsights(sleepMoodDays(8, 2, 4.5), CONTEXT)) {
      expect(insight.sampleSize).toBeGreaterThan(0);
      expect(insight.windowDays).toBe(30);
      // The evidence must be visible in the text the user reads, not just in
      // the object.
      expect(insight.detail).toMatch(/\d/);
    }
  });

  it('never uses prescriptive or diagnostic language', () => {
    const days = [
      ...sleepMoodDays(8, 2, 4.5),
      ...Array.from({ length: 12 }, (_, index) =>
        day(20 + index, {
          waterMl: 1000,
          proteinG: 60,
          calories: 2000,
          weightKg: 80 - index * 0.1,
        }),
      ),
    ];

    const forbidden =
      /\b(you should|you must|need to|diagnos|disorder|deficien|symptom of|treat|prescrib|cure|risk of|unhealthy)\b/i;

    const insights = generateInsights(days, CONTEXT);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.title).not.toMatch(forbidden);
      expect(insight.detail).not.toMatch(forbidden);
    }
  });
});

describe('sleep and mood', () => {
  it('reports the direction it actually observed', () => {
    const insight = find(sleepMoodDays(6, 2, 4.5), 'sleep-mood');
    expect(insight?.title).toMatch(/lower mood/);
    expect(insight?.detail).toContain('2 out of 5');
    expect(insight?.detail).toContain('4.5');
  });

  it('reports the reverse direction rather than assuming which way it goes', () => {
    const insight = find(sleepMoodDays(6, 4.5, 2), 'sleep-mood');
    expect(insight?.title).toMatch(/higher mood/);
  });

  it('stays quiet when the difference is trivial', () => {
    // 3.0 vs 3.2 is not worth telling anyone about.
    expect(find(sleepMoodDays(10, 3, 3.2), 'sleep-mood')).toBeUndefined();
  });

  it('ignores the 6–7 hour band so the groups stay distinct', () => {
    const days = Array.from({ length: 20 }, (_, index) =>
      day(index, { sleepMinutes: 6.5 * 60, mood: 3 }),
    );
    expect(find(days, 'sleep-mood')).toBeUndefined();
  });

  it('skips days missing either side of the pair', () => {
    const days = [
      ...sleepMoodDays(6, 2, 4.5),
      ...Array.from({ length: 5 }, (_, index) => day(12 + index, { sleepMinutes: 5 * 60 })),
      ...Array.from({ length: 5 }, (_, index) => day(17 + index, { mood: 5 })),
    ];
    const insight = find(days, 'sleep-mood');
    expect(insight?.sampleSize).toBe(12);
  });
});

describe('weight trend', () => {
  const weighIns = (start: number, perDay: number, count = 14) =>
    Array.from({ length: count }, (_, index) => day(index, { weightKg: start + perDay * index }));

  it('detects a downward trend and reports it per week', () => {
    const insight = find(weighIns(80, -0.05), 'weight-trend');
    expect(insight?.title).toMatch(/trending down/);
    expect(insight?.detail).toContain('0.35 kg per week');
  });

  it('detects an upward trend', () => {
    expect(find(weighIns(70, 0.04), 'weight-trend')?.title).toMatch(/trending up/);
  });

  it('calls a flat trend steady rather than inventing movement', () => {
    expect(find(weighIns(75, 0.001), 'weight-trend')?.title).toMatch(/steady/);
  });

  it('needs enough weigh-ins', () => {
    expect(find(weighIns(75, -0.05, MIN_GROUP_SIZE - 1), 'weight-trend')).toBeUndefined();
  });
});

describe('hydration consistency', () => {
  it('reports the proportion of logged days that reached the goal', () => {
    const days = [
      ...Array.from({ length: 6 }, (_, index) => day(index, { waterMl: 2500 })),
      ...Array.from({ length: 6 }, (_, index) => day(6 + index, { waterMl: 900 })),
    ];
    const insight = find(days, 'hydration-consistency');
    expect(insight?.title).toContain('50%');
    expect(insight?.detail).toContain('6 of 12');
  });

  it('counts only days where water was logged, not silent days as failures', () => {
    const days = [
      ...Array.from({ length: 10 }, (_, index) => day(index, { waterMl: 2500 })),
      ...Array.from({ length: 10 }, (_, index) => day(10 + index)),
    ];
    expect(find(days, 'hydration-consistency')?.title).toContain('100%');
  });
});

describe('protein', () => {
  const proteinDays = (grams: number) =>
    Array.from({ length: 12 }, (_, index) => day(index, { proteinG: grams, calories: 2000 }));

  it('flags a shortfall against the target', () => {
    const insight = find(proteinDays(70), 'protein-gap');
    expect(insight?.title).toMatch(/below/);
    expect(insight?.detail).toContain('70 g');
    expect(insight?.detail).toContain('120 g target');
  });

  it('stays quiet when intake is close to target', () => {
    expect(find(proteinDays(118), 'protein-gap')).toBeUndefined();
  });

  it('does nothing without a target set', () => {
    const insights = generateInsights(proteinDays(70), { ...CONTEXT, proteinTargetG: null });
    expect(insights.find((insight) => insight.id === 'protein-gap')).toBeUndefined();
  });
});
