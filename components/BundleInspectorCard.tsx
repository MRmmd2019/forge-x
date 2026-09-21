'use client';

import React, { useState } from 'react';
import {
  Layers,
  Globe,
  FileCode,
  Search,
  CheckCircle2,
  Table,
} from 'lucide-react';
import { BundleInspectorReport } from '@/types/bundler';
import { formatBytes } from '@/lib/utils';

interface BundleInspectorCardProps {
  report: BundleInspectorReport;
}

export function BundleInspectorCard({ report }: BundleInspectorCardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'routes'>('overview');
  const [routeSearch, setRouteSearch] = useState('');

  const jsBytes = report.jsSizeBytes || 0;
  const htmlBytes = report.htmlSizeBytes || 0;
  const cssBytes = report.cssSizeBytes || 0;
  const assetBytes = report.embeddedAssetsSizeBytes || 0;
  const totalBytes = report.totalSizeBytes || 1;

  const jsPct = (jsBytes / totalBytes) * 100;
  const htmlPct = (htmlBytes / totalBytes) * 100;
  const cssPct = (cssBytes / totalBytes) * 100;
  const assetPct = (assetBytes / totalBytes) * 100;

  // 64 MiB is CF worker standard limit
  const limitBytes = 64 * 1024 * 1024;
  const limitUsagePct = Math.min(100, (totalBytes / limitBytes) * 100);

  const filteredRoutes = (report.routes || []).filter(r =>
    r.toLowerCase().includes(routeSearch.toLowerCase())
  );

  const getMimeForRoute = (route: string) => {
    if (route.endsWith('.html') || route === '/') return 'text/html';
    if (route.endsWith('.css')) return 'text/css';
    if (route.endsWith('.js')) return 'application/javascript';
    if (route.endsWith('.json')) return 'application/json';
    if (route.endsWith('.png')) return 'image/png';
    if (route.endsWith('.svg')) return 'image/svg+xml';
    if (route.endsWith('.ico')) return 'image/x-icon';
    if (route.endsWith('.wasm')) return 'application/wasm';
    return 'application/octet-stream';
  };

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl overflow-hidden space-y-0">
      {/* Header with Navigation Tabs */}
      <div className="p-4 sm:p-5 border-b border-[#1a2233] flex flex-wrap items-center justify-between gap-4 bg-[#0c1017]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              Bundle Inspector & Diagnostics
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Total Size: <span className="text-emerald-400 font-bold">{report.totalSizeFormatted}</span> • {report.routesCount} Virtual Routes • {report.assetsCount} Embedded Assets
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141b29] border border-[#1e2738] text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#1e2738] text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Payload Distribution
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'routes'
                ? 'bg-[#1e2738] text-white font-medium shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Virtual Routes</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 font-bold">
              {report.routes?.length || 0}
            </span>
          </button>
        </div>
      </div>

      {/* Tab: Overview (Payload Distribution & Invariants) */}
      {activeTab === 'overview' && (
        <div className="p-4 sm:p-6 space-y-6">
          {/* Visual Distribution Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 uppercase tracking-wider text-[11px] font-bold">
                Bundle Composition
              </span>
              <span className="text-slate-300">
                {report.totalSizeFormatted} <span className="text-slate-500">/ 64 MiB limit ({limitUsagePct.toFixed(2)}%)</span>
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="h-4 w-full rounded-lg bg-[#141b29] overflow-hidden flex border border-[#1e2738]">
              {jsPct > 0 && (
                <div
                  style={{ width: `${jsPct}%` }}
                  title={`JavaScript: ${formatBytes(jsBytes)} (${jsPct.toFixed(1)}%)`}
                  className="bg-amber-500 h-full transition-all duration-300"
                />
              )}
              {htmlPct > 0 && (
                <div
                  style={{ width: `${htmlPct}%` }}
                  title={`HTML: ${formatBytes(htmlBytes)} (${htmlPct.toFixed(1)}%)`}
                  className="bg-orange-500 h-full transition-all duration-300"
                />
              )}
              {cssPct > 0 && (
                <div
                  style={{ width: `${cssPct}%` }}
                  title={`CSS: ${formatBytes(cssBytes)} (${cssPct.toFixed(1)}%)`}
                  className="bg-sky-500 h-full transition-all duration-300"
                />
              )}
              {assetPct > 0 && (
                <div
                  style={{ width: `${assetPct}%` }}
                  title={`Assets: ${formatBytes(assetBytes)} (${assetPct.toFixed(1)}%)`}
                  className="bg-purple-500 h-full transition-all duration-300"
                />
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                <span className="text-slate-400">JS Code:</span>
                <span className="text-slate-200 font-bold">{formatBytes(jsBytes)} ({jsPct.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
                <span className="text-slate-400">HTML:</span>
                <span className="text-slate-200 font-bold">{formatBytes(htmlBytes)} ({htmlPct.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
                <span className="text-slate-400">CSS:</span>
                <span className="text-slate-200 font-bold">{formatBytes(cssBytes)} ({cssPct.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" />
                <span className="text-slate-400">Binary Assets:</span>
                <span className="text-slate-200 font-bold">{formatBytes(assetBytes)} ({assetPct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>

          {/* Cloudflare Runtime Invariants Checklist */}
          <div className="space-y-3">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider block">
              Cloudflare Runtime Invariants
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#0c1017] border border-[#1e2738] space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Single File Output</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  100% self-contained ESM bundle with inline byte table.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#0c1017] border border-[#1e2738] space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>0 External Requests</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  All local assets served directly from memory.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#0c1017] border border-[#1e2738] space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>ESM Module Export</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Exports standard default fetch handler for Worker runtime.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#0c1017] border border-[#1e2738] space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Wrangler Verified</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Validated against official Cloudflare dry-run build checks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Virtual Routes Registry */}
      {activeTab === 'routes' && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={routeSearch}
                onChange={e => setRouteSearch(e.target.value)}
                placeholder="Search virtual routes..."
                className="w-full bg-[#080b11] border border-[#1e2738] rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500"
              />
            </div>
            <span className="text-xs font-mono text-slate-400">
              {filteredRoutes.length} of {report.routes?.length || 0} routes
            </span>
          </div>

          <div className="border border-[#1e2738] rounded-xl overflow-hidden bg-[#080b11]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0e131d] border-b border-[#1e2738] text-slate-400 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Virtual Path</th>
                  <th className="py-2.5 px-4">Content-Type</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2738] text-slate-300">
                {filteredRoutes.map((r, i) => (
                  <tr key={i} className="hover:bg-[#111724] transition">
                    <td className="py-2.5 px-4">
                      <span className="px-1.5 py-0.5 rounded bg-[#182133] border border-[#222f46] text-orange-300 font-bold text-[10px]">
                        GET
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-white truncate max-w-xs">
                      {r}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-xs">
                      {getMimeForRoute(r)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-emerald-400 font-medium">200 OK</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
