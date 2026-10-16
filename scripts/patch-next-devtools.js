const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// 1. Patch CJS segment-explorer-node.js
const cjsPath = path.join(root, 'node_modules/next/dist/next-devtools/userspace/app/segment-explorer-node.js');
if (fs.existsSync(cjsPath)) {
  const cjsSafe = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentViewNode = function(param) { return (param && param.children) || null; };
exports.SegmentViewStateNode = function() { return null; };
exports.SegmentBoundaryTriggerNode = function() { return null; };
exports.SegmentStateProvider = function(param) { return (param && param.children) || null; };
exports.useSegmentState = function() { return { boundaryType: null, setBoundaryType: function(){} }; };
exports.SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE = 'NEXT_DEVTOOLS_SIMULATED_ERROR';
`;
  fs.writeFileSync(cjsPath, cjsSafe, 'utf8');
  console.log('[patch-next-devtools] Successfully patched CJS segment-explorer-node.js');
}

// 2. Patch ESM segment-explorer-node.js
const esmPath = path.join(root, 'node_modules/next/dist/esm/next-devtools/userspace/app/segment-explorer-node.js');
if (fs.existsSync(esmPath)) {
  const esmSafe = `export function SegmentViewNode(param) { return (param && param.children) || null; }
export function SegmentViewStateNode() { return null; }
export function SegmentBoundaryTriggerNode() { return null; }
export function SegmentStateProvider(param) { return (param && param.children) || null; }
export function useSegmentState() { return { boundaryType: null, setBoundaryType() {} }; }
export const SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE = 'NEXT_DEVTOOLS_SIMULATED_ERROR';
`;
  fs.writeFileSync(esmPath, esmSafe, 'utf8');
  console.log('[patch-next-devtools] Successfully patched ESM segment-explorer-node.js');
}

// 3. Patch entry-base.js
const entryBasePath = path.join(root, 'node_modules/next/dist/server/app-render/entry-base.js');
if (fs.existsSync(entryBasePath)) {
  let content = fs.readFileSync(entryBasePath, 'utf8');
  if (content.includes("const mod = require('../../next-devtools/userspace/app/segment-explorer-node');")) {
    content = content.replace(
      "const mod = require('../../next-devtools/userspace/app/segment-explorer-node');\n    SegmentViewNode = mod.SegmentViewNode;\n    SegmentViewStateNode = mod.SegmentViewStateNode;",
      "SegmentViewNode = (param) => (param && param.children) || null;\n    SegmentViewStateNode = () => null;"
    );
    fs.writeFileSync(entryBasePath, content, 'utf8');
    console.log('[patch-next-devtools] Successfully patched entry-base.js');
  }
}
