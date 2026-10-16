import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/server/workspace/workspace-manager';
import { BuildPipeline } from '@/server/pipeline';
import { BuildOptions, ProjectWorkspace } from '@/types/bundler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const streamParam = url.searchParams.get('stream') === 'true';

  let workspace: ProjectWorkspace | null = null;
  let options: BuildOptions = {
    minify: true,
    sourceMap: false,
    target: 'es2022',
    maxAttempts: 5,
    enableAiPlanning: true,
    assetStrategy: 'inline_bytes',
  };
  let shouldStream = streamParam;

  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const zipFile = formData.get('zipFile') as File | null;
      const projectName = (formData.get('projectName') as string) || 'uploaded-project';
      const formStream = formData.get('stream');
      if (formStream === 'true') shouldStream = true;

      const rawOptions = formData.get('options');
      if (typeof rawOptions === 'string') {
        try {
          options = { ...options, ...JSON.parse(rawOptions) };
        } catch {
          // ignore parse error, use default options
        }
      }

      if (zipFile) {
        const arrayBuffer = await zipFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        workspace = await WorkspaceManager.createFromZip(buffer, projectName);
      } else {
        const files = formData.getAll('files') as File[];
        const paths = formData.getAll('paths') as string[];

        if (files.length === 0) {
          return NextResponse.json(
            { error: 'No files or zip uploaded.' },
            { status: 400 }
          );
        }

        const fileItems: { path: string; rawBuffer?: Buffer; content?: string }[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const relPath = paths[i] || file.name;
          const ab = await file.arrayBuffer();
          const buf = Buffer.from(ab);
          fileItems.push({
            path: relPath,
            rawBuffer: buf,
          });
        }

        workspace = await WorkspaceManager.createFromFiles(fileItems, projectName);
      }
    } else {
      // JSON body
      const body = await req.json();
      const projectName = body.projectName || 'project';
      if (body.stream === true) shouldStream = true;
      if (body.options) {
        options = { ...options, ...body.options };
      }

      if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
        return NextResponse.json(
          { error: 'No files provided in request body.' },
          { status: 400 }
        );
      }

      workspace = await WorkspaceManager.createFromFiles(body.files, projectName);
    }

    if (!workspace) {
      return NextResponse.json(
        { error: 'Failed to initialize project workspace.' },
        { status: 400 }
      );
    }

    if (!shouldStream) {
      try {
        const result = await BuildPipeline.execute(workspace, options);
        return NextResponse.json(result);
      } finally {
        if (workspace?.dirPath) {
          await WorkspaceManager.cleanup(workspace.dirPath).catch(() => {});
        }
      }
    }

    // Stream response using SSE
    const activeWorkspace = workspace;
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (type: string, data: any) => {
          try {
            const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch {
            // controller might be closed
          }
        };

        try {
          const result = await BuildPipeline.execute(
            activeWorkspace,
            options,
            (progressEvent) => {
              sendEvent('progress', progressEvent);
            }
          );
          sendEvent('result', result);
        } catch (err: any) {
          sendEvent('error', { message: err?.message || 'Pipeline execution failed' });
        } finally {
          if (activeWorkspace?.dirPath) {
            await WorkspaceManager.cleanup(activeWorkspace.dirPath).catch(() => {});
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    if (workspace?.dirPath) {
      await WorkspaceManager.cleanup(workspace.dirPath).catch(() => {});
    }
    return NextResponse.json(
      { error: err?.message || 'Build request processing failed' },
      { status: 500 }
    );
  }
}
