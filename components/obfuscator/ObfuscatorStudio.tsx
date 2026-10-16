'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Play,
  Copy,
  Check,
  Download,
  Upload,
  Clock,
  Sparkles,
  FileCode,
  Layers,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Maximize2,
  Eye,
  FileUp,
  Cpu,
  Trash2,
} from 'lucide-react';
import {
  ObfuscatorCustomOptions,
  ObfuscationResult,
  ObfuscationHistoryItem,
  PresetName,
} from '@/types/obfuscator';
import {
  BASE_DEFAULT_OPTIONS,
  PRESET_CONFIGS,
  PRESET_METADATA,
  SAMPLE_CODES,
} from '@/lib/obfuscator-presets';
import { ObfuscatorOptionsDrawer } from './ObfuscatorOptionsDrawer';
import { formatBytes } from '@/lib/utils';

export function ObfuscatorStudio() {
  const [activeTab, setActiveTab] = useState<'editor' | 'upload' | 'output' | 'history'>('editor');
  const [selectedPreset, setSelectedPreset] = useState<PresetName>('medium');
  const [sourceCode, setSourceCode] = useState<string>(SAMPLE_CODES[0].code);
  const [options, setOptions] = useState<ObfuscatorCustomOptions>({
    ...BASE_DEFAULT_OPTIONS,
    ...PRESET_CONFIGS.medium,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ObfuscationResult | null>(null);
  const [history, setHistory] = useState<ObfuscationHistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [sandboxLogs, setSandboxLogs] = useState<string[]>([]);
  const [isSandboxRunning, setIsSandboxRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply Preset change
  const handlePresetChange = (preset: PresetName) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      setOptions({
        ...BASE_DEFAULT_OPTIONS,
        ...PRESET_CONFIGS[preset],
      });
    }
  };

  // Perform Obfuscation
  const handleObfuscate = async () => {
    if (!sourceCode.trim()) return;

    setIsLoading(true);
    setSandboxLogs([]);

    try {
      const response = await fetch('/api/obfuscate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: sourceCode,
          options,
        }),
      });

      const data: ObfuscationResult = await response.json();
      setResult(data);

      if (data.success && data.code) {
        // Add to history
        const newItem: ObfuscationHistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          name: `Obfuscation (${selectedPreset})`,
          originalSize: data.stats.originalSize,
          obfuscatedSize: data.stats.obfuscatedSize,
          preset: selectedPreset,
          snippet: data.code.slice(0, 100) + '...',
          fullCode: data.code,
        };
        setHistory(prev => [newItem, ...prev.slice(0, 19)]);
        setActiveTab('output');
      }
    } catch (err: any) {
      setResult({
        success: false,
        code: '',
        stats: {
          originalSize: sourceCode.length,
          obfuscatedSize: 0,
          sizeDeltaBytes: 0,
          sizeExpansionRatio: '0x',
          durationMs: 0,
        },
        error: err?.message || 'Connection error while communicating with obfuscator service.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Copy code to clipboard
  const handleCopy = () => {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download obfuscated JS
  const handleDownload = () => {
    if (!result?.code) return;
    const blob = new Blob([result.code], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `obfuscated-${Date.now()}.js`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // File upload handler
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (text) {
        setSourceCode(text);
        if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          setOptions(prev => ({ ...prev, parseHtml: true }));
        }
        setActiveTab('editor');
      }
    };
    reader.readAsText(file);
  };

  // Safe client-side sandbox execution of obfuscated code
  const handleRunSandbox = () => {
    if (!result?.code) return;
    setIsSandboxRunning(true);
    setSandboxLogs([]);

    const capturedLogs: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      capturedLogs.push('[LOG] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      originalLog(...args);
    };
    console.warn = (...args: any[]) => {
      capturedLogs.push('[WARN] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      originalWarn(...args);
    };
    console.error = (...args: any[]) => {
      capturedLogs.push('[ERROR] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      originalError(...args);
    };

    try {
      // Execute in isolated function closure
      const runner = new Function(result.code);
      runner();
      if (capturedLogs.length === 0) {
        capturedLogs.push('Code executed successfully without console output.');
      }
    } catch (err: any) {
      capturedLogs.push(`[RUNTIME EXCEPTION] ${err?.message || err}`);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      setSandboxLogs(capturedLogs);
      setIsSandboxRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto py-2">
      {/* Top Banner / Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>JavaScript Obfuscator Studio</span>
                <span className="px-2 py-0.5 text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-full font-mono">
                  v8.3.0 Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Full-featured AST Obfuscation, Control Flow Flattening, String Encryption & VM Bytecode Protection.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Presets */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Preset:</span>
            <select
              value={selectedPreset}
              onChange={e => handlePresetChange(e.target.value as PresetName)}
              className="bg-transparent text-xs text-slate-200 font-medium outline-none cursor-pointer pr-1"
            >
              {PRESET_METADATA.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Obfuscate Button */}
          <button
            onClick={handleObfuscate}
            disabled={isLoading || !sourceCode.trim()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Transforming AST...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Obfuscate Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Left Workspace & Right Configuration Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Workspace Tabs (Editor, Upload, Output, History) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Nav Tabs & Samples */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'editor'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>

              <button
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>

              <button
                onClick={() => setActiveTab('output')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'output'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Output</span>
                {result?.code && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
                {history.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded text-[10px]">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Samples Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 pr-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Examples:</span>
              <select
                onChange={e => {
                  const sample = SAMPLE_CODES.find(s => s.id === e.target.value);
                  if (sample) setSourceCode(sample.code);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs outline-none cursor-pointer"
              >
                {SAMPLE_CODES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TAB 1: Editor View */}
          {activeTab === 'editor' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[560px]">
              <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>JavaScript / HTML Input Code</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>{formatBytes(Buffer.byteLength(sourceCode, 'utf8'))}</span>
                  <span>{sourceCode.split('\n').length} lines</span>
                  <button
                    onClick={() => setSourceCode('')}
                    title="Clear editor"
                    className="hover:text-rose-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                value={sourceCode}
                onChange={e => setSourceCode(e.target.value)}
                placeholder="Paste your JavaScript code here, or choose an example from above..."
                className="flex-1 w-full p-4 bg-slate-950/90 text-slate-100 font-mono text-xs leading-relaxed outline-none resize-none selection:bg-indigo-500/30 custom-scrollbar"
                spellCheck={false}
              />
            </div>
          )}

          {/* TAB 2: Upload View */}
          {activeTab === 'upload' && (
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`bg-slate-900/90 border-2 border-dashed rounded-xl h-[560px] flex flex-col items-center justify-center p-8 transition-colors ${
                dragOver ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".js,.mjs,.cjs,.ts,.html,.htm"
                onChange={e => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl text-indigo-400 mb-4">
                <FileUp className="w-8 h-8" />
              </div>

              <h3 className="text-base font-semibold text-slate-100 mb-1">
                Drop your JavaScript or HTML file here
              </h3>
              <p className="text-xs text-slate-400 max-w-sm text-center mb-6">
                Supports standalone JS scripts or complete HTML documents with inline &lt;script&gt; tags.
              </p>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Browse Files
              </button>
            </div>
          )}

          {/* TAB 3: Output View */}
          {activeTab === 'output' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[560px]">
              {/* Output Top Bar */}
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Transformed Code</span>
                  </span>

                  {result?.stats && (
                    <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[11px]">
                      <span>Ratio: <strong className="text-indigo-400">{result.stats.sizeExpansionRatio}</strong></span>
                      <span>Time: <strong className="text-indigo-400">{result.stats.durationMs}ms</strong></span>
                      <span>Size: {formatBytes(result.stats.obfuscatedSize)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunSandbox}
                    disabled={isSandboxRunning || !result?.code}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run Test</span>
                  </button>

                  <button
                    onClick={handleCopy}
                    disabled={!result?.code}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleDownload}
                    disabled={!result?.code}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Output Content */}
              {result?.error ? (
                <div className="p-6 text-rose-400 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Obfuscation Error</h4>
                    <p className="text-xs text-rose-300/80 font-mono">{result.error}</p>
                  </div>
                </div>
              ) : result?.code ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <pre className="flex-1 p-4 bg-slate-950/90 text-slate-300 font-mono text-[11px] leading-relaxed overflow-auto custom-scrollbar select-all">
                    <code>{result.code}</code>
                  </pre>

                  {/* Sandbox Execution Console */}
                  {sandboxLogs.length > 0 && (
                    <div className="border-t border-slate-800 bg-slate-950 p-3 max-h-36 overflow-y-auto text-[11px] font-mono">
                      <div className="text-xs text-slate-400 mb-1 font-semibold flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-emerald-400" />
                        <span>Sandbox Test Console Output</span>
                      </div>
                      {sandboxLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className={log.startsWith('[ERROR]') || log.startsWith('[RUNTIME') ? 'text-rose-400' : 'text-slate-300'}
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Shield className="w-8 h-8 mb-2 stroke-[1.5] text-slate-600" />
                  <span>Click &quot;Obfuscate Code&quot; to inspect protected output</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: History View */}
          {activeTab === 'history' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl h-[560px] flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60">
                <span>Recent Obfuscation Sessions ({history.length})</span>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    className="hover:text-rose-400 text-slate-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Clock className="w-8 h-8 mb-2 stroke-[1.5] text-slate-600" />
                  <span>No previous obfuscation history in this session.</span>
                </div>
              ) : (
                <div className="p-3 overflow-y-auto space-y-2 flex-1 custom-scrollbar">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-center justify-between hover:border-slate-700 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-200 text-xs">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-indigo-400 rounded">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono">
                          <span>{formatBytes(item.originalSize)}</span>
                          <span>&rarr;</span>
                          <span className="text-emerald-400">{formatBytes(item.obfuscatedSize)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setResult({
                              success: true,
                              code: item.fullCode,
                              stats: {
                                originalSize: item.originalSize,
                                obfuscatedSize: item.obfuscatedSize,
                                sizeDeltaBytes: item.obfuscatedSize - item.originalSize,
                                sizeExpansionRatio: (item.obfuscatedSize / item.originalSize).toFixed(2) + 'x',
                                durationMs: 0,
                              },
                            });
                            setActiveTab('output');
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Full Configuration Drawer */}
        <div className="lg:col-span-4 h-[610px]">
          <ObfuscatorOptionsDrawer
            options={options}
            onChange={newOpts => {
              setOptions(newOpts);
              setSelectedPreset('custom');
            }}
            onReset={() => {
              handlePresetChange('medium');
            }}
          />
        </div>
      </div>
    </div>
  );
}
