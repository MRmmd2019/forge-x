import { WorkspaceManager } from '../server/workspace/workspace-manager';
import { BuildPipeline } from '../server/pipeline';

async function runBenchmark() {
  console.log('=== AUTFORGE COMPILER BENCHMARK ===\n');

  const benchmarks = [
    {
      name: 'Small Vanilla HTML/JS Project',
      files: [
        { path: 'index.html', content: '<!DOCTYPE html><html><body><h1>Hello AutoForge</h1><script src="./app.js"></script></body></html>' },
        { path: 'app.js', content: 'console.log("App ready"); document.body.style.background = "#111";' },
      ],
    },
    {
      name: 'Modular TypeScript Project with Embedded Styles',
      files: [
        { path: 'index.html', content: '<!DOCTYPE html><link rel="stylesheet" href="./style.css"><script src="./main.ts"></script>' },
        { path: 'style.css', content: 'body { color: orange; font-family: monospace; }' },
        { path: 'main.ts', content: 'import { greet } from "./utils"; console.log(greet("AutoForge"));' },
        { path: 'utils.ts', content: 'export function greet(name: string): string { return `Welcome to ${name}!`; }' },
      ],
    },
    {
      name: 'Native Cloudflare Worker with Asset Virtual Router',
      files: [
        { path: 'worker.ts', content: 'export default { fetch(req: Request) { return new Response("Worker API Active"); } };' },
        { path: 'data.json', content: JSON.stringify({ status: 'ok', version: '1.0.0' }) },
        { path: 'public/index.html', content: '<h1>Public Root</h1>' },
      ],
    },
  ];

  const results = [];

  for (const b of benchmarks) {
    const memBefore = process.memoryUsage().heapUsed;
    const t0 = Date.now();

    const ws = await WorkspaceManager.createFromFiles(b.files, `bench-${Date.now()}`);
    const res = await BuildPipeline.execute(ws);
    const durationMs = Date.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    const peakMemDeltaMb = ((memAfter - memBefore) / 1024 / 1024).toFixed(2);

    results.push({
      name: b.name,
      durationMs,
      workerSizeBytes: res.workerJsCode ? Buffer.byteLength(res.workerJsCode, 'utf8') : 0,
      success: res.success,
      memoryDeltaMb: peakMemDeltaMb,
    });

    console.log(`[BENCHMARK] ${b.name}: ${durationMs}ms (Size: ${results[results.length - 1].workerSizeBytes} bytes, Success: ${res.success})`);
  }

  console.log('\n=== BENCHMARK SUMMARY ===');
  console.table(results);
}

runBenchmark().catch(console.error);
