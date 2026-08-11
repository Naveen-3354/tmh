import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { bundleToCsv, buildExportBundle } from '@/lib/export';

/**
 * Full data export as JSON or CSV.
 *
 * Deliberately a plain GET so it works from a link, a script or curl — the
 * point of data ownership is that it does not require our UI.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const bundle = await buildExportBundle();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return new NextResponse(bundleToCsv(bundle), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tmh-export-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tmh-export-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
