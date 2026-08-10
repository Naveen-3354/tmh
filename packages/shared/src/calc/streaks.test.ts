import { describe, expect, it } from 'vitest';

import { computeStreak, streakCalendar } from './streaks';

describe('computeStreak', () => {
  it('counts a run ending today', () => {
    const result = computeStreak(['2026-08-08', '2026-08-09', '2026-08-10'], '2026-08-10');
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.lastActiveDay).toBe('2026-08-10');
  });

  it('keeps the streak alive when today has not been logged yet', () => {
    // The day is not over — an unlogged today must not read as a failure.
    const result = computeStreak(['2026-08-08', '2026-08-09'], '2026-08-10');
    expect(result.current).toBe(2);
  });

  it('ends the streak once yesterday is also missing', () => {
    const result = computeStreak(['2026-08-06', '2026-08-07'], '2026-08-10');
    expect(result.current).toBe(0);
    expect(result.longest).toBe(2);
  });

  it('reports the longest historical run independently of the current one', () => {
    const result = computeStreak(
      ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-10'],
      '2026-08-10',
    );
    expect(result.current).toBe(1);
    expect(result.longest).toBe(4);
  });

  it('is insensitive to order and duplicates', () => {
    const result = computeStreak(
      ['2026-08-10', '2026-08-08', '2026-08-09', '2026-08-09'],
      '2026-08-10',
    );
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('handles an empty history', () => {
    expect(computeStreak([], '2026-08-10')).toEqual({
      current: 0,
      longest: 0,
      lastActiveDay: null,
    });
  });

  it('counts runs across month boundaries', () => {
    const result = computeStreak(['2026-07-30', '2026-07-31', '2026-08-01'], '2026-08-01');
    expect(result.current).toBe(3);
  });
});

describe('streakCalendar', () => {
  it('marks every day in the window as logged or a neutral gap', () => {
    const calendar = streakCalendar(['2026-08-02'], '2026-08-01', '2026-08-03');
    expect(calendar).toEqual([
      { day: '2026-08-01', active: false },
      { day: '2026-08-02', active: true },
      { day: '2026-08-03', active: false },
    ]);
  });

  it('returns nothing for a reversed window', () => {
    expect(streakCalendar([], '2026-08-03', '2026-08-01')).toEqual([]);
  });
});
