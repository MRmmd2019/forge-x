'use client';

import React, { useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileCode,
  Shield,
  Cpu,
  PackageCheck,
  CheckCircle2,
} from 'lucide-react';
import { BuildPlan } from '@/types/bundler';

interface BuildPlanCardProps {
  plan?: BuildPlan;
}

export function BuildPlanCard({ plan }: BuildPlanCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!plan) return null;

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl overflow-hidden">
      {/* Header bar / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-[#0c1017] hover:bg-[#111724] transition text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Gemini Architecture Plan
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#182133] text-orange-300 border border-[#222f46]">
                Entry: {plan.entry}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Worker Mode: <span className="text-slate-200 capitalize">{plan.workerMode.replace(/_/g, ' ')}</span> • Target: {plan.target}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>{isOpen ? 'Collapse' : 'Inspect Plan'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-[#1a2233] space-y-4 text-xs font-mono">
          {/* Decision Matrix Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-1">Entry Script</span>
              <span className="text-orange-300 font-semibold truncate block">{plan.entry}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-1">Module Format</span>
              <span className="text-emerald-300 font-semibold block uppercase">{plan.format} ({plan.target})</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-1">Asset Strategy</span>
              <span className="text-sky-300 font-semibold block">{plan.assetStrategy}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141b29] border border-[#222d40]">
              <span className="text-[10px] uppercase text-slate-400 block mb-1">Minification</span>
              <span className="text-slate-200 font-semibold block">{plan.minify ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          {/* Rationale Box */}
          {plan.rationale && (
            <div className="p-3.5 rounded-xl bg-[#111724] border border-[#1e283b] text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                AI Compiler Rationale
              </div>
              <p className="text-slate-300 leading-relaxed text-xs">
                {plan.rationale}
              </p>
            </div>
          )}

          {/* Compatibility Flags */}
          {plan.compatibilityFlags && plan.compatibilityFlags.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Compatibility Flags:</span>
              <div className="flex flex-wrap gap-1.5">
                {plan.compatibilityFlags.map((flag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-[#182133] border border-[#25334d] text-orange-300 text-[11px]"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
