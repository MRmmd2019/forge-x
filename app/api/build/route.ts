import { NextRequest, NextResponse } from 'next/server';
import { BuildPipeline } from '@/server/pipeline';
import { WorkspaceManager } from '@/server/workspace/workspace-manager';
import { BuildOptions, BuildResult, ProjectWorkspace } from '@/types/bundler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow sufficient time for large builds

export async function POST(req: NextRequest) {
  const isStreaming =
    req.nextUrl.searchParams.get('stream') === 'true' ||
    req.headers.get('accept')?.includes('text/event-stream');

  let workspace: ProjectWorkspace | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    let projectName = 'uploaded-project';
    let options: BuildOptions = {
      minify: true,
      sourceMap: false,
      target: 'es2022',
      maxAttempts: 5,
      enableAiPlanning: true,
      assetStrategy: 'inline_bytes',
    };

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      if (formData.has('projectName')) {
        projectName = (formData.get('projectName') as string) || projectName;
      }
      if (formData.has('options')) {
        try {
          options = { ...options, ...JSON.parse(formData.get('options') as string) };
        } catch {
          // ignore JSON parse error on options
        }
      }

      const zipFile = formData.get('zipFile') as File | null;
      if (zipFile) {
        const zipArrayBuffer = await zipFile.arrayBuffer();
        const zipBuffer = Buffer.from(zipArrayBuffer);
        workspace = await WorkspaceManager.createFromZip(zipBuffer, projectName);
      } else {
        const files = formData.getAll('files') as File[];
        const paths = formData.getAll('paths') as string[];

        if (files.length === 0) {
          return NextResponse.json(
            { success: false, error: 'No files provided in form data.' },
            { status: 400 }
          );
        }

        const uploadedFiles: { path: string; rawBuffer: Buffer }[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const rawPath = paths[i] || file.name;
          const arrayBuffer = await file.arrayBuffer();
          uploadedFiles.push({
            path: rawPath,
            rawBuffer: Buffer.from(arrayBuffer),
          });
        }

        workspace = await WorkspaceManager.createFromFiles(uploadedFiles, projectName);
      }
    } else {
      // JSON body
      const body = await req.json();
      projectName = body.projectName || projectName;
      if (body.options) {
        options = { ...options, ...body.options };
      }

      if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No files provided for build.' },
          { status: 400 }
        );
      }

      workspace = await WorkspaceManager.createFromFiles(body.files, projectName);
    }

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Failed to initialize project workspace.' },
        { status: 400 }
      );
    }

    if (isStreaming) {
      const activeWorkspace = workspace;
      const encoder = new TextEncoder();
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();

      const sendEvent = async (type: string, data: any) => {
        try {
          const payload = JSON.stringify({ type, data });
          await writer.write(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // Stream writer might be closed if client disconnected
        }
      };

      // Run pipeline asynchronously in background and pipe events to stream
      (async () => {
        try {
          const result: BuildResult = await BuildPipeline.execute(
            activeWorkspace,
            options,
            async (event) => {
              await sendEvent('progress', event);
            }
          );
          await sendEvent('result', result);
        } catch (err: any) {
          await sendEvent('error', {
            message: err.message || 'Build pipeline execution failed',
          });
        } finally {
          try {
            await WorkspaceManager.cleanup(activeWorkspace.dirPath);
          } catch {}
          try {
            await writer.close();
          } catch {}
        }
      })();

      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } else {
      // Non-streaming JSON response
      try {
        const result: BuildResult = await BuildPipeline.execute(workspace, options);
        return NextResponse.json(result);
      } finally {
        if (workspace) {
          await WorkspaceManager.cleanup(workspace.dirPath);
        }
      }
    }
  } catch (err: any) {
    if (workspace) {
      try {
        await WorkspaceManager.cleanup((workspace as ProjectWorkspace).dirPath);
      } catch {}
    }

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Build request processing failed',
      },
      { status: 400 }
    );
  }
}
