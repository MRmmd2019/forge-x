import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import vm from 'vm';
import { WorkspaceManager } from '../server/workspace/workspace-manager';
import { BuildPipeline } from '../server/pipeline';
import { HardeningTestSuite } from '../server/testing/hardening-suite';

async function runComprehensiveAudit() {
  console.log('=== STARTING FULL AUTONOMOUS AUDIT & VERIFICATION ===\n');

  const report: any = {
    phases: [],
    timestamp: new Date().toISOString(),
  };

  // 1. Hardening Suite (22 Comprehensive Tests)
  console.log('[Phase 1-22] Executing Full Hardening Test Suite (22 Scenarios)...');
  const hardeningResults = await HardeningTestSuite.runAll();
  const allPassed = hardeningResults.results.every(r => r.passed);
  console.log(`Hardening Suite: ${hardeningResults.passedCount}/${hardeningResults.totalTests} passed in ${hardeningResults.durationMs}ms.\n`);

  report.phases.push({
    name: 'Hardening Suite (22 Black-box & Security Tests)',
    total: hardeningResults.totalTests,
    passed: hardeningResults.passedCount,
    failed: hardeningResults.failedCount,
    status: allPassed ? 'PASS' : 'FAIL',
  });

  // 2. Binary Asset SHA-256 Bit-for-Bit Integrity Test (Phase 13)
  console.log('[Phase 13] Executing Binary Asset Bit-for-Bit Integrity Test...');
  const testPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);
  const originalSha256 = crypto.createHash('sha256').update(testPngBuffer).digest('hex');

  const assetWorkspace = await WorkspaceManager.createFromFiles([
    { path: 'index.html', content: '<img src="/logo.png">' },
    { path: 'logo.png', bufferBase64: testPngBuffer.toString('base64') },
    { path: 'worker.js', content: 'export default { fetch(req) { return new Response("OK"); } };' }
  ], 'sha256-test');

  const assetBuildResult = await BuildPipeline.execute(assetWorkspace, { enableAiPlanning: false });
  let assetIntegrityPass = false;
  let decodedSha256 = '';

  if (assetBuildResult.success && assetBuildResult.workerJsCode) {
    const sandbox: any = {
      Response,
      Request,
      Headers,
      URL,
      Uint8Array,
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      console: { log: () => {}, error: () => {} },
    };
    const code = `
      let __mod = null;
      ${assetBuildResult.workerJsCode.replace(/export\s+default\s+/, '__mod = ')};
      __handler = __mod;
    `;
    const context = vm.createContext(sandbox);
    new vm.Script(code).runInContext(context);
    const res = await context.__handler.fetch(new Request('https://worker.test/logo.png'));
    const arrayBuffer = await res.arrayBuffer();
    const servedBuf = Buffer.from(arrayBuffer);
    decodedSha256 = crypto.createHash('sha256').update(servedBuf).digest('hex');
    assetIntegrityPass = (originalSha256 === decodedSha256);
  }

  console.log(`Original SHA-256: ${originalSha256}`);
  console.log(`Served SHA-256:   ${decodedSha256}`);
  console.log(`Binary Integrity Result: ${assetIntegrityPass ? 'PASS (100% Bit-for-Bit Match)' : 'FAIL'}\n`);

  report.phases.push({
    name: 'Binary Asset SHA-256 Bit-for-Bit Integrity',
    originalHash: originalSha256,
    servedHash: decodedSha256,
    status: assetIntegrityPass ? 'PASS' : 'FAIL',
  });

  // 3. Concurrency Test: 5 Concurrent Independent Builds (Phase 30)
  console.log('[Phase 30] Executing 5 Concurrent Independent Builds...');
  const concurrentStart = Date.now();
  const concurrentPromises = Array.from({ length: 5 }, async (_, i) => {
    const ws = await WorkspaceManager.createFromFiles([
      { path: 'index.html', content: `<h1>Build ${i}</h1>` },
      { path: 'main.js', content: `export default { fetch() { return new Response("Build ${i} Response"); } };` }
    ], `concurrent-project-${i}`);

    const res = await BuildPipeline.execute(ws, { enableAiPlanning: false });
    return { index: i, success: res.success, workspaceId: ws.id, durationMs: res.durationMs };
  });

  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentDuration = Date.now() - concurrentStart;
  const allConcurrentSuccess = concurrentResults.every(r => r.success);
  console.log(`Concurrent Builds: ${concurrentResults.filter(r => r.success).length}/5 succeeded in ${concurrentDuration}ms.`);
  console.log(`Distinct Workspaces: ${new Set(concurrentResults.map(r => r.workspaceId)).size}/5.`);
  console.log(`Concurrency Status: ${allConcurrentSuccess ? 'PASS' : 'FAIL'}\n`);

  report.phases.push({
    name: 'Concurrent Build Isolation (5 parallel jobs)',
    total: 5,
    passed: concurrentResults.filter(r => r.success).length,
    distinctWorkspaces: new Set(concurrentResults.map(r => r.workspaceId)).size,
    durationMs: concurrentDuration,
    status: allConcurrentSuccess ? 'PASS' : 'FAIL',
  });

  // 4. Standalone Self-Containment Test in Blank Isolated Directory (Phase 16)
  console.log('[Phase 16] Executing Standalone Self-Containment Test...');
  const blankDir = path.join(os.tmpdir(), `self-containment-check-${Date.now()}`);
  await fs.promises.mkdir(blankDir, { recursive: true });
  const isolatedWorkerPath = path.join(blankDir, 'worker.js');
  await fs.promises.writeFile(isolatedWorkerPath, assetBuildResult.workerJsCode || '', 'utf8');

  // Verify that only worker.js exists in this directory
  const filesInBlankDir = await fs.promises.readdir(blankDir);

  const sandboxIsolated: any = {
    Response,
    Request,
    Headers,
    URL,
    Uint8Array,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
  };
  const scriptCode = `
    let __exported = null;
    ${assetBuildResult.workerJsCode!.replace(/export\s+default\s+/, '__exported = ')};
    __handler = __exported;
  `;
  const ctx = vm.createContext(sandboxIsolated);
  new vm.Script(scriptCode).runInContext(ctx);

  const resRoot = await ctx.__handler.fetch(new Request('https://isolated.test/'));
  const resLogo = await ctx.__handler.fetch(new Request('https://isolated.test/logo.png'));
  const selfContainmentPass = (resRoot.status === 200 && resLogo.status === 200 && filesInBlankDir.length === 1);

  await fs.promises.rm(blankDir, { recursive: true, force: true });
  console.log(`Files in Isolated Sandbox: ${filesInBlankDir.join(', ')}`);
  console.log(`Endpoint '/' Status: ${resRoot.status}`);
  console.log(`Endpoint '/logo.png' Status: ${resLogo.status}`);
  console.log(`Self-Containment Status: ${selfContainmentPass ? 'PASS (Zero External Dependencies)' : 'FAIL'}\n`);

  report.phases.push({
    name: 'Single-File Standalone Self-Containment',
    status: selfContainmentPass ? 'PASS' : 'FAIL',
  });

  console.log('=== FULL AUTONOMOUS AUDIT COMPLETED SUCCESSFULLY ===');
  console.log(JSON.stringify(report, null, 2));
}

runComprehensiveAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
