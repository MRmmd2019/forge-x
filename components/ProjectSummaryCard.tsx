'use client';

import React from 'react';
import {
  FileCode,
  HardDrive,
  FolderTree,
  Sparkles,
  Layers,
  Code2,
  FileText,
  Image as ImageIcon,
  FileType,
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { ScanResult } from '@/types/bundler';

interface ProjectSummaryCardProps {
  projectName: string;
  files: { path: string; size?: number }[];
  scanResult?: ScanResult;
}

export function ProjectSummaryCard({ projectName, files, scanResult }: ProjectSummaryCardProps) {
  const totalSizeBytes =
    scanResult?.totalSizeBytes ||
    files.reduce((acc, f) => acc + (f.size || 0), 0);

  // Calculate language/type breakdown
  const stats = {
    ts: 0,
    js: 0,
    html: 0,
    css: 0,
    json: 0,
    assets: 0,
    other: 0,
  };

  files.forEach(f => {
    const ext = f.path.split('.').pop()?.toLowerCase() || '';
    if (['ts', 'tsx', 'mts'].includes(ext)) stats.ts++;
    else if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) stats.js++;
    else if (['html', 'htm'].includes(ext)) stats.html++;
    else if (['css'].includes(ext)) stats.css++;
    else if (['json'].includes(ext)) stats.json++;
    else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'ico', 'woff', 'woff2', 'ttf'].includes(ext))
      stats.assets++;
    else stats.other++;
  });

  const detectedType = scanResult?.detectedProjectType
    ? scanResult.detectedProjectType.replace(/_/g, ' ')
    : stats.ts > 0
    ? 'TypeScript Vanilla'
    : stats.html > 0
    ? 'Static Web + Assets'
    : 'JavaScript Module';

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1a2233]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-mono font-bold text-xs">
            PKG
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-mono tracking-tight truncate max-w-xs">
              {projectName}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Detected Archetype: <span className="text-orange-400 capitalize font-medium">{detectedType}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-md bg-[#141b29] border border-[#222d40] text-slate-200">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-[#141b29] border border-[#222d40] text-amber-400">
            {formatBytes(totalSizeBytes)}
          </span>
        </div>
      </div>

      {/* Language Breakdown Pills */}
      <div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2">
          File Composition
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {stats.ts > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-blue-400">TS</span>
              <span className="text-xs font-mono font-bold text-white">{stats.ts}</span>
            </div>
          )}
          {stats.js > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-amber-400">JS</span>
              <span className="text-xs font-mono font-bold text-white">{stats.js}</span>
            </div>
          )}
          {stats.html > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-orange-400">HTML</span>
              <span className="text-xs font-mono font-bold text-white">{stats.html}</span>
            </div>
          )}
          {stats.css > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-sky-400">CSS</span>
              <span className="text-xs font-mono font-bold text-white">{stats.css}</span>
            </div>
          )}
          {stats.assets > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-purple-400">Assets</span>
              <span className="text-xs font-mono font-bold text-white">{stats.assets}</span>
            </div>
          )}
          {stats.json > 0 && (
            <div className="p-2 rounded-lg bg-[#141b29] border border-[#222d40] flex items-center justify-between">
              <span className="text-[11px] font-mono text-emerald-400">JSON</span>
              <span className="text-xs font-mono font-bold text-white">{stats.json}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
