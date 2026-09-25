'use client';

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FolderUp,
  FileCode2,
  Archive,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Code,
  Layers,
  ArrowDownToLine,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { SampleProject } from '@/types/bundler';

const CLIENT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.vscode',
  '.idea',
  '__macosx',
]);

const CLIENT_IGNORED_FILES = new Set(['.ds_store', 'thumbs.db']);

function isIgnoredPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((s, idx) => {
    const lower = s.toLowerCase();
    if (CLIENT_IGNORED_DIRS.has(lower)) return true;
    if (idx === segments.length - 1 && CLIENT_IGNORED_FILES.has(lower)) return true;
    return false;
  });
}

interface ProjectUploaderProps {
  onZipSelect: (file: File) => void;
  onFilesSelect: (files: { file: File; path: string }[], projectName: string) => void;
  onSampleSelect: (sample: SampleProject) => void;
  samples: SampleProject[];
  currentProjectName?: string;
  fileCount?: number;
  isBuilding: boolean;
}

export function ProjectUploader({
  onZipSelect,
  onFilesSelect,
  onSampleSelect,
  samples,
  currentProjectName,
  fileCount,
  isBuilding,
}: ProjectUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError(null);
    if (isBuilding) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const first = e.dataTransfer.files[0];
      if (first.name.endsWith('.zip')) {
        if (first.size > 30 * 1024 * 1024) {
          setUploadError(`ZIP file (${(first.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 30MB limit. Please exclude node_modules or large assets.`);
          return;
        }
        setFilterNotice(null);
        onZipSelect(first);
      } else {
        const items: { file: File; path: string }[] = [];
        let skippedCount = 0;

        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const f = e.dataTransfer.files[i];
          const relPath = (f as any).webkitRelativePath || f.name;
          if (isIgnoredPath(relPath)) {
            skippedCount++;
          } else {
            items.push({ file: f, path: relPath });
          }
        }

        if (items.length === 0) {
          setUploadError('No valid source files found. All files were in ignored directories (node_modules, .git, etc.).');
          return;
        }

        if (skippedCount > 0) {
          setFilterNotice(`Excluded ${skippedCount.toLocaleString()} dependency & cache files (node_modules, .git). Selected ${items.length} source files.`);
        } else {
          setFilterNotice(null);
        }

        const projName = first.name.split('.')[0] || 'dropped-project';
        onFilesSelect(items, projName);
      }
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (!e.target.files || e.target.files.length === 0) return;
    const items: { file: File; path: string }[] = [];
    const firstRel = (e.target.files[0] as any).webkitRelativePath || '';
    const folderName = firstRel.split('/')[0] || 'uploaded-folder';
    let skippedCount = 0;

    for (let i = 0; i < e.target.files.length; i++) {
      const f = e.target.files[i];
      const relPath = (f as any).webkitRelativePath || f.name;
      if (isIgnoredPath(relPath)) {
        skippedCount++;
      } else {
        items.push({ file: f, path: relPath });
      }
    }

    if (items.length === 0) {
      setUploadError('No valid source files found in this folder. All files were inside ignored directories like node_modules or .git.');
      e.target.value = '';
      return;
    }

    if (skippedCount > 0) {
      setFilterNotice(`Optimized: Excluded ${skippedCount.toLocaleString()} dependency/cache files (node_modules, .git). Loaded ${items.length} project files.`);
    } else {
      setFilterNotice(null);
    }

    e.target.value = '';
    onFilesSelect(items, folderName);
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (!e.target.files || e.target.files.length === 0) return;
    const items: { file: File; path: string }[] = [];
    let skippedCount = 0;

    for (let i = 0; i < e.target.files.length; i++) {
      const f = e.target.files[i];
      if (isIgnoredPath(f.name)) {
        skippedCount++;
      } else {
        items.push({ file: f, path: f.name });
      }
    }

    if (items.length === 0) {
      setUploadError('No valid source files selected.');
      e.target.value = '';
      return;
    }

    if (skippedCount > 0) {
      setFilterNotice(`Excluded ${skippedCount} ignored files.`);
    } else {
      setFilterNotice(null);
    }

    const sampleName = items[0]?.path.replace(/\.[^/.]+$/, '') || 'files-project';
    e.target.value = '';
    onFilesSelect(items, sampleName);
  };

  const handleZipChange = (file: File) => {
    setUploadError(null);
    if (file.size > 30 * 1024 * 1024) {
      setUploadError(`ZIP file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 30MB server limit. Please exclude node_modules or build directories before zipping.`);
      return;
    }
    setFilterNotice(null);
    onZipSelect(file);
  };

  return (
    <div className="space-y-4">
      {/* Hidden File Inputs */}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) {
            handleZipChange(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderChange}
      />
      <input
        ref={multiFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleMultiFileChange}
      />

      {/* Optimization and Exclusion Notice */}
      {filterNotice && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-950/40 border border-sky-800/60 text-sky-300 text-xs font-mono animate-in fade-in">
          <Filter className="h-4 w-4 text-sky-400 shrink-0" />
          <span>{filterNotice}</span>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs font-mono animate-in fade-in">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Main Dropzone Surface */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all duration-200 ${
          dragActive
            ? 'border-orange-500 bg-orange-500/10 scale-[0.99]'
            : currentProjectName
            ? 'border-[#253247] bg-[#0c1017]'
            : 'border-[#1e2738] bg-[#0c1017] hover:border-[#2d3b52]'
        }`}
      >
        <div className="max-w-lg mx-auto space-y-3.5">
          <div className="inline-flex p-3 rounded-2xl bg-[#141b29] text-orange-400 border border-[#222d40] shadow-inner">
            <UploadCloud className="h-6 w-6" />
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-mono tracking-tight">
              {currentProjectName ? 'Workspace Loaded' : 'Drop your project here'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              Vanilla JS/TS, HTML, CSS & assets. Automatically bundled into a single standalone <span className="text-slate-200 font-mono">worker.js</span>.
            </p>
          </div>

          {/* Active Project Tag */}
          {currentProjectName && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs font-mono">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold">{currentProjectName}</span>
              <span className="text-emerald-500/60">•</span>
              <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
            </div>
          )}

          {/* 3 Intake Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              id="upload-zip-btn"
              type="button"
              disabled={isBuilding}
              onClick={() => zipInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono font-medium border border-[#222d40] hover:border-slate-600 transition cursor-pointer disabled:opacity-50"
            >
              <Archive className="h-4 w-4 text-orange-400" />
              <span>ZIP Archive</span>
            </button>

            <button
              id="upload-folder-btn"
              type="button"
              disabled={isBuilding}
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono font-medium border border-[#222d40] hover:border-slate-600 transition cursor-pointer disabled:opacity-50"
            >
              <FolderUp className="h-4 w-4 text-sky-400" />
              <span>Folder</span>
            </button>

            <button
              id="upload-files-btn"
              type="button"
              disabled={isBuilding}
              onClick={() => multiFileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141b29] hover:bg-[#1a2335] text-slate-200 text-xs font-mono font-medium border border-[#222d40] hover:border-slate-600 transition cursor-pointer disabled:opacity-50"
            >
              <FileCode2 className="h-4 w-4 text-emerald-400" />
              <span>Multi-File</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1-Click Sample Projects Bar */}
      {samples.length > 0 && (
        <div className="bg-[#0e131d] border border-[#1e2738] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Quick Test Projects
            </span>
            <span className="text-[10px] text-slate-400 font-mono">1-click instant load</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {samples.map(s => {
              const isSelected = currentProjectName === s.name;
              return (
                <button
                  key={s.id}
                  disabled={isBuilding}
                  onClick={() => onSampleSelect(s)}
                  className={`text-left p-3 rounded-xl border transition group cursor-pointer disabled:opacity-50 ${
                    isSelected
                      ? 'bg-[#141c2c] border-orange-500/60 ring-1 ring-orange-500/20'
                      : 'bg-[#111722] hover:bg-[#161e2e] border-[#1e2738] hover:border-[#2d3a50]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-orange-400 font-mono transition truncate">
                      {s.name}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-orange-400 transition shrink-0 ml-1" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span className="text-slate-300 font-medium">{s.files.length} files</span>
                    <span className="text-slate-600">•</span>
                    <span className="capitalize px-1.5 py-0.5 rounded bg-[#182133] border border-[#222e44] text-orange-300/90">
                      {s.category.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
