import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/server/workspace/workspace-manager';
import { BuildPipeline } from '@/server/pipeline';
import { BuildOptions, BuildResult, ProjectWorkspace } from '@/types/bundler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let workspace: ProjectWorkspace | null = null;
  let options: BuildOptions = {
    minify: true,
    sourceMap: false,
    target: 'es2022',
    maxAttempts: 5,
    enableAiPlanning: true,
    assetStrategy: 'inline_bytes',
  };
  let projectName = 'uploaded-project';
  let isStream = false;

  try {
    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);
    if (url.searchParams.get('stream') === 'true') {
      isStream = true;
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const nameField = formData.get('projectName');
      if (typeof nameField === 'string' && nameField.trim()) {
        projectName = nameField.trim();
      }

      if (formData.get('stream') === 'true') {
        isStream = true;
      }

      const optionsRaw = formData.get('options');
      if (typeof optionsRaw === 'string') {
        try {
          options = { ...options, ...JSON.parse(optionsRaw) };
        } catch {
          // Keep defaults
        }
      }

      const zipFile = formData.get('zipFile') as File | null;
      if (zipFile && zipFile.size > 0) {
        const arrayBuf = await zipFile.arrayBuffer();
        const zipBuffer = Buffer.from(arrayBuf);
        workspace = await WorkspaceManager.createFromZip(zipBuffer, projectName);
      } else {
        const rawFiles = formData.getAll('files') as File[];
        const rawPaths = formData.getAll('paths') as string[];

        if (rawFiles.length === 0) {
          return NextResponse.json(
            { error: 'No files or ZIP archive were provided in form data' },
            { status: 400 }
          );
        }

        const workspaceInputFiles: { path: string; rawBuffer: Buffer }[] = [];
        for (let i = 0; i < rawFiles.length; i++) {
          const file = rawFiles[i];
          const filePath = rawPaths[i] || file.name;
          const ab = await file.arrayBuffer();
          workspaceInputFiles.push({
            path: filePath,
            rawBuffer: Buffer.from(ab),
          });
        }

        workspace = await WorkspaceManager.createFromFiles(workspaceInputFiles, projectName);
      }
    } else {
      // JSON body
      const body = await req.json();
      if (body.projectName) {
        projectName = String(body.projectName);
      }
      if (body.options && typeof body.options === 'object') {
        options = { ...options, ...body.options };
      }
      if (body.stream === true) {
        isStream = true;
      }

      const files = body.files;
      if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json(
          { error: 'No project files provided in request payload' },
          { status: 400 }
        );
      }

      workspace = await WorkspaceManager.createFromFiles(files, projectName);
    }

    if (!workspace) {
      return NextResponse.json(
        { error: 'Failed to initialize workspace' },
        { status: 400 }
      );
    }

    const currentWorkspace = workspace;

    if (isStream) {
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const buildResult = await BuildPipeline.execute(
              currentWorkspace,
              options,
              (progressEvent) => {
                const sseData = `data: ${JSON.stringify({
                  type: 'progress',
                  data: progressEvent,
                })}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
            );

            const resultSse = `data: ${JSON.stringify({
              type: 'result',
              data: buildResult,
            })}\n\n`;
            controller.enqueue(encoder.encode(resultSse));
          } catch (err: any) {
            const errorMsg = err?.message || 'Build pipeline failed during execution';
            const failEvent = {
              step: 'failed' as const,
              message: errorMsg,
              timestamp: Date.now(),
            };

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'progress', data: failEvent })}\n\n`
              )
            );

            const fallbackResult: BuildResult = {
              success: false,
              workspaceId: currentWorkspace.id,
              errorSummary: {
                what: errorMsg,
                why: 'An unhandled error occurred during pipeline execution',
                canFixAutomatically: false,
              },
              diagnostics: [
                {
                  code: 'FATAL_PIPELINE_ERROR',
                  severity: 'error',
                  stage: 'system',
                  message: errorMsg,
                },
              ],
              workerJsCode: '',
              metadata: {
                esbuildVersion: '0.24.2',
                wranglerVersion: '3.107.3',
                nodeVersion: process.version,
                plannerVersion: 'autoforge-v2',
                buildTimestamp: Date.now(),
              },
              timeline: [failEvent],
              attempts: [],
              totalAttempts: 1,
              durationMs: 0,
            };

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'result', data: fallbackResult })}\n\n`
              )
            );
          } finally {
            if (currentWorkspace?.dirPath) {
              await WorkspaceManager.cleanup(currentWorkspace.dirPath);
            }
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Non-streaming response
    try {
      const buildResult = await BuildPipeline.execute(currentWorkspace, options);
      return NextResponse.json(buildResult);
    } finally {
      if (currentWorkspace?.dirPath) {
        await WorkspaceManager.cleanup(currentWorkspace.dirPath);
      }
    }
  } catch (err: any) {
    if (workspace && (workspace as any).dirPath) {
      await WorkspaceManager.cleanup((workspace as any).dirPath);
    }
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Server error during build initialization',
      },
      { status: 500 }
    );
  }
}
