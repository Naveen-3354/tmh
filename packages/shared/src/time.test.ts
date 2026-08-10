import { describe, expect, it } from 'vitest';

import {
  addDays,
  dayKeyRange,
  dayRangeUtc,
  diffDays,
  isDayKey,
  isValidTimeZone,
  toDayKey,
  zonedWallClockToUtc,
} from './time';

const HOUR_MS = 3_600_000;

describe('toDayKey', () => {
  it('resolves an instant to the local calendar day, not the UTC one', () => {
    // 2026-03-15T20:30Z is already the 16th in Auckland and still the 15th in New York.
    const instant = new Date('2026-03-15T20:30:00Z');
    expect(toDayKey(instant, 'UTC')).toBe('2026-03-15');
    expect(toDayKey(instant, 'America/New_York')).toBe('2026-03-15');
    expect(toDayKey(instant, 'Pacific/Auckland')).toBe('2026-03-16');
  });

  it('handles half-hour offsets', () => {
    // 18:45Z is 00:15 the next day in Kolkata (+05:30).
    const instant = new Date('2026-06-01T18:45:00Z');
    expect(toDayKey(instant, 'Asia/Kolkata')).toBe('2026-06-02');
    expect(toDayKey(instant, 'UTC')).toBe('2026-06-01');
  });

  it('treats local midnight as belonging to the day starting', () => {
    const midnightKolkata = zonedWallClockToUtc('2026-06-02', 'Asia/Kolkata');
    expect(toDayKey(midnightKolkata, 'Asia/Kolkata')).toBe('2026-06-02');
  });
});

describe('zonedWallClockToUtc', () => {
  it('maps local midnight to the correct UTC instant', () => {
    expect(zonedWallClockToUtc('2026-06-02', 'Asia/Kolkata').toISOString()).toBe(
      '2026-06-01T18:30:00.000Z',
    );
    expect(zonedWallClockToUtc('2026-01-15', 'UTC').toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('resolves times on the far side of a DST boundary correctly', () => {
    // US DST begins 2026-03-08. Local 12:00 that day is EDT (UTC-4), not EST.
    expect(zonedWallClockToUtc('2026-03-08', 'America/New_York', 12).toISOString()).toBe(
      '2026-03-08T16:00:00.000Z',
    );
    // The day before is still EST (UTC-5).
    expect(zonedWallClockToUtc('2026-03-07', 'America/New_York', 12).toISOString()).toBe(
      '2026-03-07T17:00:00.000Z',
    );
  });
});

describe('dayRangeUtc', () => {
  it('produces a 24-hour window on an ordinary day', () => {
    const { start, end } = dayRangeUtc('2026-06-10', 'Asia/Kolkata');
    expect(end.getTime() - start.getTime()).toBe(24 * HOUR_MS);
  });

  it('produces a 23-hour window on a spring-forward day', () => {
    const { start, end } = dayRangeUtc('2026-03-08', 'America/New_York');
    expect(end.getTime() - start.getTime()).toBe(23 * HOUR_MS);
  });

  it('produces a 25-hour window on a fall-back day', () => {
    // US DST ends 2026-11-01.
    const { start, end } = dayRangeUtc('2026-11-01', 'America/New_York');
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR_MS);
  });

  it('is half-open — the end instant belongs to the next day', () => {
    const { end } = dayRangeUtc('2026-06-10', 'Asia/Kolkata');
    expect(toDayKey(end, 'Asia/Kolkata')).toBe('2026-06-11');
    expect(toDayKey(new Date(end.getTime() - 1), 'Asia/Kolkata')).toBe('2026-06-10');
  });
});

describe('day key arithmetic', () => {
  it('adds and subtracts across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('measures signed distance between days', () => {
    expect(diffDays('2026-01-01', '2026-01-08')).toBe(7);
    expect(diffDays('2026-01-08', '2026-01-01')).toBe(-7);
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('builds inclusive ranges and refuses reversed ones', () => {
    expect(dayKeyRange('2026-01-01', '2026-01-04')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(dayKeyRange('2026-01-04', '2026-01-01')).toEqual([]);
  });

  it('rejects malformed day keys', () => {
    expect(isDayKey('2026-1-1')).toBe(false);
    expect(isDayKey('2026-01-01')).toBe(true);
    expect(() => addDays('nonsense', 1)).toThrow(/Invalid day key/);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
