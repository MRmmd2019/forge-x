'use client';

import React from 'react';
import { Settings, Sparkles, Layers, ShieldCheck, Terminal, Cpu, RotateCcw } from 'lucide-react';
import { BuildOptions } from '@/types/bundler';

interface HeaderProps {
  options: BuildOptions;
  onOpenSettings: () => void;
  onOpenHardeningSuite?: () => void;
  onResetWorkspace?: () => void;
  isBuilding: boolean;
  hasProjectLoaded?: boolean;
}

export function Header({
  options,
  onOpenSettings,
  onOpenHardeningSuite,
  onResetWorkspace,
  isBuilding,
  hasProjectLoaded,
}: HeaderProps) {
  return (
    <header className="border-b border-[#1a2233] bg-[#07090e]/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-bold shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight font-mono">
                AUTOFORGE
              </h1>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30">
                WORKBENCH
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Deterministic Build Engine → Standalone <span className="text-slate-200 font-mono font-medium">worker.js</span>
            </p>
          </div>
        </div>

        {/* Runtime Status & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Engine Status Pills (Hidden on mobile) */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-lg bg-[#0e131d] border border-[#1e2738] text-slate-300">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300">Deterministic esbuild + Wrangler</span>
            <span className="text-slate-700">|</span>
            <span className="text-emerald-400 font-medium">Zero-AI Core</span>
          </div>

          {/* Reset / New Project Button */}
          {hasProjectLoaded && onResetWorkspace && (
            <button
              onClick={onResetWorkspace}
              disabled={isBuilding}
              title="Reset workspace and load new project"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0e131d] hover:bg-[#141b29] border border-[#1e2738] text-slate-300 hover:text-white text-xs font-mono transition cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden md:inline">Reset</span>
            </button>
          )}

          {/* Hardening Suite Audit */}
          {onOpenHardeningSuite && (
            <button
              id="hardening-suite-toggle-btn"
              onClick={onOpenHardeningSuite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono font-medium transition cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Audit Suite</span>
              <span className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">32 Tests</span>
            </button>
          )}

          {/* Config Modal Toggle */}
          <button
            id="settings-toggle-btn"
            onClick={onOpenSettings}
            disabled={isBuilding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e131d] hover:bg-[#141b29] border border-[#1e2738] text-slate-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50"
          >
            <Settings className="h-3.5 w-3.5 text-slate-400" />
            <span>Config</span>
          </button>
        </div>
      </div>
    </header>
  );
}
