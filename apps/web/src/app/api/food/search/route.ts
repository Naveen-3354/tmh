import { lookupBarcode, searchFoods } from '@tmh/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';

/**
 * Food lookup proxy.
 *
 * Proxied through the server for three reasons: the USDA key stays private,
 * the catalogues see one origin rather than every user's browser, and
 * responses are cacheable across users because the query carries nothing
 * personal (brief §8 — query terms only, never health data).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authenticated only. Not because the data is sensitive, but so the endpoint
  // cannot be used as an open proxy against the public catalogues.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get('barcode');

  if (barcode) {
    const product = await lookupBarcode(barcode);
    return NextResponse.json(
      { results: product ? [product] : [], degraded: [] },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  }

  const query = searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) {
    return NextResponse.json({ results: [], degraded: [] });
  }

  const response = await searchFoods(query, {
    limit: 15,
    usdaApiKey: process.env.USDA_API_KEY,
  });

  return NextResponse.json(response, {
    // Identical queries from any user return identical results.
    headers: { 'Cache-Control': 'private, max-age=600' },
  });
}
