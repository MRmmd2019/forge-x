'use client';

import React from 'react';
import {
  Sliders,
  Settings,
  Shield,
  FileCode,
  Key,
  Layers,
  Cpu,
  Lock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { ObfuscatorCustomOptions } from '@/types/obfuscator';

interface Props {
  options: ObfuscatorCustomOptions;
  onChange: (options: ObfuscatorCustomOptions) => void;
  onReset: () => void;
}

export function ObfuscatorOptionsDrawer({ options, onChange, onReset }: Props) {
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    basic: true,
    identifiers: true,
    stringArray: true,
    transforms: false,
    protection: false,
    vm: false,
  });

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const update = <K extends keyof ObfuscatorCustomOptions>(key: K, value: ObfuscatorCustomOptions[K]) => {
    onChange({
      ...options,
      [key]: value,
    });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Obfuscation Parameters</h3>
        </div>
        <button
          onClick={onReset}
          title="Reset to default options"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-slate-800/60"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      <div className="overflow-y-auto p-4 space-y-4 text-xs flex-1 custom-scrollbar">
        {/* SECTION 1: Basic Options */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('basic')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-400" />
              <span>Basic & Environment Settings</span>
            </div>
            {openSections.basic ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.basic && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Target Environment</label>
                  <select
                    value={options.target}
                    onChange={e => update('target', e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="browser">Browser</option>
                    <option value="browser-no-eval">Browser (No-Eval)</option>
                    <option value="node">Node.js</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Deterministic Seed</label>
                  <input
                    type="number"
                    value={options.seed}
                    onChange={e => update('seed', parseInt(e.target.value) || 0)}
                    placeholder="0 (Random)"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.compact}
                    onChange={e => update('compact', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Compact Output</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.simplify}
                    onChange={e => update('simplify', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Simplify AST</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.strictMode}
                    onChange={e => update('strictMode', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Strict Mode (&apos;use strict&apos;)</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.parseHtml}
                    onChange={e => update('parseHtml', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Parse HTML &lt;script&gt; tags</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Identifier Naming & Renaming */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('identifiers')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-amber-400" />
              <span>Identifiers & Renaming</span>
            </div>
            {openSections.identifiers ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.identifiers && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Name Generator</label>
                  <select
                    value={options.identifierNamesGenerator}
                    onChange={e => update('identifierNamesGenerator', e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="hexadecimal">Hexadecimal (_0x4f12)</option>
                    <option value="mangled">Mangled (a, b, c)</option>
                    <option value="mangled-shuffled">Mangled Shuffled</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Identifier Prefix</label>
                  <input
                    type="text"
                    value={options.identifiersPrefix}
                    onChange={e => update('identifiersPrefix', e.target.value)}
                    placeholder="e.g. af_"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.renameGlobals}
                    onChange={e => update('renameGlobals', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Rename Globals</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.renameProperties}
                    onChange={e => update('renameProperties', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Rename Properties</span>
                </label>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Reserved Names (Regex or comma-separated)</label>
                <input
                  type="text"
                  value={options.reservedNames.join(', ')}
                  onChange={e =>
                    update(
                      'reservedNames',
                      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="e.g. fetch, handleRequest, env"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: String Array Defense */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('stringArray')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>String Array Encryption & Access</span>
            </div>
            {openSections.stringArray ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.stringArray && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <label className="flex items-center justify-between text-slate-200 font-medium">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.stringArray}
                    onChange={e => update('stringArray', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Enable String Array Extraction</span>
                </span>
                <span className="text-xs text-indigo-400 font-mono">
                  {(options.stringArrayThreshold * 100).toFixed(0)}%
                </span>
              </label>

              {options.stringArray && (
                <>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Threshold Rate</span>
                      <span>{options.stringArrayThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={options.stringArrayThreshold}
                      onChange={e => update('stringArrayThreshold', parseFloat(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1 font-medium">String Encoding</label>
                      <select
                        value={options.stringArrayEncoding[0] || 'none'}
                        onChange={e => update('stringArrayEncoding', [e.target.value as any])}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        <option value="none">None (Plain Array)</option>
                        <option value="base64">Base64 Encoded</option>
                        <option value="rc4">RC4 (Polymorphic Encryption)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1 font-medium">Wrappers Count</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={options.stringArrayWrappersCount}
                        onChange={e => update('stringArrayWrappersCount', parseInt(e.target.value) || 1)}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.stringArrayRotate}
                        onChange={e => update('stringArrayRotate', e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                      />
                      <span>Rotate Array</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.stringArrayShuffle}
                        onChange={e => update('stringArrayShuffle', e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                      />
                      <span>Shuffle Array</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.stringArrayIndexShift}
                        onChange={e => update('stringArrayIndexShift', e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                      />
                      <span>Index Shift</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.stringArrayWrappersChainedCalls}
                        onChange={e => update('stringArrayWrappersChainedCalls', e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                      />
                      <span>Chained Calls</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* SECTION 4: Transforms & Control Flow */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('transforms')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Control Flow & Transformations</span>
            </div>
            {openSections.transforms ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.transforms && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <div className="space-y-2">
                <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={options.controlFlowFlattening}
                      onChange={e => update('controlFlowFlattening', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                    />
                    <span>Control Flow Flattening (Switch Dispatcher)</span>
                  </span>
                  {options.controlFlowFlattening && (
                    <span className="text-[11px] text-purple-400 font-mono">
                      {(options.controlFlowFlatteningThreshold * 100).toFixed(0)}%
                    </span>
                  )}
                </label>

                {options.controlFlowFlattening && (
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={options.controlFlowFlatteningThreshold}
                    onChange={e => update('controlFlowFlatteningThreshold', parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={options.deadCodeInjection}
                      onChange={e => update('deadCodeInjection', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                    />
                    <span>Dead Code Injection</span>
                  </span>
                  {options.deadCodeInjection && (
                    <span className="text-[11px] text-purple-400 font-mono">
                      {(options.deadCodeInjectionThreshold * 100).toFixed(0)}%
                    </span>
                  )}
                </label>

                {options.deadCodeInjection && (
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={options.deadCodeInjectionThreshold}
                    onChange={e => update('deadCodeInjectionThreshold', parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.numbersToExpressions}
                    onChange={e => update('numbersToExpressions', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Numbers to Expressions</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.transformObjectKeys}
                    onChange={e => update('transformObjectKeys', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Transform Object Keys</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.splitStrings}
                    onChange={e => update('splitStrings', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Split Long Strings</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.unicodeEscapeSequence}
                    onChange={e => update('unicodeEscapeSequence', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <span>Unicode Escape Sequences</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 5: Protection & Anti-Tamper */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('protection')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              <span>Anti-Tampering & Protection</span>
            </div>
            {openSections.protection ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.protection && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.selfDefending}
                    onChange={e => update('selfDefending', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <div>
                    <span className="font-medium text-slate-200">Self Defending</span>
                    <p className="text-[11px] text-slate-400">Crash or loop infinitely if code is pretty-printed or formatted.</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.debugProtection}
                    onChange={e => update('debugProtection', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <div>
                    <span className="font-medium text-slate-200">Debug Protection</span>
                    <p className="text-[11px] text-slate-400">Freeze browser DevTools inspect element.</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.disableConsoleOutput}
                    onChange={e => update('disableConsoleOutput', e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                  />
                  <div>
                    <span className="font-medium text-slate-200">Disable Console Output</span>
                    <p className="text-[11px] text-slate-400">Mutes console.log, console.warn, and console.error.</p>
                  </div>
                </label>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Domain Lock (Allowed hostnames)</label>
                <input
                  type="text"
                  value={options.domainLock.join(', ')}
                  onChange={e =>
                    update(
                      'domainLock',
                      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="e.g. .example.com, myapp.com"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 6: VM Obfuscation (Bytecode Stack Virtual Machine) */}
        <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('vm')}
            className="w-full px-3.5 py-2.5 flex items-center justify-between font-medium text-slate-200 hover:bg-slate-800/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <div className="flex items-center gap-1.5">
                <span>VM Bytecode Virtualization</span>
                <span className="px-1.5 py-0.5 text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/80 rounded">Pro</span>
              </div>
            </div>
            {openSections.vm ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {openSections.vm && (
            <div className="p-3.5 border-t border-slate-800/60 space-y-3 bg-slate-900/40">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.enableVm}
                  onChange={e => update('enableVm', e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-0 bg-slate-950"
                />
                <div>
                  <span className="font-medium text-slate-200">Enable Virtual Machine Engine</span>
                  <p className="text-[11px] text-slate-400">Embeds a stack-based virtual machine runtime with randomized opcodes.</p>
                </div>
              </label>

              {options.enableVm && (
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">VM Strength Level</label>
                  <select
                    value={options.vmStrength}
                    onChange={e => update('vmStrength', e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
                  >
                    <option value="low">VM Low (Fast evaluation)</option>
                    <option value="default">VM Default (Recommended)</option>
                    <option value="high">VM High (Multi-cycle)</option>
                    <option value="ultra">VM Ultra High (Maximum Entropy)</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
