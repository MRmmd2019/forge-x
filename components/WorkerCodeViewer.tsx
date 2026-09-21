'use client';

import React, { useState, useMemo } from 'react';
import { Download, Copy, Check, FileCode, Search, Terminal } from 'lucide-react';

interface WorkerCodeViewerProps {
  code: string;
}

export function WorkerCodeViewer({ code }: WorkerCodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worker.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0c1017] border-b border-[#1a2233]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <FileCode className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white font-mono">worker.js</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ESM Output
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {lines.length} lines • {(new TextEncoder().encode(code).length / 1024).toFixed(1)} KiB
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3 w-3 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search code..."
              className="bg-[#080b11] border border-[#1e2738] rounded-lg pl-7 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 w-36 sm:w-48"
            />
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono font-medium border border-[#222d40] transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            id="download-worker-tab-btn"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-mono font-semibold shadow-md shadow-orange-500/20 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Code Editor Window */}
      <div className="max-h-[550px] overflow-auto bg-[#07090e] p-4 font-mono text-xs text-slate-300 select-text leading-relaxed">
        <pre className="overflow-x-auto whitespace-pre">
          {lines.slice(0, 1500).map((line, idx) => {
            const matches = searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase());
            return (
              <div
                key={idx}
                className={`table-row ${matches ? 'bg-orange-500/20 font-bold text-white' : ''}`}
              >
                <span className="table-cell pr-4 text-right select-none text-slate-600 text-[11px] w-12">
                  {idx + 1}
                </span>
                <span className="table-cell whitespace-pre">{line}</span>
              </div>
            );
          })}
        </pre>
        {lines.length > 1500 && (
          <div className="text-center py-4 text-slate-500 text-xs border-t border-[#1e2738] mt-3">
            ... preview truncated to 1500 lines. Download full worker.js above.
          </div>
        )}
      </div>
    </div>
  );
}
