/**
 * The tmh MCP server, independent of transport.
 *
 * The same factory backs the hosted Streamable HTTP route and the local stdio
 * binary, so both expose an identical surface. Every tool input is validated
 * with the Zod schemas from @tmh/shared — the same objects the web app's forms
 * parse against — and every write goes through the shared operations layer
 * under row-level security.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  dayKeySchema,
  logActivitySchema,
  logMealSchema,
  logMedicationSchema,
  logMoodSchema,
  logSleepSchema,
  logVitalSchema,
  logWaterSchema,
  searchFoods,
  type EntrySource,
} from '@tmh/shared';
import { z } from 'zod';

import {
  getDaySummary,
  getProfileSummary,
  getTrendSeries,
  listLogs,
  listMedications,
  logActivity,
  logMeal,
  logMedicationTaken,
  logMood,
  logSleep,
  logVital,
  logWater,
  LOG_TYPES,
  OperationError,
  TREND_METRICS,
  type LogType,
  type TrendMetric,
} from './operations';

export interface ServerContext {
  userId: string;
  /** Optional; food search falls back to USDA's shared demo key without it. */
  usdaApiKey?: string | undefined;
  /** Recorded on every row this server writes. */
  source?: EntrySource;
}

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Turn a thrown error into something a model can act on.
 *
 * An OperationError is the user's to fix and its message is safe to show.
 * Anything else is ours: it is logged server-side and reported generically,
 * so a stack trace or a connection string can never reach the client.
 */
function fail(error: unknown, fallback: string): ToolResult {
  if (error instanceof OperationError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: error.message, fieldErrors: error.fieldErrors ?? undefined },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  console.error('[tmh-mcp]', fallback, error);
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: fallback }, null, 2) }],
    isError: true,
  };
}

/** Wraps a write so every tool reports success and failure the same way. */
async function runWrite(
  operation: () => Promise<{ id: string; kind: string; summary: string }>,
  fallback: string,
): Promise<ToolResult> {
  try {
    const result = await operation();
    return ok({ ok: true, id: result.id, kind: result.kind, message: result.summary });
  } catch (error) {
    return fail(error, fallback);
  }
}

export function createTmhServer(context: ServerContext): McpServer {
  const { userId } = context;
  const source: EntrySource = context.source ?? 'mcp';

  const server = new McpServer(
    { name: 'tmh', version: '0.1.0' },
    {
      instructions:
        'Personal health and activity tracker for a single signed-in user. ' +
        'All reads and writes are scoped to that user by the database. ' +
        'Figures are self-logged and estimates derived from population equations — ' +
        "describe them as the user's own recorded data, never as clinical findings, " +
        'and do not offer diagnosis or treatment advice.',
    },
  );

  // -------------------------------------------------------------------------
  // Write tools
  // -------------------------------------------------------------------------

  server.registerTool(
    'log_water',
    {
      title: 'Log water',
      description: 'Record water intake in millilitres. Defaults to now.',
      inputSchema: logWaterSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logWater(userId, args, source), 'Could not log water.'),
  );

  server.registerTool(
    'log_activity',
    {
      title: 'Log activity',
      description:
        'Record an activity session. Calories burned are estimated from MET values and the ' +
        'most recent logged weight; do not pass them in.',
      inputSchema: logActivitySchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logActivity(userId, args, source), 'Could not log activity.'),
  );

  server.registerTool(
    'log_meal',
    {
      title: 'Log a meal',
      description:
        'Record food eaten. Use search_food first to get accurate nutrition rather than ' +
        'estimating it.',
      inputSchema: logMealSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logMeal(userId, args, source), 'Could not log that food.'),
  );

  server.registerTool(
    'log_sleep',
    {
      title: 'Log sleep',
      description:
        'Record a sleep period. Sleep is attributed to the day the user woke up. Quality is 1–5.',
      inputSchema: logSleepSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logSleep(userId, args, source), 'Could not log sleep.'),
  );

  server.registerTool(
    'log_vital',
    {
      title: 'Log a vital sign',
      description:
        'Record weight (kg), resting heart rate (bpm), blood pressure (mmHg, both values) or ' +
        'blood glucose (mmol/L).',
      inputSchema: logVitalSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logVital(userId, args, source), 'Could not log that reading.'),
  );

  server.registerTool(
    'log_mood',
    {
      title: 'Log mood',
      description: 'Record mood on a 1–5 scale, with optional note and symptom tags.',
      inputSchema: logMoodSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runWrite(() => logMood(userId, args, source), 'Could not log mood.'),
  );

  server.registerTool(
    'log_medication_taken',
    {
      title: 'Record a medication dose',
      description:
        'Mark a scheduled dose taken or skipped. Call list_medications first to get the id.',
      inputSchema: logMedicationSchema,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) =>
      runWrite(() => logMedicationTaken(userId, args, source), 'Could not record that dose.'),
  );

  // -------------------------------------------------------------------------
  // Read tools
  // -------------------------------------------------------------------------

  server.registerTool(
    'get_profile',
    {
      title: 'Get profile and targets',
      description: "The user's profile, timezone, units and daily targets.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return ok(await getProfileSummary(userId));
      } catch (error) {
        return fail(error, 'Could not read the profile.');
      }
    },
  );

  server.registerTool(
    'get_daily_summary',
    {
      title: 'Get a day summary',
      description:
        'Totals for one local day: water, nutrition, activity, sleep, mood and medication. ' +
        'Defaults to today in the profile timezone.',
      inputSchema: z.object({ date: dayKeySchema.optional() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      try {
        return ok(await getDaySummary(userId, date));
      } catch (error) {
        return fail(error, 'Could not read that day.');
      }
    },
  );

  server.registerTool(
    'get_trends',
    {
      title: 'Get a metric over time',
      description:
        'A daily series for one metric. Days with no data are absent rather than zero — ' +
        'do not treat a gap as a logged zero.',
      inputSchema: z.object({
        metric: z.enum(TREND_METRICS),
        range: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30)
          .describe('Window in days.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ metric, range }) => {
      try {
        return ok(await getTrendSeries(userId, metric as TrendMetric, range));
      } catch (error) {
        return fail(error, 'Could not read that trend.');
      }
    },
  );

  server.registerTool(
    'list_medications',
    {
      title: 'List medications',
      description: 'Medications with their ids and schedules, for use with log_medication_taken.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return ok(await listMedications(userId));
      } catch (error) {
        return fail(error, 'Could not list medications.');
      }
    },
  );

  server.registerTool(
    'search_food',
    {
      title: 'Search foods',
      description:
        'Look up nutrition in USDA FoodData Central and Open Food Facts. Values are per 100 g ' +
        'unless a serving is given. Prefer verified results. Only the query term leaves the ' +
        'app — no personal data is sent.',
      inputSchema: z.object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, limit }) => {
      try {
        const response = await searchFoods(query, {
          limit,
          usdaApiKey: context.usdaApiKey,
        });
        return ok(response);
      } catch (error) {
        return fail(error, 'Food search is unavailable right now.');
      }
    },
  );

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  server.registerResource(
    'profile',
    'health://profile',
    {
      title: 'Profile',
      description: 'Profile, units, timezone and daily targets.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await getProfileSummary(userId), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'summary',
    new ResourceTemplate('health://summary/{date}', { list: undefined }),
    {
      title: 'Daily summary',
      description: 'Totals for one local day. Use a YYYY-MM-DD date, or "today".',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const raw = Array.isArray(variables.date) ? variables.date[0] : variables.date;
      const date = !raw || raw === 'today' ? undefined : String(raw);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await getDaySummary(userId, date), null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'logs',
    new ResourceTemplate('health://logs/{type}', { list: undefined }),
    {
      title: 'Raw logs',
      description:
        `Raw rows for one log type. Types: ${LOG_TYPES.join(', ')}. ` +
        'Add ?from=YYYY-MM-DD&to=YYYY-MM-DD to bound the range; defaults to the last 30 days.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const rawType = Array.isArray(variables.type) ? variables.type[0] : variables.type;
      const type = String(rawType) as LogType;
      if (!(LOG_TYPES as readonly string[]).includes(type)) {
        throw new OperationError(
          `Unknown log type "${rawType}". Use one of: ${LOG_TYPES.join(', ')}.`,
        );
      }

      const params = new URL(uri.href).searchParams;
      const today = new Date().toISOString().slice(0, 10);
      const defaultFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const from = params.get('from') ?? defaultFrom;
      const to = params.get('to') ?? today;

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await listLogs(userId, type, from, to), null, 2),
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Prompts
  // -------------------------------------------------------------------------

  server.registerPrompt(
    'weekly_review',
    {
      title: 'Weekly review',
      description: 'Walk through the last seven days and summarise what actually happened.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Review my last seven days using this tracker.\n\n' +
              '1. Call get_daily_summary for each of the last 7 days, and get_trends for steps, ' +
              'sleep, calories and mood over a 7-day range.\n' +
              '2. Summarise what actually happened: what I logged consistently, what I did not, ' +
              'and where the numbers moved.\n' +
              '3. Point out at most three patterns worth my attention, and say how many days each ' +
              'is based on.\n\n' +
              'Ground every statement in the logged numbers and say so when data is missing. ' +
              'These are my own self-reported logs, not clinical measurements: describe patterns, ' +
              'not diagnoses, and do not give medical advice.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'nutrition_gap_check',
    {
      title: 'Nutrition gap check',
      description: 'Compare recent intake against the targets on the profile.',
      argsSchema: {
        days: z.string().optional().describe('How many days to look at. Defaults to 14.'),
      },
    },
    ({ days }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Check my nutrition over the last ${days ?? 14} days.\n\n` +
              '1. Call get_profile for my calorie and macro targets.\n' +
              '2. Call get_trends for calories and protein over that range.\n' +
              '3. Compare what I actually ate against the targets, and note how many days had ' +
              'food logged at all — a low average means little if I only logged half the days.\n\n' +
              'Report the gap plainly and suggest food-level adjustments only if I ask. Do not ' +
              'recommend a calorie target of your own; mine is derived and deliberately capped ' +
              'to a healthy range.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'sleep_activity_correlation',
    {
      title: 'Sleep and activity correlation',
      description: 'Look for a relationship between sleep and how the following day went.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Look at how my sleep relates to my activity and mood.\n\n' +
              '1. Call get_trends for sleep, steps, active_minutes and mood over 30 days.\n' +
              '2. Line the series up by date and compare days after short sleep (under 6 hours) ' +
              'with days after 7 hours or more.\n' +
              '3. Only draw a comparison if each group has at least 5 days; otherwise say there ' +
              'is not enough data yet.\n\n' +
              'State the sample size for anything you claim. This is an observed pattern in my ' +
              'own logs — correlation over a handful of self-reported days, not evidence of ' +
              'cause, and not a clinical finding.',
          },
        },
      ],
    }),
  );

  return server;
}
