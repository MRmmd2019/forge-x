'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Search,
  ArrowDownCircle,
  Pause,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  BuildLogEntry,
  PipelineProgressEvent,
  NormalizedDiagnostic,
  BuildAttempt,
} from '@/types/bundler';

interface BuildLogsProps {
  logs?: BuildLogEntry[];
  timeline?: PipelineProgressEvent[];
  diagnostics?: NormalizedDiagnostic[];
  attempts?: BuildAttempt[];
  wranglerOutput?: string;
  errorSummary?: {
    what: string;
    why: string;
    where?: string;
    classification?: any;
    canFixAutomatically?: boolean;
    suggestion?: string;
  };
}

export function BuildLogs({
  logs = [],
  timeline = [],
  diagnostics = [],
  attempts = [],
  wranglerOutput,
  errorSummary,
}: BuildLogsProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Synthesize unified log entries if only timeline/diagnostics were passed
  const unifiedLogs: BuildLogEntry[] = useMemo(() => {
    if (logs.length > 0) return logs;

    const list: BuildLogEntry[] = [];

    // Add timeline steps
    timeline.forEach((evt, idx) => {
      let type: BuildLogEntry['type'] = 'info';
      if (evt.step === 'completed' || evt.step === 'smoke_tested' || evt.step === 'wrangler_validated') {
        type = 'success';
      } else if (evt.step === 'repairing') {
        type = 'warn';
      } else if (evt.step === 'failed') {
        type = 'error';
      }

      list.push({
        id: `tl-${idx}`,
        timestamp: evt.timestamp || idx,
        type,
        message: evt.message,
        stage: evt.step,
      });
    });

    // Add repair attempts
    attempts.forEach(att => {
      list.push({
        id: `att-desc-${att.attemptNumber}`,
        timestamp: att.timestamp || 0,
        type: att.status === 'success' ? 'success' : 'warn',
        message: `[Attempt #${att.attemptNumber}] ${att.aiRepairExplanation || att.plan.rationale || 'Compiler plan execution'} (${att.status})`,
        stage: 'repair',
      });
    });

    // Add diagnostics
    diagnostics.forEach((d, idx) => {
      list.push({
        id: `diag-${idx}`,
        timestamp: idx,
        type: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warn' : 'info',
        message: `[${d.code}] ${d.message}${d.file ? ` at ${d.file}:${d.line || 1}` : ''}${d.suggestion ? ` (Suggestion: ${d.suggestion})` : ''}`,
        stage: d.stage,
      });
    });

    // Add Wrangler dry-run output
    if (wranglerOutput) {
      list.push({
        id: 'wrangler-out',
        timestamp: 999999999,
        type: 'stdout',
        message: wranglerOutput,
        stage: 'wrangler',
      });
    }

    // Add Error Summary
    if (errorSummary) {
      list.push({
        id: 'err-sum',
        timestamp: 1000000000,
        type: 'error',
        message: `[FAILURE] ${errorSummary.what}\nReason: ${errorSummary.why}\nFix: ${errorSummary.suggestion || errorSummary.where || 'Check workspace configuration'}`,
        stage: 'fatal',
      });
    }

    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [logs, timeline, diagnostics, attempts, wranglerOutput, errorSummary]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [unifiedLogs, autoScroll]);

  const handleCopyLogs = async () => {
    const text = unifiedLogs
      .map(
        l =>
          `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.stage ? `[${l.stage}] ` : ''}${l.message}`
      )
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const filteredLogs = useMemo(() => {
    return unifiedLogs.filter(log => {
      // Type filter
      if (filterType === 'error' && log.type !== 'error') return false;
      if (filterType === 'warn' && log.type !== 'warn') return false;
      if (filterType === 'repair' && log.stage !== 'repair') return false;
      if (filterType === 'stdout' && log.type !== 'stdout' && log.type !== 'stderr') return false;

      // Text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const msg = log.message.toLowerCase();
        const stage = (log.stage || '').toLowerCase();
        if (!msg.includes(term) && !stage.includes(term)) return false;
      }

      return true;
    });
  }, [unifiedLogs, filterType, searchTerm]);

  const getTypeStyle = (type: BuildLogEntry['type']) => {
    switch (type) {
      case 'error':
      case 'stderr':
        return 'text-rose-400 font-bold';
      case 'warn':
        return 'text-amber-400 font-medium';
      case 'success':
        return 'text-emerald-400 font-semibold';
      case 'info':
        return 'text-sky-300';
      case 'stdout':
        return 'text-slate-300';
      default:
        return 'text-slate-400';
    }
  };

  const getTypeIcon = (type: BuildLogEntry['type']) => {
    switch (type) {
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />;
      case 'warn':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'info':
        return <Info className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />;
      default:
        return <span className="text-slate-600 select-none">›</span>;
    }
  };

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl overflow-hidden space-y-0">
      {/* Top Console Toolbar */}
      <div className="p-3 sm:p-4 bg-[#0c1017] border-b border-[#1a2233] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-orange-400" />
          <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
            Developer Build Console
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141b29] border border-[#222d40] text-slate-400">
            {unifiedLogs.length} events
          </span>
        </div>

        {/* Filter Pills & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#141b29] border border-[#1e2738] text-[11px] font-mono">
            {['all', 'stdout', 'warn', 'error', 'repair'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2 py-0.5 rounded transition cursor-pointer uppercase ${
                  filterType === type
                    ? 'bg-[#1e2738] text-orange-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="h-3 w-3 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className="bg-[#080b11] border border-[#1e2738] rounded-lg pl-7 pr-3 py-1 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 w-28 sm:w-36"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
              autoScroll
                ? 'bg-orange-500/10 border-orange-500/40 text-orange-300'
                : 'bg-[#141b29] border-[#222d40] text-slate-400 hover:text-slate-200'
            }`}
            title={autoScroll ? 'Auto-scroll is ON' : 'Auto-scroll is PAUSED'}
          >
            {autoScroll ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono border border-[#222d40] transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      <div className="h-[420px] overflow-auto bg-[#07090e] p-4 font-mono text-xs select-text leading-relaxed">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 text-center py-20 space-y-2">
            <Terminal className="h-8 w-8 text-slate-700 mx-auto" />
            <p className="text-slate-400 font-bold">Build Console Ready</p>
            <p className="text-[11px] text-slate-600 max-w-sm mx-auto">
              Select a project or sample and click &ldquo;Build Cloudflare Worker&rdquo; to stream live compiler diagnostics, AST analysis, and Wrangler validation events.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map(log => {
              const dateStr = new Date(log.timestamp).toLocaleTimeString();
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 hover:bg-[#0e131d] px-1 py-0.5 rounded transition group"
                >
                  <span className="text-slate-600 select-none text-[11px] shrink-0 font-mono w-16">
                    {dateStr}
                  </span>

                  {getTypeIcon(log.type)}

                  {log.stage && (
                    <span className="px-1.5 py-0.2 rounded bg-[#141b29] text-orange-400/90 text-[10px] uppercase font-bold shrink-0 border border-[#1e283b]">
                      {log.stage}
                    </span>
                  )}

                  <span className={`flex-1 break-all whitespace-pre-wrap ${getTypeStyle(log.type)}`}>
                    {log.message}
                  </span>
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
