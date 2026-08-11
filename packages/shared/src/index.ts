/**
 * @tmh/shared — the single source of truth shared by the web app and the MCP
 * server.
 *
 * Pure logic and schemas, with one deliberate exception: `food/search` calls
 * the public nutrition catalogues. Those requests carry a query term or a
 * barcode and nothing else — no user data ever leaves the app (brief §8).
 */

export * from './units';
export * from './csv';
export * from './time';
export * from './activities';
export * from './calc/energy';
export * from './calc/macros';
export * from './calc/streaks';
export * from './calc/insights';
export * from './schemas/profile';
export * from './schemas/logs';
export * from './food/types';
export * from './food/normalize';
export * from './food/search';
