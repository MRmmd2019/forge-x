import { SampleProject } from '@/types/bundler';
export type { SampleProject };

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: 'simple-web',
    name: 'Simple Web App (HTML + CSS + JS)',
    description: 'Classic single-page Vanilla project with styled interface and client-side interactivity.',
    category: 'simple',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vanilla Web App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="card">
    <div class="badge">Running on Cloudflare Worker</div>
    <h1>Vanilla Counter</h1>
    <p>Zero framework dependencies, bundled into a single self-contained worker.js.</p>
    <div class="counter-box">
      <button id="decrement">-</button>
      <span id="count">0</span>
      <button id="increment">+</button>
    </div>
    <div id="timestamp" class="meta"></div>
  </div>
  <script src="script.js"></script>
</body>
</html>`,
      },
      {
        path: 'style.css',
        content: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #0f172a;
  color: #f8fafc;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 2.5rem;
  max-width: 480px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
}
.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
}
h1 {
  font-size: 1.85rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}
p {
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 2rem;
}
.counter-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}
button {
  background: #f97316;
  color: #fff;
  border: none;
  width: 48px;
  height: 48px;
  border-radius: 0.75rem;
  font-size: 1.5rem;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
}
button:hover {
  background: #ea580c;
  transform: scale(1.05);
}
button:active {
  transform: scale(0.95);
}
#count {
  font-size: 2.5rem;
  font-weight: 800;
  min-width: 60px;
}
.meta {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 1rem;
}`,
      },
      {
        path: 'script.js',
        content: `let count = 0;
const countEl = document.getElementById('count');
const incBtn = document.getElementById('increment');
const decBtn = document.getElementById('decrement');
const timeEl = document.getElementById('timestamp');

function updateDisplay() {
  countEl.textContent = count;
  timeEl.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

incBtn.addEventListener('click', () => {
  count++;
  updateDisplay();
});

decBtn.addEventListener('click', () => {
  count--;
  updateDisplay();
});

updateDisplay();`,
      },
    ],
  },
  {
    id: 'typescript-modular',
    name: 'TypeScript Modular App',
    description: 'TypeScript multi-file project with modules, typing, and CSS styling.',
    category: 'typescript',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TypeScript Modular App</title>
  <link rel="stylesheet" href="styles/app.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>TypeScript at the Edge</h1>
      <span class="status-pill">Compiled by esbuild</span>
    </header>
    <main>
      <div id="stats" class="stats-grid"></div>
      <button id="refreshBtn">Generate Next Task</button>
    </main>
  </div>
  <script src="src/main.ts"></script>
</body>
</html>`,
      },
      {
        path: 'src/main.ts',
        content: `import { formatCurrency, generateId } from './utils';

interface TaskItem {
  id: string;
  title: string;
  amount: number;
  completed: boolean;
}

const tasks: TaskItem[] = [
  { id: generateId(), title: 'Optimize Worker Latency', amount: 120, completed: true },
  { id: generateId(), title: 'Embed Static Assets', amount: 250, completed: true },
  { id: generateId(), title: 'Validate via Wrangler dry-run', amount: 90, completed: false }
];

function renderTasks() {
  const container = document.getElementById('stats');
  if (!container) return;

  container.innerHTML = tasks.map(t => \`
    <div class="stat-card \${t.completed ? 'completed' : ''}">
      <span class="id">\${t.id}</span>
      <h3>\${t.title}</h3>
      <p class="amount">\${formatCurrency(t.amount)}</p>
    </div>
  \`).join('');
}

document.getElementById('refreshBtn')?.addEventListener('click', () => {
  tasks.push({
    id: generateId(),
    title: 'Cloudflare Edge Route #' + (tasks.length + 1),
    amount: Math.floor(Math.random() * 300) + 50,
    completed: Math.random() > 0.5
  });
  renderTasks();
});

renderTasks();`,
      },
      {
        path: 'src/utils.ts',
        content: `export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function generateId(): string {
  return 'task-' + Math.random().toString(36).substring(2, 7);
}`,
      },
      {
        path: 'styles/app.css',
        content: `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #090d16;
  color: #e2e8f0;
  padding: 3rem 1.5rem;
}
.container {
  max-width: 640px;
  margin: 0 auto;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 1rem;
}
h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
.status-pill {
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  background: #1e3a8a;
  color: #93c5fd;
}
.stats-grid {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.stat-card {
  background: #131d2e;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1.25rem;
}
.stat-card.completed {
  border-left: 4px solid #10b981;
}
.stat-card .id {
  font-size: 0.75rem;
  color: #64748b;
  font-family: monospace;
}
.stat-card h3 {
  margin: 0.5rem 0;
  font-size: 1.1rem;
}
.amount {
  color: #38bdf8;
  font-weight: 600;
  margin: 0;
}
button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}
button:hover {
  background: #1d4ed8;
}`,
      },
    ],
  },
  {
    id: 'worker-api',
    name: 'Modular Cloudflare Worker API',
    description: 'Native Cloudflare Worker with fetch handler, modular routing, and JSON API responses.',
    category: 'worker_api',
    files: [
      {
        path: 'worker/index.ts',
        content: `import { handleApiRequest } from './modules/api';
import { validateAuth } from './modules/auth';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, url);
    }

    return new Response(JSON.stringify({
      service: 'Cloudflare Worker Gateway',
      status: 'healthy',
      endpoints: ['/api/health', '/api/data', '/api/info']
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }
};`,
      },
      {
        path: 'worker/modules/api.ts',
        content: `export async function handleApiRequest(request: Request, url: URL): Promise<Response> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (url.pathname === '/api/health') {
    return new Response(JSON.stringify({
      status: 'UP',
      uptime: process.uptime ? process.uptime() : 'N/A',
      timestamp: new Date().toISOString()
    }), { headers: jsonHeaders });
  }

  if (url.pathname === '/api/data') {
    return new Response(JSON.stringify({
      items: [
        { id: 1, name: 'Cloudflare Edge Node', region: 'us-east' },
        { id: 2, name: 'Auto Bundler Engine', version: '2.0.0' }
      ]
    }), { headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ error: 'Endpoint Not Found' }), {
    status: 404,
    headers: jsonHeaders
  });
}`,
      },
      {
        path: 'worker/modules/auth.ts',
        content: `export function validateAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  return !!authHeader && authHeader.startsWith('Bearer ');
}`,
      },
    ],
  },
  {
    id: 'assets-project',
    name: 'Asset-Rich Web Project',
    description: 'Complete project featuring HTML, CSS, TypeScript, SVG logo, and embedded JSON datasets.',
    category: 'assets',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Embedded Assets Showcase</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="wrapper">
    <div class="logo-box">
      <img src="/assets/logo.svg" alt="Edge Logo" width="64" height="64">
    </div>
    <h1>Edge Asset Embedding</h1>
    <p>All SVGs, JSON datasets, stylesheets, and scripts are embedded losslessly into worker.js.</p>
    <div id="catalog" class="catalog-grid"></div>
  </div>
  <script src="src/app.ts"></script>
</body>
</html>`,
      },
      {
        path: 'style.css',
        content: `body {
  background: #020617;
  color: #f1f5f9;
  font-family: system-ui, sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  margin: 0;
}
.wrapper {
  max-width: 540px;
  width: 100%;
  text-align: center;
}
.logo-box {
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
}
p {
  color: #94a3b8;
  margin-bottom: 1.5rem;
}
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
.item-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  padding: 1rem;
  text-align: left;
}
.item-card h4 {
  margin: 0 0 0.25rem 0;
  color: #38bdf8;
}
.item-card span {
  font-size: 0.8rem;
  color: #64748b;
}`,
      },
      {
        path: 'src/app.ts',
        content: `async function loadData() {
  try {
    const res = await fetch('/assets/data.json');
    const data = await res.json();
    const catalog = document.getElementById('catalog');
    if (!catalog) return;

    catalog.innerHTML = data.features.map((f: any) => \`
      <div class="item-card">
        <h4>\${f.name}</h4>
        <span>\${f.desc}</span>
      </div>
    \`).join('');
  } catch (err) {
    console.error('Failed to load dataset:', err);
  }
}

loadData();`,
      },
      {
        path: 'assets/logo.svg',
        content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
</svg>`,
      },
      {
        path: 'assets/data.json',
        content: `{
  "features": [
    { "name": "Zero Extra Files", "desc": "Only worker.js is produced" },
    { "name": "Auto Asset Routing", "desc": "Serves /assets/logo.svg with proper MIME" },
    { "name": "Wrangler Validated", "desc": "Checked with dry-run" },
    { "name": "Gemini Planned", "desc": "Intelligent architecture inference" }
  ]
}`,
      },
    ],
  },
  {
    id: 'npm-vanilla',
    name: 'npm Vanilla TypeScript Project',
    description: 'Project with package.json and tsconfig.json configurations.',
    category: 'npm_vanilla',
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "edge-vanilla-ts",
  "version": "1.0.0",
  "module": "src/main.ts",
  "scripts": {
    "build": "esbuild src/main.ts --bundle"
  }
}`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  },
  "include": ["src/**/*"]
}`,
      },
      {
        path: 'src/main.ts',
        content: `export function hello(): string {
  return "Hello from Vanilla TS on Cloudflare Workers!";
}

export default {
  async fetch(request: Request) {
    return new Response(hello(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
};`,
      },
    ],
  },
];
