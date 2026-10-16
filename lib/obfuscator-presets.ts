import { ObfuscatorCustomOptions, PresetName } from '@/types/obfuscator';

export const BASE_DEFAULT_OPTIONS: ObfuscatorCustomOptions = {
  // Basic
  target: 'browser',
  strictMode: true,
  seed: 0,
  compact: true,
  simplify: true,
  log: false,
  parseHtml: false,

  // Identifier Naming
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: '',
  randomIdentifiersPrefix: false,
  renameGlobals: false,
  renameProperties: false,
  reservedNames: [],
  reservedStrings: [],

  // VM
  enableVm: false,
  vmStrength: 'default',

  // String Array
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayIndexesType: ['hexadecimal-number'],
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayWrappersCount: 1,
  stringArrayWrappersType: 'variable',
  stringArrayWrappersChainedCalls: true,

  // Transforms
  controlFlowFlattening: false,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  deadCodeInjectionThreshold: 0.4,
  numbersToExpressions: false,
  splitStrings: false,
  splitStringsChunkLength: 10,
  transformObjectKeys: false,
  forceTransformStrings: [],
  ignoreImports: false,
  unicodeEscapeSequence: false,

  // Protection
  selfDefending: false,
  debugProtection: false,
  debugProtectionInterval: false,
  disableConsoleOutput: false,
  domainLock: [],
  domainLockRedirectUrl: 'about:blank',

  // Source Maps
  sourceMap: false,
  sourceMapMode: 'inline',
};

export const PRESET_CONFIGS: Record<PresetName, Partial<ObfuscatorCustomOptions>> = {
  default: {
    compact: true,
    simplify: true,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ['none'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    transformObjectKeys: false,
    enableVm: false,
  },

  low: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'mangled',
    stringArray: true,
    stringArrayThreshold: 0.5,
    stringArrayEncoding: ['none'],
    stringArrayRotate: false,
    stringArrayShuffle: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    transformObjectKeys: false,
    enableVm: false,
  },

  medium: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 0.8,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    numbersToExpressions: true,
    transformObjectKeys: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    enableVm: false,
  },

  high: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 1.0,
    stringArrayEncoding: ['rc4'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 1.0,
    stringArrayWrappersCount: 3,
    stringArrayWrappersType: 'function',
    stringArrayWrappersChainedCalls: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.85,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    numbersToExpressions: true,
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    selfDefending: true,
    debugProtection: false,
    disableConsoleOutput: true,
    enableVm: false,
  },

  paranoid: {
    compact: true,
    simplify: false,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 1.0,
    stringArrayEncoding: ['rc4', 'base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 1.0,
    stringArrayWrappersCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayWrappersChainedCalls: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1.0,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.7,
    numbersToExpressions: true,
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    selfDefending: true,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: true,
    unicodeEscapeSequence: true,
    enableVm: true,
    vmStrength: 'ultra',
  },

  'vm-low': {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    enableVm: true,
    vmStrength: 'low',
    controlFlowFlattening: false,
    selfDefending: false,
  },

  'vm-high': {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 1.0,
    stringArrayEncoding: ['rc4'],
    enableVm: true,
    vmStrength: 'high',
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,
    selfDefending: true,
  },

  custom: {},
};

export const PRESET_METADATA: { id: PresetName; label: string; badge?: string; desc: string }[] = [
  {
    id: 'default',
    label: 'Default',
    desc: 'Basic transformations, clean output, minimal performance overhead.',
  },
  {
    id: 'low',
    label: 'Low (Fast)',
    desc: 'Lightweight identifier mangling and basic string array extraction.',
  },
  {
    id: 'medium',
    label: 'Medium (Optimal)',
    badge: 'Recommended',
    desc: 'Balanced protection with Base64 strings, object key mangling, and control flow.',
  },
  {
    id: 'high',
    label: 'High (Anti-Reverse)',
    badge: 'Strong',
    desc: 'RC4 encryption, dead code injection, string splitting, and self-defending anti-tamper.',
  },
  {
    id: 'paranoid',
    label: 'Extreme (Paranoid)',
    badge: 'Maximum',
    desc: 'Full 100% control flow flattening, debugger freezing, unicode escape sequences, and heavy defenses.',
  },
  {
    id: 'vm-low',
    label: 'VM Low (CI/Tests)',
    desc: 'Pure virtual machine bytecode transform with minimal defensive wrappers.',
  },
  {
    id: 'vm-high',
    label: 'VM High (Bytecode Protected)',
    badge: 'Virtual Machine',
    desc: 'Advanced stack-based bytecode virtualization paired with multi-layer obfuscation.',
  },
  {
    id: 'custom',
    label: 'Custom Settings',
    badge: 'Advanced',
    desc: 'Fine-tune every single parameter and compiler flag manually.',
  },
];

export const SAMPLE_CODES: { id: string; name: string; code: string }[] = [
  {
    id: 'hello-world',
    name: 'Hello World & State',
    code: `// Sample: Interactive Counter and Greeting
function greet(user) {
  const secretKey = "sk_live_948201948201a9df";
  const timestamp = new Date().toISOString();
  console.log("Welcome back, " + user + "! Session init at: " + timestamp);
  return {
    status: 200,
    auth: secretKey.substring(0, 7) + "...",
    active: true
  };
}

const session = greet("Developer");
console.log("Session validated:", session);
`,
  },
  {
    id: 'api-protect',
    name: 'API Key & Token Protector',
    code: `// Secure API Request Dispatcher
class CloudApiClient {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint || "https://api.gateway.internal/v2/telemetry";
    this.apiKey = apiKey || "auth_bearer_9876543210_secret";
  }

  async sendMetrics(eventPayload) {
    const payloadWithSignature = {
      ...eventPayload,
      checksum: Math.random().toString(36).substring(2, 15),
      dispatchedAt: Date.now()
    };
    
    // In production, performs secure POST
    return {
      delivered: true,
      statusCode: 201,
      target: this.endpoint
    };
  }
}

const client = new CloudApiClient();
client.sendMetrics({ action: "login_attempt", userId: "usr_4091" });
`,
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci & Math Algorithm',
    code: `// Recursive and Iterative Fibonacci Engine
function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

const sequence = [];
for (let i = 0; i < 10; i++) {
  sequence.push(fibonacci(i));
}
console.log("Fibonacci Sequence (0..9):", sequence);
`,
  },
  {
    id: 'simple-calculator',
    name: 'Simple Calculator Engine',
    code: `// Calculator Operation Dispatcher
function calculate(operation, a, b) {
  switch (operation) {
    case 'add': return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide':
      if (b === 0) throw new Error("Division by zero");
      return a / b;
    case 'power': return Math.pow(a, b);
    default: return NaN;
  }
}

console.log("Calc 15 * 4:", calculate('multiply', 15, 4));
console.log("Calc 2 ^ 8:", calculate('power', 2, 8));
`,
  },
  {
    id: 'cloudflare-worker',
    name: 'Cloudflare Worker Handler',
    code: `// Cloudflare Worker Fetch Handler with Secret Verification
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    
    const internalSecret = "worker_master_token_x99a";
    
    if (url.pathname === "/api/secure") {
      if (authHeader !== "Bearer " + internalSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ message: "Access granted to secure isolate!" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("AutoForge Worker is running smoothly.", { status: 200 });
  }
};
`,
  },
];
