'use client';

import React from 'react';
import {
  CheckCircle2,
  FolderSync,
  Search,
  BrainCircuit,
  Boxes,
  Hammer,
  PackageCheck,
  CheckCheck,
  ShieldCheck,
  Zap,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { PipelineProgressEvent } from '@/types/bundler';

interface PipelineStepperProps {
  timeline: PipelineProgressEvent[];
  isBuilding: boolean;
  isSuccess?: boolean;
}

const STAGES = [
  { key: 'workspace_ready', label: 'Workspace', short: 'Init', icon: FolderSync },
  { key: 'scanned', label: 'Scan', short: 'Scan', icon: Search },
  { key: 'analyzed', label: 'Analysis', short: 'AST', icon: BrainCircuit },
  { key: 'dependencies', label: 'Dependencies', short: 'Deps', icon: PackageCheck },
  { key: 'planned', label: 'Build Plan', short: 'Plan', icon: Boxes },
  { key: 'building', label: 'esbuild', short: 'Build', icon: Hammer },
  { key: 'assets_embedded', label: 'Embed Assets', short: 'Assets', icon: PackageCheck },
  { key: 'inspected', label: 'Inspector', short: 'Audit', icon: CheckCheck },
  { key: 'wrangler_validated', label: 'Wrangler', short: 'Sandbox', icon: ShieldCheck },
  { key: 'smoke_tested', label: 'Smoke Test', short: 'Runtime', icon: Zap },
];

export function PipelineStepper({ timeline, isBuilding, isSuccess }: PipelineStepperProps) {
  const isPipelineComplete = Boolean(isSuccess || timeline.some(t => t.step === 'completed'));
  const hasFailed = timeline.some(t => t.step === 'failed') && !isPipelineComplete && !isBuilding;
  const isRepairing = timeline.some(t => t.step === 'repairing') && isBuilding;

  // Find the highest reached stage index
  let highestReachedIdx = -1;
  for (const item of timeline) {
    const idx = STAGES.findIndex(s => s.key === item.step);
    if (idx > highestReachedIdx) {
      highestReachedIdx = idx;
    }
  }

  const getStageStatus = (stageKey: string, index: number) => {
    if (isPipelineComplete) return 'completed';

    if (hasFailed && (highestReachedIdx === index || (highestReachedIdx === -1 && index === 0))) {
      return 'failed';
    }

    if (isRepairing && index === highestReachedIdx) {
      return 'repairing';
    }

    if (index < highestReachedIdx) {
      return 'completed';
    }

    if (index === highestReachedIdx) {
      return isBuilding ? 'active' : 'completed';
    }

    if (index === 0 && isBuilding) {
      return 'active';
    }

    return 'pending';
  };

  const latestEvent = timeline[timeline.length - 1];

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header with live activity message */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1a2233]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Build Pipeline
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141b29] border border-[#222d40] text-slate-400">
            9 Autonomous Stages
          </span>
        </div>

        {isBuilding ? (
          <div className="flex items-center gap-2 text-xs font-mono text-orange-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-orange-500" />
            <span className="truncate max-w-xs sm:max-w-md font-medium">
              {latestEvent?.message || 'Compiling Cloudflare Worker...'}
            </span>
          </div>
        ) : isSuccess ? (
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>All Stages Verified</span>
          </div>
        ) : hasFailed ? (
          <div className="flex items-center gap-1.5 text-xs font-mono text-rose-400 font-medium">
            <AlertTriangle className="h-4 w-4" />
            <span>Pipeline Halted</span>
          </div>
        ) : null}
      </div>

      {/* Visual Stages Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {STAGES.map((stage, idx) => {
          const status = getStageStatus(stage.key, idx);
          const Icon = stage.icon;

          return (
            <div
              key={stage.key}
              className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center text-center transition-all duration-150 ${
                status === 'completed'
                  ? 'border-emerald-800/50 bg-emerald-950/20 text-emerald-300'
                  : status === 'active'
                  ? 'border-orange-500/80 bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/40 shadow-sm'
                  : status === 'repairing'
                  ? 'border-amber-500/80 bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/40'
                  : status === 'failed'
                  ? 'border-rose-800/80 bg-rose-950/20 text-rose-300'
                  : 'border-[#1a2233] bg-[#0c1017] text-slate-500'
              }`}
            >
              <div className="mb-1.5">
                {status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : status === 'active' ? (
                  <RefreshCw className="h-4 w-4 text-orange-400 animate-spin" />
                ) : status === 'repairing' ? (
                  <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />
                ) : status === 'failed' ? (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                ) : (
                  <Icon className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <span className="text-[11px] font-mono font-medium leading-tight truncate w-full">
                {stage.short}
              </span>
              <span className="text-[9px] mt-1 font-mono uppercase tracking-tight opacity-75">
                {status === 'active' ? 'Active' : status === 'repairing' ? 'Retry' : status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
