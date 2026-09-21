'use client';

import React from 'react';
import {
  BrainCircuit,
  Search,
  Boxes,
  Hammer,
  PackageCheck,
  CheckCheck,
  ShieldCheck,
  Zap,
  FolderSync,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Layers,
  FileCode2,
  HardDrive,
  Info,
} from 'lucide-react';
import {
  PipelineProgressEvent,
  ScanResult,
  StaticAnalysisResult,
  BuildPlan,
  NormalizedDiagnostic,
  BuildAttempt,
  SmokeTestResult,
} from '@/types/bundler';
import { formatBytes } from '@/lib/utils';

interface PipelineDiagnosticsViewProps {
  timeline: PipelineProgressEvent[];
  scanResult?: ScanResult;
  analysisResult?: StaticAnalysisResult;
  buildPlan?: BuildPlan;
  diagnostics?: NormalizedDiagnostic[];
  attempts?: BuildAttempt[];
  smokeTestResult?: SmokeTestResult;
  wranglerResult?: any;
  isBuilding: boolean;
  isSuccess?: boolean;
  onRetry?: () => void;
  onSwitchToLogs?: () => void;
}

export function PipelineDiagnosticsView({
  timeline,
  scanResult,
  analysisResult,
  buildPlan,
  diagnostics = [],
  attempts = [],
  smokeTestResult,
  wranglerResult,
  isBuilding,
  isSuccess,
  onRetry,
  onSwitchToLogs,
}: PipelineDiagnosticsViewProps) {
  const errorDiagnostics = diagnostics.filter(d => d.severity === 'error');
  const warningDiagnostics = diagnostics.filter(d => d.severity === 'warning');
  const hasFailed = !isBuilding && !isSuccess && (timeline.some(t => t.step === 'failed') || errorDiagnostics.length > 0);

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Failure Debug Center if build failed */}
      {hasFailed && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-950/20 border border-rose-900/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Pipeline Diagnostic: Build Halted</span>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer transition shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry Pipeline</span>
              </button>
            )}
          </div>

          {errorDiagnostics.length > 0 ? (
            <div className="space-y-2">
              {errorDiagnostics.map((err, i) => (
                <div key={i} className="p-3 rounded-xl bg-[#0c1017] border border-rose-800/40 text-rose-200">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <span className="px-1.5 py-0.5 rounded bg-rose-900/50 text-[10px] uppercase">
                      {err.stage}
                    </span>
                    <span>{err.code}</span>
                    {err.file && <span className="text-slate-400 font-normal">at {err.file}:{err.line || 1}</span>}
                  </div>
                  <p className="mt-1 text-slate-300 leading-relaxed">{err.message}</p>
                  {err.suggestion && (
                    <div className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5 bg-amber-950/30 p-2 rounded-lg border border-amber-800/30">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span><strong>Suggested Action:</strong> {err.suggestion}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#0c1017] border border-rose-800/40 text-slate-300">
              <p>Check the build logs for specific stage diagnostic trace.</p>
              {onSwitchToLogs && (
                <button
                  onClick={onSwitchToLogs}
                  className="mt-2 text-orange-400 hover:text-orange-300 underline font-semibold flex items-center gap-1"
                >
                  <span>Open Build Logs Console</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage Breakdown Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: AST & Entry Point Resolution */}
        <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1a2233]">
            <div className="flex items-center gap-2 text-white font-bold">
              <BrainCircuit className="h-4 w-4 text-orange-400" />
              <span>AST & Entry Resolution</span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase">
              {analysisResult ? 'Static Analysis' : 'Awaiting Stage 2'}
            </span>
          </div>

          {analysisResult ? (
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block mb-1">
                  Entry Point Candidate Scoring
                </span>
                <div className="space-y-1.5">
                  {analysisResult.entryCandidates.length > 0 ? (
                    analysisResult.entryCandidates.map((cand, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          i === 0
                            ? 'bg-orange-500/10 border-orange-500/40 text-orange-300'
                            : 'bg-[#141b29] border-[#222d40] text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{cand.path}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400">
                            {Array.isArray(cand.factors) ? cand.factors.join(', ') : 'entry'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>{cand.score}%</span>
                          {i === 0 && <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" />}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40] text-slate-400">
                      No JS/TS entry files detected.
                    </div>
                  )}
                </div>
              </div>

              {/* Module Format & Fetch Handler Check */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
                  <span className="text-[10px] uppercase text-slate-400 block mb-1">Module Format</span>
                  <span className="text-emerald-300 font-bold uppercase">{analysisResult.moduleFormat}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
                  <span className="text-[10px] uppercase text-slate-400 block mb-1">Worker Fetch Handler</span>
                  <span className={`font-bold ${analysisResult.hasWorkerFetchHandler ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {analysisResult.hasWorkerFetchHandler ? 'Detected in AST' : 'Not Exported'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-600">
              Analysis data will be available once the project is scanned and analyzed.
            </div>
          )}
        </div>

        {/* Right Column: Runtime Compatibility & Asset Headroom */}
        <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1a2233]">
            <div className="flex items-center gap-2 text-white font-bold">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Compatibility & Asset Pre-Flight</span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase">Cloudflare Limits</span>
          </div>

          {analysisResult ? (
            <div className="space-y-3">
              {/* Node.js Compatibility Check */}
              <div>
                <span className="text-[10px] uppercase text-slate-400 block mb-1">
                  Node.js Built-in Modules
                </span>
                {analysisResult.nodeApiUsages.length > 0 ? (
                  <div className="space-y-1">
                    {analysisResult.nodeApiUsages.map((usage, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                          usage.status === 'SAFE'
                            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                            : usage.status === 'WARNING'
                            ? 'bg-sky-950/20 border-sky-800/40 text-sky-300'
                            : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{usage.moduleName}</span>
                          <span className="text-[10px] text-slate-400">
                            in {usage.files?.join(', ') || 'project'}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/40">
                          {usage.status === 'SAFE'
                            ? 'Native Web / Safe'
                            : usage.status === 'WARNING'
                            ? 'nodejs_compat'
                            : 'Unsupported'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40] text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Pure Web APIs — Zero blocking Node.js dependencies</span>
                  </div>
                )}
              </div>

              {/* Dependency Cycles & Unused Files */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
                  <span className="text-[10px] uppercase text-slate-400 block mb-1">Circular Dependency Cycles</span>
                  <span className={`font-bold ${analysisResult.dependencyGraph?.circularDependencies.length ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {analysisResult.dependencyGraph?.circularDependencies.length || 0} cycles
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
                  <span className="text-[10px] uppercase text-slate-400 block mb-1">Unused Source Files</span>
                  <span className="text-slate-300 font-bold">
                    {analysisResult.dependencyGraph?.unusedFiles.length || 0} files
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-600">
              Pre-flight report ready upon analysis.
            </div>
          )}
        </div>
      </div>

      {/* Compiler Plan & Repair History */}
      {buildPlan && (
        <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[#1a2233]">
            <div className="flex items-center gap-2 text-white font-bold">
              <Boxes className="h-4 w-4 text-amber-400" />
              <span>Active Compiler Architecture Plan</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Target: {buildPlan.target} • Mode: {buildPlan.workerMode}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Entry Point</span>
              <span className="text-orange-300 font-semibold truncate block">{buildPlan.entry}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Asset Strategy</span>
              <span className="text-sky-300 font-semibold block">{buildPlan.assetStrategy}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Minification</span>
              <span className="text-emerald-300 font-semibold block">{buildPlan.minify ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Attempts Executed</span>
              <span className="text-slate-200 font-semibold block">{attempts.length || 1}</span>
            </div>
          </div>

          {buildPlan.rationale && (
            <div className="p-3 rounded-xl bg-[#111724] border border-[#1e283b] text-slate-300">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase tracking-wider mb-1">
                <Sparkles className="h-3 w-3" />
                Compiler Rationale
              </div>
              <p className="text-slate-300 leading-relaxed text-xs">
                {buildPlan.rationale}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
