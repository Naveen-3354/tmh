/**
 * A small RFC 4180 CSV reader.
 *
 * Hand-written rather than pulled in as a dependency because the requirement
 * is narrow and the failure mode of a naive `split(',')` is silent data
 * corruption — a food called "Yoghurt, Greek" would shift every later column.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded commas and newlines,
 * a UTF-8 BOM, and both CRLF and LF endings.
 */

export type CsvRow = Record<string, string>;

/** Split raw CSV text into rows of cells, without interpreting a header. */
export function parseCsvCells(input: string): string[][] {
  // Strip a byte-order mark; Excel writes one and it corrupts the first header.
  const text = input.replace(/^﻿/, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char === '\r') {
      // Swallow; the \n that follows ends the row.
    } else {
      cell += char;
    }
  }

  // A file not ending in a newline still has a final row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop blank lines and any `# section` markers our own export writes.
  return rows.filter(
    (candidate) =>
      candidate.length > 0 &&
      !(candidate.length === 1 && candidate[0]?.trim() === '') &&
      !candidate[0]?.startsWith('#'),
  );
}

/**
 * Parse CSV with a header row into objects.
 *
 * Header names are trimmed and lower-cased, and `camelCase` is accepted for
 * `snake_case` (and vice versa), so an export from this app round-trips and a
 * spreadsheet a human typed still works.
 */
export function parseCsv(input: string): CsvRow[] {
  const cells = parseCsvCells(input);
  const headerRow = cells[0];
  if (!headerRow) return [];

  const headers = headerRow.map(normaliseHeader);

  return cells.slice(1).map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, column) => {
      if (!header) return;
      record[header] = (row[column] ?? '').trim();
    });
    return record;
  });
}

/** `Amount ML` and `amountMl` both become `amount_ml`. */
export function normaliseHeader(header: string): string {
  return header
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/** Read a cell as a number, treating blanks as absent rather than as zero. */
export function csvNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Read a cell as an ISO date string, tolerating common spreadsheet formats. */
export function csvDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
