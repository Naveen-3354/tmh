import { describe, expect, it } from 'vitest';

import { csvDate, csvNumber, normaliseHeader, parseCsv, parseCsvCells } from './csv';

describe('parseCsvCells', () => {
  it('keeps a comma inside a quoted field — the reason not to use split(",")', () => {
    const rows = parseCsvCells('name,calories\n"Yoghurt, Greek",73');
    expect(rows[1]).toEqual(['Yoghurt, Greek', '73']);
  });

  it('unescapes doubled quotes', () => {
    const rows = parseCsvCells('note\n"She said ""hello"""');
    expect(rows[1]).toEqual(['She said "hello"']);
  });

  it('keeps a newline inside a quoted field', () => {
    const rows = parseCsvCells('note\n"line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['line one\nline two']);
  });

  it('handles CRLF endings', () => {
    expect(parseCsvCells('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM so the first header is not corrupted', () => {
    const rows = parseCsvCells('﻿name,value\nx,1');
    expect(rows[0]).toEqual(['name', 'value']);
  });

  it('reads a final row with no trailing newline', () => {
    expect(parseCsvCells('a\n1\n2')).toHaveLength(3);
  });

  it('preserves empty cells rather than collapsing them', () => {
    expect(parseCsvCells('a,b,c\n1,,3')[1]).toEqual(['1', '', '3']);
  });

  it('skips blank lines and section markers from our own export', () => {
    const rows = parseCsvCells('# water_logs\namount_ml\n250\n\n# mood_logs\n');
    expect(rows).toEqual([['amount_ml'], ['250']]);
  });
});

describe('parseCsv', () => {
  it('maps rows onto normalised headers', () => {
    const rows = parseCsv('Amount ML,Occurred At\n250,2026-08-11T09:00:00Z');
    expect(rows[0]).toEqual({ amount_ml: '250', occurred_at: '2026-08-11T09:00:00Z' });
  });

  it('accepts camelCase headers, so our own export round-trips', () => {
    expect(parseCsv('amountMl\n500')[0]).toEqual({ amount_ml: '500' });
  });

  it('tolerates a short row rather than throwing', () => {
    const rows = parseCsv('a,b,c\n1,2');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   ')).toEqual([]);
  });
});

describe('normaliseHeader', () => {
  it('folds spacing, casing and separators together', () => {
    expect(normaliseHeader('  Duration Minutes ')).toBe('duration_minutes');
    expect(normaliseHeader('durationMinutes')).toBe('duration_minutes');
    expect(normaliseHeader('duration-minutes')).toBe('duration_minutes');
  });
});

describe('csvNumber', () => {
  it('distinguishes a blank cell from a zero', () => {
    expect(csvNumber('')).toBeUndefined();
    expect(csvNumber('   ')).toBeUndefined();
    expect(csvNumber('0')).toBe(0);
  });

  it('rejects text instead of coercing it to NaN', () => {
    expect(csvNumber('lots')).toBeUndefined();
  });
});

describe('csvDate', () => {
  it('accepts ISO and common spreadsheet formats', () => {
    expect(csvDate('2026-08-11T09:00:00Z')).toBe('2026-08-11T09:00:00.000Z');
    expect(csvDate('2026-08-11')).toBe('2026-08-11T00:00:00.000Z');
  });

  it('rejects nonsense rather than producing an invalid date', () => {
    expect(csvDate('not a date')).toBeUndefined();
    expect(csvDate('')).toBeUndefined();
  });
});
