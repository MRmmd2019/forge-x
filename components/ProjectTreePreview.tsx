'use client';

import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Image as ImageIcon,
  FileJson,
  File,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Search,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  FileType2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { DirectoryTreeNode, ScanResult } from '@/types/bundler';
import { formatBytes } from '@/lib/utils';

interface ProjectTreePreviewProps {
  scanResult?: ScanResult;
  files?: { path: string; size?: number; content?: string }[];
  projectName?: string;
}

function getFileIcon(ext?: string) {
  if (!ext) return <File className="h-4 w-4 text-slate-400 shrink-0" />;
  const lower = ext.toLowerCase();
  if (['.ts', '.tsx', '.mts'].includes(lower)) return <FileCode className="h-4 w-4 text-blue-400 shrink-0" />;
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(lower)) return <FileCode className="h-4 w-4 text-amber-400 shrink-0" />;
  if (['.html', '.htm'].includes(lower)) return <FileCode className="h-4 w-4 text-orange-400 shrink-0" />;
  if (['.css'].includes(lower)) return <FileCode className="h-4 w-4 text-sky-400 shrink-0" />;
  if (['.json'].includes(lower)) return <FileJson className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico'].includes(lower))
    return <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />;
  if (['.wasm'].includes(lower)) return <FileType2 className="h-4 w-4 text-rose-400 shrink-0" />;
  return <FileText className="h-4 w-4 text-slate-400 shrink-0" />;
}

function TreeNodeItem({
  node,
  depth = 0,
  selectedPath,
  onSelectPath,
}: {
  node: DirectoryTreeNode;
  depth?: number;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isDir = node.type === 'directory';
  const isSelected = selectedPath === node.path;

  if (node.name === 'root') {
    return (
      <div className="space-y-0.5">
        {node.children?.map((child, idx) => (
          <TreeNodeItem
            key={idx}
            node={child}
            depth={depth}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => {
          if (isDir) {
            setIsOpen(!isOpen);
          } else if (onSelectPath) {
            onSelectPath(node.path);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={`flex items-center justify-between py-1 px-2 rounded-md text-xs transition select-none ${
          isSelected
            ? 'bg-orange-500/15 text-orange-300 font-medium'
            : isDir
            ? 'cursor-pointer hover:bg-[#141b29] text-slate-300 font-medium'
            : 'cursor-pointer text-slate-400 hover:bg-[#141b29] hover:text-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {isDir ? (
            <>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="h-4 w-4 text-orange-400 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-orange-400 shrink-0" />
              )}
            </>
          ) : (
            <span className="shrink-0 ml-3.5">{getFileIcon(node.extension)}</span>
          )}
          <span className="truncate font-mono">{node.name}</span>
        </div>

        {node.size !== undefined && (
          <span className="text-[10px] text-slate-500 font-mono ml-2 shrink-0">
            {formatBytes(node.size)}
          </span>
        )}
      </div>

      {isDir && isOpen && node.children && (
        <div className="space-y-0.5">
          {node.children.map((child, idx) => (
            <TreeNodeItem
              key={idx}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectTreePreview({ scanResult, files, projectName }: ProjectTreePreviewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Filter files by search term if active
  const filteredFiles = useMemo(() => {
    const raw = files || [];
    if (!searchTerm.trim()) return raw;
    const term = searchTerm.toLowerCase();
    return raw.filter(f => f.path.toLowerCase().includes(term));
  }, [files, searchTerm]);

  if (!scanResult && (!files || files.length === 0)) return null;

  const rawFiles = files || [];
  const selectedFile = rawFiles.find(f => f.path === selectedPath);

  return (
    <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4 flex flex-col h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1a2233]">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-orange-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
            Project Explorer
          </h4>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <span>{rawFiles.length} files</span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Filter files (e.g. .ts, /src)..."
          className="w-full bg-[#080b11] border border-[#1e2738] rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/70"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-2 text-[10px] text-slate-500 hover:text-slate-300 font-mono"
          >
            clear
          </button>
        )}
      </div>

      {/* Tree / File list */}
      <div className="flex-1 max-h-72 overflow-y-auto pr-1 font-mono text-xs space-y-0.5">
        {scanResult?.tree && !searchTerm ? (
          <TreeNodeItem
            node={scanResult.tree}
            selectedPath={selectedPath || undefined}
            onSelectPath={path => setSelectedPath(path)}
          />
        ) : (
          filteredFiles.map((f, idx) => {
            const ext = '.' + f.path.split('.').pop();
            const isSelected = selectedPath === f.path;
            return (
              <div
                key={idx}
                onClick={() => setSelectedPath(f.path)}
                className={`flex items-center justify-between py-1 px-2 rounded-md transition cursor-pointer ${
                  isSelected
                    ? 'bg-orange-500/15 text-orange-300 font-medium'
                    : 'text-slate-400 hover:bg-[#141b29] hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {getFileIcon(ext)}
                  <span className="truncate">{f.path}</span>
                </div>
                {f.size !== undefined && (
                  <span className="text-[10px] text-slate-600 font-mono shrink-0">
                    {formatBytes(f.size)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Selected File Details Footer */}
      {selectedFile && (
        <div className="p-2.5 rounded-lg bg-[#141b29] border border-[#222d40] text-[11px] font-mono space-y-1">
          <div className="flex items-center justify-between text-slate-300">
            <span className="truncate font-semibold text-orange-300">{selectedFile.path}</span>
            {selectedFile.size !== undefined && (
              <span className="text-slate-400 shrink-0">{formatBytes(selectedFile.size)}</span>
            )}
          </div>
          {selectedFile.content && (
            <div className="text-[10px] text-slate-400 line-clamp-2 max-h-10 overflow-hidden text-ellipsis bg-[#0a0e16] p-1 rounded">
              {selectedFile.content.slice(0, 150)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
