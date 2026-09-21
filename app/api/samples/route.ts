import { NextResponse } from 'next/server';
import { SAMPLE_PROJECTS } from '@/server/samples/sample-projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(SAMPLE_PROJECTS);
}
