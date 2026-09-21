import { NextResponse } from 'next/server';
import { HardeningTestSuite, HardeningSuiteReport } from '@/server/testing/hardening-suite';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Module-level in-flight deduplication and report cache
let cachedReport: HardeningSuiteReport | null = null;
let inFlightRun: Promise<HardeningSuiteReport> | null = null;

async function executeSuite(forceFresh = false): Promise<HardeningSuiteReport> {
  if (!forceFresh && cachedReport) {
    return cachedReport;
  }

  if (inFlightRun) {
    return inFlightRun;
  }

  inFlightRun = HardeningTestSuite.runAll()
    .then(report => {
      cachedReport = report;
      return report;
    })
    .finally(() => {
      inFlightRun = null;
    });

  return inFlightRun;
}

export async function POST(req: Request) {
  try {
    let forceFresh = true;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get('cached') === 'true') {
        forceFresh = false;
      }
    } catch {
      // URL parsing fallback
    }

    const report = await executeSuite(forceFresh);
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to execute hardening suite' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    let forceFresh = false;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get('fresh') === 'true') {
        forceFresh = true;
      }
    } catch {
      // URL parsing fallback
    }

    const report = await executeSuite(forceFresh);
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to execute hardening suite' },
      { status: 500 }
    );
  }
}
