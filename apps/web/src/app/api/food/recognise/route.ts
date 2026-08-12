import { profiles } from '@tmh/db';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  recogniseFoodPhoto,
  resolveCandidates,
  VisionError,
} from '@tmh/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { queryAsUser, getCurrentUser } from '@/lib/auth';

/**
 * Identify foods in a photograph.
 *
 * Two independent switches must both be on before an image leaves the server:
 * the deployment must have a provider key, and the signed-in user must have
 * opted in. Either one off means barcode scanning only.
 *
 * The image is never persisted. It exists as a request body and a base64
 * string in memory for the duration of the call.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Recognition plus catalogue lookups; comfortably inside Vercel's ceiling.
export const maxDuration = 30;

const bodySchema = z.object({
  /** Raw base64, no data-URL prefix. */
  imageBase64: z.string().min(64),
  mimeType: z.enum(ACCEPTED_IMAGE_TYPES),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Photo recognition is not enabled on this deployment.',
        code: 'not_configured',
      },
      { status: 503 },
    );
  }

  const optedIn = await queryAsUser(async (db) => {
    const [row] = await db
      .select({ enabled: profiles.photoRecognitionEnabled })
      .from(profiles)
      .limit(1);
    return row?.enabled ?? false;
  });

  if (!optedIn) {
    return NextResponse.json(
      {
        error: 'Photo recognition is off for your account. Turn it on in Settings first.',
        code: 'not_opted_in',
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'That image could not be read.' },
      { status: 400 },
    );
  }

  // base64 inflates by ~4/3; check the decoded size.
  const approximateBytes = Math.floor((parsed.data.imageBase64.length * 3) / 4);
  if (approximateBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'That image is too large. The app should have shrunk it before sending.' },
      { status: 413 },
    );
  }

  try {
    const result = await recogniseFoodPhoto(parsed.data.imageBase64, parsed.data.mimeType, {
      apiKey,
      model: process.env.GEMINI_MODEL,
    });

    if (result.unableToIdentify || result.items.length === 0) {
      return NextResponse.json({ candidates: [], unableToIdentify: true });
    }

    // Nutrition comes from the catalogues wherever a match exists; the model's
    // own figures are only a labelled fallback.
    const candidates = await resolveCandidates(result.items, {
      usdaApiKey: process.env.USDA_API_KEY,
    });

    return NextResponse.json({ candidates, unableToIdentify: false });
  } catch (error) {
    if (error instanceof VisionError) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable },
        { status: error.retryable ? 503 : 400 },
      );
    }
    console.error('Photo recognition failed', error);
    return NextResponse.json({ error: 'Could not read that photo.' }, { status: 500 });
  }
}
