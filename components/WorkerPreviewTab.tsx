'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Send,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
  Monitor,
  Tablet,
  Code,
  List,
} from 'lucide-react';

interface WorkerPreviewTabProps {
  workerCode: string;
  routes?: string[];
}

export function WorkerPreviewTab({ workerCode, routes }: WorkerPreviewTabProps) {
  const [method, setMethod] = useState<'GET' | 'POST' | 'HEAD'>('GET');
  const [path, setPath] = useState('/');
  const [isLoading, setIsLoading] = useState(false);
  const [responseHtml, setResponseHtml] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [statusCode, setStatusCode] = useState<number>(200);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'preview' | 'body' | 'headers'>('preview');
  const [deviceViewport, setDeviceViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);

  // Send virtual request to the worker execution simulator API
  const handleSendRequest = React.useCallback(
    async (overridePath?: string) => {
      const targetPath = overridePath !== undefined ? overridePath : path;
      setIsLoading(true);
      const start = performance.now();

      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerCode,
            request: {
              url: `https://worker.dev${targetPath.startsWith('/') ? targetPath : '/' + targetPath}`,
              method,
            },
          }),
        });

        const data = await res.json();
        setLatencyMs(Math.round(performance.now() - start));
        setStatusCode(data.status || 200);
        setResponseHeaders(data.headers || {});
        setResponseHtml(data.body || '');
      } catch (err: any) {
        setLatencyMs(Math.round(performance.now() - start));
        setStatusCode(500);
        setResponseHtml(`Error simulating worker execution: ${err.message}`);
        setResponseHeaders({});
      } finally {
        setIsLoading(false);
      }
    },
    [path, method, workerCode]
  );

  // Initial load request to root path
  useEffect(() => {
    let ignore = false;
    const initialFetch = async () => {
      setIsLoading(true);
      const start = performance.now();
      try {
        const res = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerCode,
            request: {
              url: 'https://worker.dev/',
              method: 'GET',
            },
          }),
        });
        const data = await res.json();
        if (!ignore) {
          setLatencyMs(Math.round(performance.now() - start));
          setStatusCode(data.status || 200);
          setResponseHeaders(data.headers || {});
          setResponseHtml(data.body || '');
        }
      } catch (err: any) {
        if (!ignore) {
          setLatencyMs(Math.round(performance.now() - start));
          setStatusCode(500);
          setResponseHtml(`Error simulating worker execution: ${err.message}`);
          setResponseHeaders({});
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    initialFetch();

    return () => {
      ignore = true;
    };
  }, [workerCode]);

  const handleCopyBody = async () => {
    if (!responseHtml) return;
    try {
      await navigator.clipboard.writeText(responseHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl overflow-hidden space-y-0">
      {/* Header & HTTP Request Console */}
      <div className="p-4 sm:p-5 border-b border-[#1a2233] bg-[#0c1017] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-orange-400" />
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              Live Cloudflare Worker Simulator
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                statusCode >= 200 && statusCode < 300
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {statusCode} {statusCode === 200 ? 'OK' : ''}
            </span>
            <span className="text-slate-400 font-medium">{latencyMs}ms</span>
          </div>
        </div>

        {/* URL / Request Input Bar */}
        <div className="flex items-center gap-2">
          <select
            value={method}
            onChange={e => setMethod(e.target.value as any)}
            className="bg-[#141b29] border border-[#1e2738] rounded-xl px-3 py-2 text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="HEAD">HEAD</option>
          </select>

          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-xs font-mono text-slate-500 select-none">
              https://worker.dev
            </span>
            <input
              type="text"
              value={path}
              onChange={e => setPath(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSendRequest();
              }}
              placeholder="/ (root route)"
              className="w-full bg-[#080b11] border border-[#1e2738] rounded-xl pl-[145px] pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <button
            onClick={() => handleSendRequest()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-mono font-bold shadow-md shadow-orange-500/20 transition cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        {/* Quick Route Preset Chips */}
        {routes && routes.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0">
              Quick Routes:
            </span>
            {routes.slice(0, 8).map((routeStr, i) => (
              <button
                key={i}
                onClick={() => {
                  setPath(routeStr);
                  handleSendRequest(routeStr);
                }}
                className={`px-2 py-0.5 rounded-md border text-[11px] shrink-0 transition cursor-pointer ${
                  path === routeStr
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-semibold'
                    : 'bg-[#141b29] hover:bg-[#1a2335] border-[#222d40] text-slate-300'
                }`}
              >
                {routeStr}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode Toolbar: Preview | Raw Body | Headers & Device Viewport */}
      <div className="px-4 py-2 bg-[#0c1017] border-b border-[#1a2233] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'preview'
                ? 'bg-[#1e2738] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Rendered View</span>
          </button>
          <button
            onClick={() => setViewMode('body')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'body'
                ? 'bg-[#1e2738] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>Raw Response</span>
          </button>
          <button
            onClick={() => setViewMode('headers')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'headers'
                ? 'bg-[#1e2738] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Headers</span>
          </button>
        </div>

        {/* Device Switcher (only in preview mode) */}
        {viewMode === 'preview' && (
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#141b29] border border-[#1e2738]">
            <button
              onClick={() => setDeviceViewport('desktop')}
              className={`p-1.5 rounded transition cursor-pointer ${
                deviceViewport === 'desktop' ? 'bg-[#1e2738] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Desktop (100%)"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeviceViewport('tablet')}
              className={`p-1.5 rounded transition cursor-pointer ${
                deviceViewport === 'tablet' ? 'bg-[#1e2738] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tablet (768px)"
            >
              <Tablet className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeviceViewport('mobile')}
              className={`p-1.5 rounded transition cursor-pointer ${
                deviceViewport === 'mobile' ? 'bg-[#1e2738] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mobile (375px)"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {viewMode === 'body' && (
          <button
            onClick={handleCopyBody}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#141b29] hover:bg-[#1a2335] text-slate-300 text-xs font-mono transition cursor-pointer"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}
      </div>

      {/* Main View Area */}
      <div className="bg-[#07090e] min-h-[420px] flex items-center justify-center p-4">
        {viewMode === 'preview' && (
          <div
            className={`transition-all duration-200 h-[500px] bg-white rounded-xl overflow-hidden shadow-2xl border border-[#1e2738] ${
              deviceViewport === 'mobile'
                ? 'w-[375px]'
                : deviceViewport === 'tablet'
                ? 'w-[768px]'
                : 'w-full'
            }`}
          >
            <iframe
              title="Cloudflare Worker Live Simulator"
              srcDoc={responseHtml || '<div style="font-family:sans-serif;padding:2rem;">No response body</div>'}
              className="w-full h-full border-0 bg-white text-black"
              sandbox="allow-scripts allow-forms"
            />
          </div>
        )}

        {viewMode === 'body' && (
          <div className="w-full h-[500px] overflow-auto bg-[#080b11] p-4 rounded-xl border border-[#1e2738] text-xs font-mono text-slate-300 select-text leading-relaxed whitespace-pre-wrap">
            {responseHtml || '// Empty response'}
          </div>
        )}

        {viewMode === 'headers' && (
          <div className="w-full h-[500px] overflow-auto bg-[#080b11] p-4 rounded-xl border border-[#1e2738] text-xs font-mono">
            <table className="w-full text-left">
              <thead className="border-b border-[#1e2738] text-slate-400 uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3">Header Name</th>
                  <th className="py-2 px-3">Header Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2738] text-slate-300">
                {Object.entries(responseHeaders).map(([k, v], idx) => (
                  <tr key={idx} className="hover:bg-[#111724]">
                    <td className="py-2 px-3 font-semibold text-orange-300 font-mono">{k}</td>
                    <td className="py-2 px-3 text-slate-300 font-mono">{v}</td>
                  </tr>
                ))}
                {Object.keys(responseHeaders).length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-slate-500">
                      No custom headers returned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
