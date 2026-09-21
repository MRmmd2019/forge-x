'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RefreshCw,
  X,
  AlertTriangle,
  Lock,
  Cpu,
  Server,
  Zap,
} from 'lucide-react';
import { HardeningSuiteReport, TestCaseResult } from '@/server/testing/hardening-suite';

interface HardeningSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HardeningSuiteModal({ isOpen, onClose }: HardeningSuiteModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<HardeningSuiteReport | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Attempt to load existing cached report on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    if (!report && !isRunning) {
      fetch('/api/hardening-test?cached=true', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (isMounted && data && Array.isArray(data.results)) {
            setReport(data);
          }
        })
        .catch(() => {
          // Silent fallback if no cached report yet
        });
    }

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isOpen, report, isRunning]);

  if (!isOpen) return null;

  const runSuite = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/hardening-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMsg = `Audit execution failed with status ${res.status} (${res.statusText || 'Server error'})`;
        try {
          const errData = await res.json();
          if (errData?.error) errorMsg = errData.error;
        } catch {
          // not json
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.results)) {
        throw new Error(data?.error || 'Invalid test report structure received from server.');
      }

      setReport(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const message = err?.message || 'Failed to execute hardening suite. Please try again.';
      setError(message);
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'functional':
        return <Zap className="h-3.5 w-3.5 text-blue-400" />;
      case 'security':
        return <Lock className="h-3.5 w-3.5 text-amber-400" />;
      case 'resource_limit':
        return <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />;
      case 'runtime_verification':
        return <Server className="h-3.5 w-3.5 text-emerald-400" />;
      default:
        return <Cpu className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  const filteredResults = report?.results
    ? report.results.filter(r => (selectedCategory === 'all' ? true : r.category === selectedCategory))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">System Hardening &amp; Audit Suite</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {report ? `${report.totalTests} Comprehensive Tests` : '32 Comprehensive Tests'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Functional compilation, security limits, prompt-injection defense, and isolated Node runtime verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="run-hardening-suite-btn"
              onClick={runSuite}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Executing Test Suite...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>{report ? 'Re-run All Tests' : 'Run Hardening Suite'}</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && !isRunning && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-semibold text-rose-200">Execution Notice</div>
                <div className="text-rose-300/90 mt-0.5">{error}</div>
              </div>
              <button
                onClick={runSuite}
                className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Tests</div>
                <div className="text-xl font-bold text-white mt-1">{report.totalTests}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
                <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Passed</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">{report.passedCount}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40">
                <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Failed</div>
                <div className="text-xl font-bold text-rose-400 mt-1">{report.failedCount}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Duration</div>
                <div className="text-xl font-bold text-amber-400 mt-1">{report.durationMs}ms</div>
              </div>
            </div>
          )}

          {/* Category Filter */}
          {report && (
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              {['all', 'functional', 'security', 'resource_limit', 'runtime_verification'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer capitalize ${
                    selectedCategory === cat
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}

          {/* Test List */}
          {!report && !isRunning && !error && (
            <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/30">
              <ShieldCheck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-white mb-1">Audit Suite Ready</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
                Click &quot;Run Hardening Suite&quot; to execute all 32 black-box test scenarios including Zip-bombs, Zip-slip, ESM module generation, tsconfig path mapping, node:crypto, and standalone sub-process runtime tests.
              </p>
              <button
                onClick={runSuite}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
              >
                Launch Verification Suite
              </button>
            </div>
          )}

          {isRunning && (
            <div className="text-center py-16 px-4 border border-slate-800 rounded-2xl bg-slate-950/30 space-y-3">
              <RefreshCw className="h-10 w-10 text-emerald-400 animate-spin mx-auto" />
              <h4 className="text-sm font-semibold text-white">Running Test Scenarios...</h4>
              <p className="text-xs text-slate-400">
                Spawning isolated disk sandboxes and evaluating real ES modules in Node sub-processes
              </p>
            </div>
          )}

          {report && (
            <div className="space-y-3">
              {filteredResults.map(test => (
                <div
                  key={test.id}
                  className={`p-4 rounded-xl border transition ${
                    test.passed
                      ? 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                      : 'bg-rose-950/20 border-rose-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {test.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">
                            #{test.id} {test.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {getCategoryIcon(test.category)}
                            <span className="capitalize">{test.category.replace('_', ' ')}</span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          <span className="text-slate-500 font-medium">Expected:</span> {test.expectedOutcome}
                        </p>
                        <p className="text-xs text-slate-300">
                          <span className="text-slate-500 font-medium">Result:</span>{' '}
                          <span className={test.passed ? 'text-emerald-300' : 'text-rose-300'}>
                            {test.actualOutcome}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono text-slate-500">{test.durationMs}ms</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <span>Zero-Mock Audit Engine • All tests run against isolated live runtimes</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg hover:bg-slate-800 text-slate-300 text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

