/**
 * Timezone-aware day boundaries.
 *
 * Everything is stored as UTC `timestamptz`. "Which day does this log belong
 * to?" is answered in the user's IANA zone at query time, so DST transitions
 * and travel never silently move an entry between days (DECISIONS.md P0-10).
 *
 * Implemented on `Intl` rather than a date library so it stays dependency-free
 * and exactly testable.
 */

/** A local calendar day, `YYYY-MM-DD`. Never carries a time or an offset. */
export type DayKey = string;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): value is DayKey {
  return DAY_KEY_PATTERN.test(value);
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  // `hour12: false` yields hour 24 at midnight in some ICU versions; normalise.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (east positive). */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = wallClockIn(instant, timeZone);
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // Drop sub-second precision from the instant so only the offset remains.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The local calendar day an instant falls on, in the given zone. */
export function toDayKey(instant: Date, timeZone: string): DayKey {
  const { year, month, day } = wallClockIn(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDayKey(dayKey: DayKey): { year: number; month: number; day: number } {
  if (!isDayKey(dayKey)) {
    throw new Error(`Invalid day key: "${dayKey}". Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/**
 * The UTC instant corresponding to a local wall-clock time in `timeZone`.
 *
 * Two-pass: the first pass guesses using the offset at the naive instant, the
 * second corrects it when that guess landed on the other side of a DST change.
 */
export function zonedWallClockToUtc(
  dayKey: DayKey,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = naive - timeZoneOffsetMs(new Date(naive), timeZone);
  const secondPass = naive - timeZoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/**
 * Half-open UTC range `[start, end)` covering one local day.
 *
 * Derived from consecutive local midnights, so a 23- or 25-hour DST day
 * produces a 23- or 25-hour range rather than a fixed 24.
 */
export function dayRangeUtc(dayKey: DayKey, timeZone: string): { start: Date; end: Date } {
  const start = zonedWallClockToUtc(dayKey, timeZone);
  const end = zonedWallClockToUtc(addDays(dayKey, 1), timeZone);
  return { start, end };
}

/** Shift a day key by whole calendar days. Pure string/UTC arithmetic. */
export function addDays(dayKey: DayKey, days: number): DayKey {
  const { year, month, day } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Whole calendar days from `from` to `to` (negative if `to` precedes `from`). */
export function diffDays(from: DayKey, to: DayKey): number {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  const msPerDay = 86_400_000;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / msPerDay,
  );
}

/** Inclusive list of day keys from `from` to `to`. */
export function dayKeyRange(from: DayKey, to: DayKey): DayKey[] {
  const span = diffDays(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, index) => addDays(from, index));
}

/**
 * Whole years between two calendar days.
 *
 * Calendar arithmetic, not a division by 365.2425 — so a birthday is reached
 * on the correct date regardless of leap years. Both arguments are explicit
 * so this stays pure and can run during a React render.
 */
export function ageInYears(birthDate: DayKey, today: DayKey): number {
  const born = parseDayKey(birthDate);
  const now = parseDayKey(today);
  let age = now.year - born.year;
  const hasHadBirthday =
    now.month > born.month || (now.month === born.month && now.day >= born.day);
  if (!hasHadBirthday) age -= 1;
  return age;
}

/** Validate an IANA zone without throwing on the caller's behalf. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
