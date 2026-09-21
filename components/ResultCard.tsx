'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Download,
  Copy,
  Check,
  Globe,
  FileCode,
  Layers,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { BuildResult } from '@/types/bundler';

interface ResultCardProps {
  result: BuildResult;
  onDownload: () => void;
  onRetry?: () => void;
  onSwitchTab: (tab: 'inspector' | 'preview' | 'code' | 'logs' | 'diagnostics') => void;
}

export function ResultCard({ result, onDownload, onRetry, onSwitchTab }: ResultCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!result.workerJsCode) return;
    try {
      await navigator.clipboard.writeText(result.workerJsCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (result.success) {
    const report = result.inspectorReport;
    return (
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-emerald-950/20 to-[#0e131d] border border-emerald-800/60 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white font-mono tracking-tight">
                  worker.js is Ready
                </h3>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Cloudflare Verified
                </span>
              </div>
              <p className="text-xs text-emerald-300/80 font-mono mt-0.5">
                Completed in {result.durationMs}ms ({result.totalAttempts} attempt{result.totalAttempts > 1 ? 's' : ''}) • Single self-contained file • 0 external dependencies
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono font-medium border border-[#222d40] transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              id="download-worker-header-btn"
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-mono font-bold shadow-lg shadow-emerald-600/20 transition cursor-pointer transform active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span>Download worker.js</span>
            </button>
          </div>
        </div>

        {/* Quick Inspection Metric Chips */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-emerald-900/40 text-xs font-mono">
            <div
              onClick={() => onSwitchTab('inspector')}
              className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-[#1e2738] hover:border-slate-600 transition cursor-pointer flex items-center justify-between"
            >
              <span className="text-slate-400 text-[11px]">Bundle Size</span>
              <span className="text-emerald-400 font-bold">{report.totalSizeFormatted}</span>
            </div>

            <div
              onClick={() => onSwitchTab('inspector')}
              className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-[#1e2738] hover:border-slate-600 transition cursor-pointer flex items-center justify-between"
            >
              <span className="text-slate-400 text-[11px]">Virtual Routes</span>
              <span className="text-slate-200 font-bold">{report.routesCount} routes</span>
            </div>

            <div
              onClick={() => onSwitchTab('preview')}
              className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-[#1e2738] hover:border-slate-600 transition cursor-pointer flex items-center justify-between"
            >
              <span className="text-slate-400 text-[11px]">Simulator</span>
              <span className="text-orange-400 font-bold flex items-center gap-1">
                <Globe className="h-3 w-3" /> Test Live
              </span>
            </div>

            <div
              onClick={() => onSwitchTab('code')}
              className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-[#1e2738] hover:border-slate-600 transition cursor-pointer flex items-center justify-between"
            >
              <span className="text-slate-400 text-[11px]">Source</span>
              <span className="text-sky-400 font-bold flex items-center gap-1">
                <FileCode className="h-3 w-3" /> View Code
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Error Diagnostic State
  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-rose-950/30 border border-rose-900/60 shadow-lg space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-mono">
              Build Validation Error
            </h3>
            <p className="text-xs text-rose-300/90 font-mono">
              {result.errorSummary?.what || 'Pipeline encountered a build or compatibility error.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-mono font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Build</span>
            </button>
          )}
        </div>
      </div>

      {/* Diagnostic Explanation & Fix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {result.errorSummary?.why && (
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-rose-900/50 text-xs font-mono space-y-1">
            <span className="text-rose-400 font-bold block text-[10px] uppercase tracking-wider">
              Why This Failed
            </span>
            <p className="text-slate-300 leading-relaxed">
              {result.errorSummary.why}
            </p>
          </div>
        )}

        {result.errorSummary?.howToFix && (
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-amber-900/40 text-xs font-mono space-y-1">
            <span className="text-amber-400 font-bold block text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Recommended Resolution
            </span>
            <p className="text-slate-300 leading-relaxed">
              {result.errorSummary.howToFix}
            </p>
          </div>
        )}
      </div>

      {/* Action shortcuts */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-rose-900/30 text-xs font-mono">
        <button
          onClick={() => onSwitchTab('diagnostics')}
          className="text-orange-400 hover:text-orange-300 flex items-center gap-1 underline font-semibold cursor-pointer"
        >
          <span>View Diagnostics Matrix</span>
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => onSwitchTab('logs')}
          className="text-slate-400 hover:text-slate-200 flex items-center gap-1 underline cursor-pointer"
        >
          <span>Open Raw Build Logs</span>
        </button>
      </div>
    </div>
  );
}
