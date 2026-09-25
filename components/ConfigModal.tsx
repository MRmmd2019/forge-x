'use client';

import React from 'react';
import { X, Sliders, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { BuildOptions } from '@/types/bundler';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: BuildOptions;
  onChange: (newOptions: BuildOptions) => void;
}

export function ConfigModal({ isOpen, onClose, options, onChange }: ConfigModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-orange-500" />
            <h2 className="text-base font-semibold text-white">AutoForge Compiler Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="py-5 space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-slate-200 font-medium block">Minify Output</label>
              <span className="text-xs text-slate-400">Reduce worker.js bundle size with esbuild minifier</span>
            </div>
            <input
              type="checkbox"
              id="opt-minify"
              checked={options.minify ?? true}
              onChange={e => onChange({ ...options, minify: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500 bg-slate-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-slate-200 font-medium block">Generate Source Map</label>
              <span className="text-xs text-slate-400">Embed inline source map for debugging</span>
            </div>
            <input
              type="checkbox"
              id="opt-sourcemap"
              checked={options.sourceMap ?? false}
              onChange={e => onChange({ ...options, sourceMap: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500 bg-slate-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-slate-200 font-medium block flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
                Deterministic Auto-Repair
              </label>
              <span className="text-xs text-slate-400">Autonomous AST analysis & deterministic rule-based repair engine</span>
            </div>
            <input
              type="checkbox"
              id="opt-ai"
              checked={options.enableAiPlanning ?? true}
              onChange={e => onChange({ ...options, enableAiPlanning: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500 bg-slate-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-slate-200 font-medium block">Bypass Synthetic Smoke Probes</label>
              <span className="text-xs text-slate-400">Skip synthetic HTTP route probes (Wrangler pre-flight verification will still execute)</span>
            </div>
            <input
              type="checkbox"
              id="opt-skip-smoke"
              checked={options.skipSmokeTest ?? false}
              onChange={e => onChange({ ...options, skipSmokeTest: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 text-orange-500 focus:ring-orange-500 bg-slate-800"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-slate-200 font-medium">ECMAScript Target</label>
              <span className="text-xs text-slate-400 font-mono">{options.target || 'es2022'}</span>
            </div>
            <select
              value={options.target || 'es2022'}
              onChange={e => onChange({ ...options, target: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-orange-500"
            >
              <option value="es2022">es2022 (Recommended for Cloudflare Workers)</option>
              <option value="es2021">es2021</option>
              <option value="es2020">es2020</option>
              <option value="esnext">esnext</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-slate-200 font-medium">Max Repair Attempts</label>
              <span className="text-xs text-slate-400 font-mono">{options.maxAttempts || 5} attempts</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={options.maxAttempts || 5}
              onChange={e => onChange({ ...options, maxAttempts: parseInt(e.target.value, 10) })}
              className="w-full accent-orange-500"
            />
            <span className="text-xs text-slate-500 block mt-1">Default is 5 attempts with finite loop bound.</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={() =>
              onChange({
                minify: true,
                sourceMap: false,
                target: 'es2022',
                maxAttempts: 5,
                enableAiPlanning: true,
                assetStrategy: 'inline_bytes',
              })
            }
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Reset to Auto Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
