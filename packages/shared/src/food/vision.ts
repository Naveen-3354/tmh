/**
 * Food recognition from a photo.
 *
 * PRIVACY: this is the one place in the app that sends something richer than a
 * query term to a third party, and it is a deliberate, documented exception to
 * brief §8. It only ever runs when
 *
 *   1. the deployment has a provider key configured, and
 *   2. the user has explicitly opted in (profiles.photo_recognition_enabled).
 *
 * The image is held in memory, sent, and discarded. It is never written to the
 * database, never stored on disk, and no log row references it.
 *
 * ACCURACY: the model is asked to identify foods and estimate portions — the
 * things it is genuinely good at. It is *not* trusted for nutrition numbers.
 * Those are looked up afterwards in USDA/Open Food Facts and scaled to the
 * estimated portion, so a logged entry carries verified data wherever a match
 * exists (RESEARCH.md D2). The model's own figures are a labelled fallback.
 */

import { z } from 'zod';

import { scaleNutrition, type NutritionFacts } from '../calc/macros';
import { searchFoods } from './search';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Overridable, because model names change faster than this code will. */
export const DEFAULT_VISION_MODEL = 'gemini-2.5-flash';

/** Largest image we will send. The client downscales before upload. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const recognisedItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  portionGrams: z.number().min(1).max(5000),
  confidence: z.enum(['high', 'medium', 'low']),
  perHundredGrams: z.object({
    calories: z.number().min(0).max(1000),
    proteinG: z.number().min(0).max(100),
    carbsG: z.number().min(0).max(100),
    fatG: z.number().min(0).max(100),
    fiberG: z.number().min(0).max(100),
    sugarG: z.number().min(0).max(100),
    sodiumMg: z.number().min(0).max(20_000),
  }),
});

export type RecognisedItem = z.infer<typeof recognisedItemSchema>;

export const recognitionResultSchema = z.object({
  items: z.array(recognisedItemSchema).max(8),
  /** Set when the picture is not food, or is too unclear to read. */
  unableToIdentify: z.boolean().default(false),
});

export type RecognitionResult = z.infer<typeof recognitionResultSchema>;

/** Thrown for anything the caller can act on. Never carries the API key. */
export class VisionError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'VisionError';
  }
}

const PROMPT = `You are identifying food in a photograph for a personal health log.

Return every distinct food or drink you can see. For each one:
- "name": a short, searchable name. Prefer a plain generic term over a
  description — "grilled chicken breast", not "a piece of chicken that looks
  grilled". No brand names unless clearly legible on packaging.
- "portionGrams": your best estimate of the edible weight in grams, using
  visible references such as plate and cutlery size.
- "confidence": "high" if you are sure what the food is, "medium" if it is a
  reasonable guess, "low" if you are unsure.
- "perHundredGrams": typical nutrition for that food per 100 g.

Rules:
- Count each food once. Do not list ingredients of a composite dish separately
  unless they are plainly distinct on the plate.
- Ignore anything that is not food or drink.
- If the photo contains no identifiable food, set "unableToIdentify" to true and
  return an empty items array.
- Never guess a specific brand or a packaged product's exact recipe.`;

/** Response schema handed to Gemini so it returns parseable JSON. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          portionGrams: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          perHundredGrams: {
            type: 'OBJECT',
            properties: {
              calories: { type: 'NUMBER' },
              proteinG: { type: 'NUMBER' },
              carbsG: { type: 'NUMBER' },
              fatG: { type: 'NUMBER' },
              fiberG: { type: 'NUMBER' },
              sugarG: { type: 'NUMBER' },
              sodiumMg: { type: 'NUMBER' },
            },
            required: ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg'],
          },
        },
        required: ['name', 'portionGrams', 'confidence', 'perHundredGrams'],
      },
    },
    unableToIdentify: { type: 'BOOLEAN' },
  },
  required: ['items', 'unableToIdentify'],
} as const;

export interface RecogniseOptions {
  apiKey: string;
  model?: string | undefined;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Identify foods in a photograph.
 *
 * @param imageBase64 raw base64, no data-URL prefix.
 */
export async function recogniseFoodPhoto(
  imageBase64: string,
  mimeType: string,
  options: RecogniseOptions,
): Promise<RecognitionResult> {
  if (!options.apiKey) {
    throw new VisionError('Photo recognition is not configured on this deployment.');
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw new VisionError('That image format is not supported. Use JPEG, PNG or WebP.');
  }

  const model = options.model || DEFAULT_VISION_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than a query parameter, so the key cannot end up in
        // an access log or a redirect chain.
        'x-goog-api-key': options.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new VisionError('Recognition timed out. Try again.', true);
    }
    throw new VisionError('Could not reach the recognition service.', true);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Surface the provider's own message — a wrong model name or an expired
    // key is otherwise indistinguishable from "it just does not work".
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* non-JSON error body */
    }

    if (response.status === 429) {
      throw new VisionError('Recognition is rate limited right now. Try again shortly.', true);
    }
    if (response.status === 400 || response.status === 403) {
      throw new VisionError(`Recognition rejected the request: ${detail || response.statusText}`);
    }
    throw new VisionError('The recognition service is unavailable right now.', true);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new VisionError('Recognition returned nothing usable.', true);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VisionError('Recognition returned malformed data.', true);
  }

  const result = recognitionResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new VisionError('Recognition returned data in an unexpected shape.', true);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Turning a recognition into something loggable
// ---------------------------------------------------------------------------

export interface PhotoCandidate {
  /** What the user sees and what gets logged. */
  name: string;
  portionGrams: number;
  confidence: 'high' | 'medium' | 'low';
  /**
   * Where the nutrition figures came from. Surfaced in the UI so a model
   * estimate is never mistaken for laboratory data.
   */
  nutritionSource: 'usda' | 'open_food_facts' | 'estimated';
  /** The catalogue entry matched, when the numbers are not estimated. */
  matchedName?: string;
  /** Already scaled to portionGrams. */
  nutrition: NutritionFacts;
}

/**
 * Replace the model's nutrition guesses with catalogue data where possible.
 *
 * The model is good at "that is a banana, about 120 g" and unreliable at "a
 * banana has 89 kcal per 100 g". So each recognised name is looked up, and a
 * confident match wins; otherwise the estimate is kept and labelled as such.
 *
 * Lookups are best-effort: a catalogue outage degrades to estimated figures
 * rather than failing the whole recognition.
 */
export async function resolveCandidates(
  items: readonly RecognisedItem[],
  options: { usdaApiKey?: string | undefined; signal?: AbortSignal } = {},
): Promise<PhotoCandidate[]> {
  return Promise.all(
    items.map(async (item): Promise<PhotoCandidate> => {
      const multiplier = item.portionGrams / 100;
      const fallback: PhotoCandidate = {
        name: item.name,
        portionGrams: item.portionGrams,
        confidence: item.confidence,
        nutritionSource: 'estimated',
        nutrition: scaleNutrition(item.perHundredGrams, multiplier),
      };

      try {
        const { results } = await searchFoods(item.name, {
          limit: 5,
          ...(options.usdaApiKey ? { usdaApiKey: options.usdaApiKey } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });

        // rankResults already puts usable, verified rows first.
        const match = results.find((candidate) => candidate.nutrition.calories > 0);
        if (!match) return fallback;

        return {
          name: item.name,
          portionGrams: item.portionGrams,
          confidence: item.confidence,
          nutritionSource: match.source,
          matchedName: match.brand ? `${match.name} (${match.brand})` : match.name,
          nutrition: scaleNutrition(match.nutrition, multiplier),
        };
      } catch {
        return fallback;
      }
    }),
  );
}
