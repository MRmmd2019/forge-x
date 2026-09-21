import EventEmitter from 'events';
import { ChildProcess } from 'child_process';
import {
  BuildOptions,
  BuildResult,
  NormalizedDiagnostic,
  PipelineProgressEvent,
  ProjectWorkspace,
} from '@/types/bundler';
import { BuildPipeline } from '@/server/pipeline';
import { WorkspaceManager } from '@/server/workspace/workspace-manager';

export type BuildJobStatus = 'queued' | 'running' | 'cancelled' | 'failed' | 'success';

export type BuildJobStage =
  | 'workspace'
  | 'scan'
  | 'detect'
  | 'parse'
  | 'graph'
  | 'resolve'
  | 'plan'
  | 'build'
  | 'assets'
  | 'assemble'
  | 'inspect'
  | 'wrangler'
  | 'smoke_test'
  | 'self_containment'
  | 'complete';

export interface BuildJobEvent {
  id: string;
  jobId: string;
  type: 'stage-start' | 'stage-progress' | 'stage-complete' | 'warning' | 'diagnostic' | 'log' | 'complete' | 'error';
  stage: string;
  timestamp: string;
  data: unknown;
}

export interface BuildJob {
  id: string;
  status: BuildJobStatus;
  stage: BuildJobStage;
  startedAt: string;
  finishedAt?: string;
  workspaceId: string;
  progress: number;
  result?: BuildResult;
  error?: string;
  events: BuildJobEvent[];
  diagnostics: NormalizedDiagnostic[];
}

class JobManagerService {
  private jobs: Map<string, BuildJob> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private childProcesses: Map<string, Set<ChildProcess>> = new Map();
  private eventEmitters: Map<string, EventEmitter> = new Map();

  public createJob(workspaceId: string): BuildJob {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: BuildJob = {
      id,
      status: 'queued',
      stage: 'workspace',
      startedAt: new Date().toISOString(),
      workspaceId,
      progress: 0,
      events: [],
      diagnostics: [],
    };

    this.jobs.set(id, job);
    this.abortControllers.set(id, new AbortController());
    this.childProcesses.set(id, new Set());
    this.eventEmitters.set(id, new EventEmitter());

    return job;
  }

  public getJob(id: string): BuildJob | undefined {
    return this.jobs.get(id);
  }

  public registerChildProcess(jobId: string, proc: ChildProcess) {
    const set = this.childProcesses.get(jobId);
    if (set) {
      set.add(proc);
      proc.once('exit', () => set.delete(proc));
    }
  }

  public subscribe(jobId: string, listener: (event: BuildJobEvent) => void): () => void {
    const emitter = this.eventEmitters.get(jobId);
    if (!emitter) return () => {};
    emitter.on('event', listener);
    return () => emitter.off('event', listener);
  }

  public emitEvent(jobId: string, event: Omit<BuildJobEvent, 'id' | 'jobId' | 'timestamp'>) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const fullEvent: BuildJobEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      jobId,
      timestamp: new Date().toISOString(),
    };

    job.events.push(fullEvent);
    const emitter = this.eventEmitters.get(jobId);
    if (emitter) {
      emitter.emit('event', fullEvent);
    }
  }

  public async runJob(
    jobId: string,
    workspace: ProjectWorkspace,
    options?: BuildOptions
  ): Promise<BuildResult> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const controller = this.abortControllers.get(jobId) || new AbortController();
    job.status = 'running';
    job.progress = 5;

    this.emitEvent(jobId, {
      type: 'stage-start',
      stage: 'workspace',
      data: { message: 'Workspace initialized' },
    });

    try {
      const result = await BuildPipeline.execute(
        workspace,
        {
          ...options,
          abortSignal: controller.signal,
        },
        (progress: PipelineProgressEvent) => {
          if (controller.signal.aborted) return;

          // Map pipeline progress step to stage
          const stageMap: Record<string, { stage: BuildJobStage; progress: number }> = {
            workspace_ready: { stage: 'workspace', progress: 10 },
            scanned: { stage: 'scan', progress: 20 },
            analyzed: { stage: 'detect', progress: 35 },
            planned: { stage: 'plan', progress: 50 },
            validated: { stage: 'build', progress: 60 },
            building: { stage: 'build', progress: 70 },
            assets_embedded: { stage: 'assets', progress: 80 },
            inspected: { stage: 'inspect', progress: 85 },
            wrangler_validated: { stage: 'wrangler', progress: 90 },
            smoke_tested: { stage: 'smoke_test', progress: 95 },
            completed: { stage: 'complete', progress: 100 },
          };

          const mapped = stageMap[progress.step] || { stage: 'build', progress: job.progress };
          job.stage = mapped.stage;
          job.progress = mapped.progress;

          this.emitEvent(jobId, {
            type: 'stage-progress',
            stage: mapped.stage,
            data: { message: progress.message, detail: progress.detail },
          });
        }
      );

      if (controller.signal.aborted) {
        job.status = 'cancelled';
        job.finishedAt = new Date().toISOString();
        this.emitEvent(jobId, {
          type: 'complete',
          stage: 'complete',
          data: { message: 'Job was cancelled by user' },
        });
        return result;
      }

      job.status = result.success ? 'success' : 'failed';
      job.result = result;
      job.finishedAt = new Date().toISOString();
      job.diagnostics = result.diagnostics || [];
      job.progress = 100;

      this.emitEvent(jobId, {
        type: result.success ? 'complete' : 'error',
        stage: 'complete',
        data: { success: result.success, diagnostics: result.diagnostics },
      });

      return result;
    } catch (err: any) {
      if (controller.signal.aborted) {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = err.message;
      }
      job.finishedAt = new Date().toISOString();

      this.emitEvent(jobId, {
        type: 'error',
        stage: job.stage,
        data: { message: err.message },
      });

      throw err;
    }
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status !== 'running' && job.status !== 'queued') {
      return false;
    }

    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();

    // Abort controller
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }

    // Terminate any registered child processes
    const procs = this.childProcesses.get(jobId);
    if (procs) {
      for (const p of procs) {
        try {
          p.kill('SIGTERM');
        } catch {
          // Ignore process kill error
        }
      }
      procs.clear();
    }

    this.emitEvent(jobId, {
      type: 'complete',
      stage: job.stage,
      data: { message: 'Build cancelled by user' },
    });

    return true;
  }
}

const globalForJobs = globalThis as unknown as { __jobManager?: JobManagerService };
export const JobManager = globalForJobs.__jobManager || (globalForJobs.__jobManager = new JobManagerService());
