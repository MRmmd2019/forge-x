import { NextRequest, NextResponse } from 'next/server';
import { WorkerPreviewRunner } from '@/server/preview/worker-preview-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const workerCode = payload.workerCode;
    
    let path = payload.path || '/';
    let method = payload.method || 'GET';
    const headers = payload.headers || {};
    const body = payload.body;
    const env = payload.env || {};

    // Handle nested request object if provided
    if (payload.request?.url) {
      try {
        const u = new URL(payload.request.url);
        path = u.pathname + u.search;
      } catch {
        path = payload.request.url;
      }
    }
    if (payload.request?.method) {
      method = payload.request.method;
    }

    if (!workerCode) {
      return NextResponse.json({ error: 'workerCode is required' }, { status: 400 });
    }

    const result = await WorkerPreviewRunner.simulateRequest({
      workerCode,
      path,
      method,
      headers,
      body,
      env,
      timeoutMs: 3000,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Worker preview execution failed',
      },
      { status: 500 }
    );
  }
}
