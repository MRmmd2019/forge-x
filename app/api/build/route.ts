import { NextResponse } from 'next/server';
import { WorkspaceManager } from '@/server/workspace/workspace-manager';
import { BuildPipeline } from '@/server/pipeline';
import { BuildOptions, PipelineProgressEvent } from '@/types/bundler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max build duration

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const contentType = req.headers.get('content-type') || '';
    let isStream = url.searchParams.get('stream') === 'true';

    let projectName = 'uploaded-project';
    let options: BuildOptions = {
      minify: true,
      sourceMap: false,
      target: 'es2022',
      maxAttempts: 5,
      enableAiPlanning: true,
      assetStrategy: 'inline_bytes',
    };
    let workspacePromise: Promise<any>;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const zipFile = formData.get('zipFile') as File | null;
      const optStr = formData.get('options') as string | null;
      const projName = formData.get('projectName') as string | null;
      const streamParam = formData.get('stream') as string | null;

      if (streamParam === 'true') isStream = true;
      if (projName) projectName = projName;
      if (optStr) {
        try {
          options = { ...options, ...JSON.parse(optStr) };
        } catch {
          // fallback
        }
      }

      if (zipFile) {
        const arrayBuf = await zipFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        workspacePromise = WorkspaceManager.createFromZip(buffer, projectName);
      } else {
        const files = formData.getAll('files') as File[];
        const paths = formData.getAll('paths') as string[];

        const uploadedFiles: { path: string; rawBuffer?: Buffer; content?: string }[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const pathStr = paths[i] || file.name;
          const arrayBuf = await file.arrayBuffer();
          uploadedFiles.push({
            path: pathStr,
            rawBuffer: Buffer.from(arrayBuf),
          });
        }
        workspacePromise = WorkspaceManager.createFromFiles(uploadedFiles, projectName);
      }
    } else {
      const body = await req.json();
      if (body.stream === true) isStream = true;
      if (body.projectName) projectName = body.projectName;
      if (body.options) options = { ...options, ...body.options };

      const files = body.files || [];
      const uploadedFiles = files.map((f: any) => ({
        path: f.path,
        content: f.content,
        bufferBase64: f.bufferBase64,
      }));
      workspacePromise = WorkspaceManager.createFromFiles(uploadedFiles, projectName);
    }

    if (!isStream) {
      const workspace = await workspacePromise;
      const buildResult = await BuildPipeline.execute(workspace, options);
      return NextResponse.json(buildResult);
    }

    // Stream response using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: 'progress' | 'result', data: any) => {
          try {
            const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch {
            // controller might be closed
          }
        };

        try {
          sendEvent('progress', {
            step: 'init',
            message: `Connecting workspace for "${projectName}"...`,
            timestamp: Date.now(),
          });

          const workspace = await workspacePromise;

          const buildResult = await BuildPipeline.execute(
            workspace,
            options,
            (progress: PipelineProgressEvent) => {
              sendEvent('progress', progress);
            }
          );

          sendEvent('result', buildResult);
          controller.close();
        } catch (err: any) {
          sendEvent('progress', {
            step: 'failed',
            message: err?.message || 'Pipeline build failed.',
            timestamp: Date.now(),
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error during build setup' },
      { status: 500 }
    );
  }
}
