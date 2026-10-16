import { NextRequest, NextResponse } from 'next/server';
import { ObfuscatorService } from '@/server/obfuscator/obfuscator-service';
import { BASE_DEFAULT_OPTIONS } from '@/lib/obfuscator-presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = body.code;
    const userOptions = body.options || {};

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Field "code" is required and must be a valid JavaScript or HTML string.' },
        { status: 400 }
      );
    }

    const mergedOptions = {
      ...BASE_DEFAULT_OPTIONS,
      ...userOptions,
    };

    const result = await ObfuscatorService.obfuscate(code, mergedOptions);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to obfuscate code.',
          stats: result.stats,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error during obfuscation.' },
      { status: 500 }
    );
  }
}
