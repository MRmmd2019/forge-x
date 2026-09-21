'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  Terminal,
  Globe,
  FileCode,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Boxes,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { ConfigModal } from '@/components/ConfigModal';
import { HardeningSuiteModal } from '@/components/HardeningSuiteModal';
import { ProjectUploader } from '@/components/ProjectUploader';
import { ProjectSummaryCard } from '@/components/ProjectSummaryCard';
import { ProjectTreePreview } from '@/components/ProjectTreePreview';
import { PipelineStepper } from '@/components/PipelineStepper';
import { BuildPlanCard } from '@/components/BuildPlanCard';
import { ResultCard } from '@/components/ResultCard';
import { BundleInspectorCard } from '@/components/BundleInspectorCard';
import { WorkerPreviewTab } from '@/components/WorkerPreviewTab';
import { WorkerCodeViewer } from '@/components/WorkerCodeViewer';
import { BuildLogs } from '@/components/BuildLogs';
import { PipelineDiagnosticsView } from '@/components/PipelineDiagnosticsView';
import {
  BuildOptions,
  BuildResult,
  PipelineProgressEvent,
  SampleProject,
} from '@/types/bundler';
import { SAMPLE_PROJECTS } from '@/server/samples/sample-projects';

export default function Page() {
  const [options, setOptions] = useState<BuildOptions>({
    minify: true,
    sourceMap: false,
    target: 'es2022',
    maxAttempts: 5,
    enableAiPlanning: true,
    assetStrategy: 'inline_bytes',
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHardeningOpen, setIsHardeningOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [samples, setSamples] = useState<SampleProject[]>(SAMPLE_PROJECTS);

  // Project state
  const [projectName, setProjectName] = useState<string>('sample-project');
  const [selectedZip, setSelectedZip] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ file?: File; path: string; content?: string }[]>([]);
  const [filesDisplay, setFilesDisplay] = useState<{ path: string; size?: number; content?: string }[]>([]);

  // Build execution state
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<PipelineProgressEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'logs' | 'diagnostics' | 'inspector' | 'preview' | 'code'>('logs');
  const abortControllerRef = useRef<AbortController | null>(null);

  const getByteLength = (str?: string) => {
    if (!str) return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return str.length;
  };

  const handleSampleSelect = useCallback((sample: SampleProject) => {
    setSelectedZip(null);
    setSelectedFiles(sample.files);
    setProjectName(sample.name);
    setFilesDisplay(
      sample.files.map(f => ({
        path: f.path,
        size: getByteLength(f.content),
        content: f.content,
      }))
    );
    setBuildResult(null);
    setLiveTimeline([]);
  }, []);

  // Fetch sample projects on mount
  useEffect(() => {
    fetch('/api/samples')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSamples(data);
          handleSampleSelect(data[0]);
        }
      })
      .catch(() => {
        handleSampleSelect(SAMPLE_PROJECTS[0]);
      });
  }, [handleSampleSelect]);

  const handleZipSelect = (file: File) => {
    setSelectedZip(file);
    setSelectedFiles([]);
    setProjectName(file.name.replace(/\.[^/.]+$/, ''));
    setFilesDisplay([{ path: file.name, size: file.size }]);
    setBuildResult(null);
    setLiveTimeline([]);
  };

  const handleFilesSelect = (items: { file: File; path: string }[], projName: string) => {
    setSelectedZip(null);
    setSelectedFiles(items);
    setProjectName(projName);
    setFilesDisplay(items.map(i => ({ path: i.path, size: i.file.size })));
    setBuildResult(null);
    setLiveTimeline([]);
  };

  const handleResetWorkspace = () => {
    setSelectedZip(null);
    setSelectedFiles([]);
    setFilesDisplay([]);
    setProjectName('');
    setBuildResult(null);
    setLiveTimeline([]);
  };

  const handleCancelBuild = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsBuilding(false);
    setLiveTimeline(prev => [
      ...prev,
      {
        step: 'failed',
        message: 'Build cancelled by user.',
        timestamp: Date.now(),
      },
    ]);
  };

  const runBuild = useCallback(async () => {
    if (isBuilding || (!selectedZip && selectedFiles.length === 0)) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsBuilding(true);
    setBuildResult(null);
    // Switch to logs so user immediately sees live build output
    setActiveTab('logs');
    setLiveTimeline([
      {
        step: 'workspace_ready',
        message: `Connecting workspace for "${projectName || 'project'}"...`,
        timestamp: Date.now(),
      },
    ]);

    try {
      if (selectedFiles.length > 500) {
        throw new Error(`Project contains ${selectedFiles.length} files, which exceeds the safe compiler limit (500 files). Please exclude node_modules, build artifacts, or large media assets.`);
      }
      if (selectedZip && selectedZip.size > 30 * 1024 * 1024) {
        throw new Error(`ZIP archive (${(selectedZip.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 30MB server limit. Please exclude node_modules or build directories before archiving.`);
      }

      let response: Response;

      if (selectedZip) {
        const formData = new FormData();
        formData.append('zipFile', selectedZip);
        formData.append('projectName', projectName || 'uploaded-project');
        formData.append('stream', 'true');
        formData.append('options', JSON.stringify(options));

        response = await fetch('/api/build?stream=true', {
          method: 'POST',
          headers: { Accept: 'text/event-stream' },
          body: formData,
          signal: controller.signal,
        });
      } else if (selectedFiles.length > 0 && (selectedFiles[0] as any).file) {
        const formData = new FormData();
        formData.append('projectName', projectName || 'uploaded-project');
        formData.append('stream', 'true');
        formData.append('options', JSON.stringify(options));

        for (const item of selectedFiles as any[]) {
          if (item.file) {
            formData.append('files', item.file);
            formData.append('paths', item.path);
          }
        }

        response = await fetch('/api/build?stream=true', {
          method: 'POST',
          headers: { Accept: 'text/event-stream' },
          body: formData,
          signal: controller.signal,
        });
      } else {
        response = await fetch('/api/build?stream=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            projectName: projectName || 'project',
            files: selectedFiles,
            options,
            stream: true,
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = `Server error ${response.status} (${response.statusText || 'Build request failed'})`;
        try {
          if (contentType.includes('application/json')) {
            const errJson = await response.json();
            errorMsg = errJson.error || errJson.message || errorMsg;
          } else {
            const errText = await response.text();
            if (
              errText.includes('Starting Server') ||
              errText.includes('warmup.html') ||
              errText.includes('502 Bad Gateway') ||
              errText.includes('504 Gateway')
            ) {
              errorMsg = 'Build compiler is currently warming up or restarting. Please wait a few moments and try again.';
            } else {
              const titleMatch = errText.match(/<title>([^<]+)<\/title>/i);
              const headingMatch = errText.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
              if (titleMatch && titleMatch[1]) {
                errorMsg = `${errorMsg}: ${titleMatch[1].trim()}`;
              } else if (headingMatch && headingMatch[1]) {
                errorMsg = `${errorMsg}: ${headingMatch[1].trim()}`;
              } else {
                const clean = errText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (clean) errorMsg = `${errorMsg}: ${clean.slice(0, 160)}`;
              }
            }
          }
        } catch {
          // fallback
        }

        setLiveTimeline(prev => [
          ...prev,
          {
            step: 'failed',
            message: errorMsg,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const isEventStream = response.headers.get('content-type')?.includes('text/event-stream');

      if (response.body && isEventStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.type === 'progress' && parsed.data) {
                  setLiveTimeline(prev => {
                    const exists = prev.some(
                      e => e.step === parsed.data.step && e.message === parsed.data.message
                    );
                    if (exists) return prev;
                    return [...prev, parsed.data];
                  });
                } else if (parsed.type === 'result' && parsed.data) {
                  setBuildResult(parsed.data);
                  if (parsed.data.timeline) {
                    setLiveTimeline(parsed.data.timeline);
                  }
                } else if (parsed.type === 'error') {
                  const errorMsg = (parsed.data && parsed.data.message) || parsed.message || 'Build pipeline encountered an error';
                  setLiveTimeline(prev => [
                    ...prev,
                    {
                      step: 'failed',
                      message: errorMsg,
                      timestamp: Date.now(),
                    },
                  ]);
                } else if (parsed.result) {
                  setBuildResult(parsed.result);
                  if (parsed.result.timeline) {
                    setLiveTimeline(parsed.result.timeline);
                  }
                } else if (parsed.step) {
                  setLiveTimeline(prev => {
                    const exists = prev.some(
                      e => e.step === parsed.step && e.message === parsed.message
                    );
                    if (exists) return prev;
                    return [...prev, parsed];
                  });
                }
              } catch {
                // Ignore chunk parse errors
              }
            }
          }
        }
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result: BuildResult = await response.json();
          setBuildResult(result);
          if (result.timeline) {
            setLiveTimeline(result.timeline);
          }
        } else {
          const rawText = await response.text();
          const isWarmupOrRestart =
            rawText.includes('Starting Server') ||
            rawText.includes('warmup.html') ||
            rawText.includes('502 Bad Gateway') ||
            rawText.includes('504 Gateway') ||
            rawText.includes('503 Service');

          if (isWarmupOrRestart) {
            throw new Error(
              'The compiler service is restarting or warming up (often caused when uploading large directories like node_modules). Please wait 10 seconds and try again.'
            );
          }

          const titleMatch = rawText.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            throw new Error(`Server returned web page "${titleMatch[1].trim()}" instead of data stream.`);
          }

          throw new Error(`Unexpected server response format (${contentType || 'unknown'}). ${rawText.slice(0, 120)}`);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      setLiveTimeline(prev => [
        ...prev,
        {
          step: 'failed',
          message: `Network or runtime build error: ${err.message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsBuilding(false);
    }
  }, [isBuilding, selectedZip, selectedFiles, projectName, options]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to trigger build
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runBuild();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runBuild]);

  const handleDownloadWorker = () => {
    if (!buildResult?.workerJsCode) return;
    const blob = new Blob([buildResult.workerJsCode], {
      type: 'application/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worker.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasProject = Boolean(selectedZip || selectedFiles.length > 0);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-orange-500/30 selection:text-white">
      {/* Top Navbar */}
      <Header
        options={options}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHardeningSuite={() => setIsHardeningOpen(true)}
        onResetWorkspace={handleResetWorkspace}
        isBuilding={isBuilding}
        hasProjectLoaded={hasProject}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Hero Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-[#0c1017] border border-[#1e2738] shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-orange-400">
                Autonomous Cloudflare Compiler
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">
              Web &amp; Worker → Standalone worker.js
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Deterministic single-file compiler. Multi-factor entry detection, AST analysis, esbuild compilation, lossless asset routing, Wrangler validation, and self-containment test.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            {isBuilding && (
              <button
                id="cancel-build-btn"
                onClick={handleCancelBuild}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-800/80 text-red-300 font-mono font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <XCircle className="h-4 w-4 text-red-400" />
                <span>Cancel</span>
              </button>
            )}

            <button
              id="start-build-btn"
              onClick={runBuild}
              disabled={isBuilding || !hasProject}
              className="flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-white font-mono font-bold text-xs rounded-xl shadow-lg shadow-orange-600/20 transition-all transform active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {isBuilding ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  <span>Compiling &amp; Validating...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  <span>Build Cloudflare Worker</span>
                  <span className="hidden sm:inline text-[10px] opacity-75 font-normal px-1.5 py-0.5 rounded bg-black/20 border border-white/10">
                    ⌘ ↵
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Project Intake & Tree Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <ProjectUploader
              onZipSelect={handleZipSelect}
              onFilesSelect={handleFilesSelect}
              onSampleSelect={handleSampleSelect}
              samples={samples}
              currentProjectName={projectName}
              fileCount={filesDisplay.length}
              isBuilding={isBuilding}
            />

            {/* Project Summary Overview if files exist */}
            {hasProject && (
              <ProjectSummaryCard
                projectName={projectName || 'uploaded-project'}
                files={filesDisplay}
                scanResult={buildResult?.scanResult}
              />
            )}
          </div>

          <div className="lg:col-span-1 space-y-4">
            <ProjectTreePreview
              scanResult={buildResult?.scanResult}
              files={filesDisplay}
              projectName={projectName}
            />
          </div>
        </div>

        {/* Live Pipeline Stepper */}
        {(isBuilding || liveTimeline.length > 0) && (
          <PipelineStepper
            timeline={liveTimeline}
            isBuilding={isBuilding}
            isSuccess={buildResult?.success}
          />
        )}

        {/* Explainable Gemini Build Plan */}
        {buildResult?.buildPlan && (
          <BuildPlanCard plan={buildResult.buildPlan} />
        )}

        {/* Success or Error Result Card if build has run */}
        {buildResult && (
          <ResultCard
            result={buildResult}
            onDownload={handleDownloadWorker}
            onRetry={runBuild}
            onSwitchTab={(tab: string) => setActiveTab(tab as any)}
          />
        )}

        {/* Persistent Build & Developer Dashboard */}
        <div className="bg-[#0c1017] border border-[#1e2738] rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
          {/* Dashboard Header & Tab Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a2233] pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-orange-400" />
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Developer Dashboard &amp; Console
              </span>
              {isBuilding && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-mono animate-pulse">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                  Live Build
                </span>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 sm:gap-2 text-xs font-mono overflow-x-auto">
              {/* Build Logs Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeTab === 'logs'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#141b29]'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Build Logs</span>
                {liveTimeline.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-slate-300">
                    {liveTimeline.length}
                  </span>
                )}
              </button>

              {/* Diagnostics Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('diagnostics')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeTab === 'diagnostics'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#141b29]'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Diagnostics</span>
                {buildResult?.diagnostics && buildResult.diagnostics.length > 0 && (
                  <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    buildResult.diagnostics.some(d => d.severity === 'error')
                      ? 'bg-rose-900/60 text-rose-300'
                      : 'bg-amber-900/60 text-amber-300'
                  }`}>
                    {buildResult.diagnostics.length}
                  </span>
                )}
              </button>

              {/* Bundle Inspector Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('inspector')}
                disabled={!buildResult?.inspectorReport}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'inspector'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 font-bold'
                    : buildResult?.inspectorReport
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-[#141b29] cursor-pointer'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Bundle Inspector</span>
              </button>

              {/* Live Simulator Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                disabled={!buildResult?.workerJsCode}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'preview'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 font-bold'
                    : buildResult?.workerJsCode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-[#141b29] cursor-pointer'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Live Simulator</span>
              </button>

              {/* worker.js Code Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                disabled={!buildResult?.workerJsCode}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'code'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 font-bold'
                    : buildResult?.workerJsCode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-[#141b29] cursor-pointer'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>worker.js</span>
              </button>
            </div>
          </div>

          {/* Active Tab View Body */}
          <div className="pt-1">
            {activeTab === 'logs' && (
              <BuildLogs
                timeline={liveTimeline}
                diagnostics={buildResult?.diagnostics || []}
                attempts={buildResult?.attempts || []}
                wranglerOutput={buildResult?.wranglerResult?.dryRunOutput}
                errorSummary={buildResult?.errorSummary}
              />
            )}

            {activeTab === 'diagnostics' && (
              <PipelineDiagnosticsView
                timeline={liveTimeline}
                scanResult={buildResult?.scanResult}
                analysisResult={buildResult?.analysisResult}
                buildPlan={buildResult?.buildPlan}
                diagnostics={buildResult?.diagnostics || []}
                attempts={buildResult?.attempts || []}
                smokeTestResult={buildResult?.smokeTestResult}
                wranglerResult={buildResult?.wranglerResult}
                isBuilding={isBuilding}
                isSuccess={buildResult?.success}
                onRetry={runBuild}
                onSwitchToLogs={() => setActiveTab('logs')}
              />
            )}

            {activeTab === 'inspector' && buildResult?.inspectorReport && (
              <BundleInspectorCard report={buildResult.inspectorReport} />
            )}

            {activeTab === 'preview' && buildResult?.workerJsCode && (
              <WorkerPreviewTab
                workerCode={buildResult.workerJsCode}
                routes={buildResult.inspectorReport?.routes}
              />
            )}

            {activeTab === 'code' && buildResult?.workerJsCode && (
              <WorkerCodeViewer code={buildResult.workerJsCode} />
            )}
          </div>
        </div>
      </main>

      {/* Engine Settings Modal */}
      <ConfigModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        options={options}
        onChange={setOptions}
      />

      {/* Hardening & Audit Suite Modal */}
      <HardeningSuiteModal
        isOpen={isHardeningOpen}
        onClose={() => setIsHardeningOpen(false)}
      />
    </div>
  );
}
