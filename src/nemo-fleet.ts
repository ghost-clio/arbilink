/**
 * ArbiLink Nemotron Bot Fleet
 * Real autonomous agents powered by Nemotron 120B (free).
 * Each bot registers services, discovers others, and transacts via x402 flow.
 */

const GATEWAY = process.env.ARBILINK_GATEWAY || 'http://localhost:3403';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const NEMO_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

const AGENTS = [
  {
    id: 'atlas', address: '0xAtlas_DataProvider_001', name: 'Atlas', role: 'Data Provider',
    services: [
      { id: 'atlas:market-summary', capability: 'market-analysis', price: 0.003, endpoint: '' },
      { id: 'atlas:news-digest', capability: 'news-aggregation', price: 0.002, endpoint: '' },
    ],
    buyPatterns: ['code-review', 'sentiment-analysis', 'image-gen'],
    personality: 'You are Atlas, a data aggregation agent. You gather market data and news. When buying services, explain what data insight you need and why.',
  },
  {
    id: 'sage', address: '0xSage_CodeReviewer_002', name: 'Sage', role: 'Code Reviewer',
    services: [
      { id: 'sage:code-review', capability: 'code-review', price: 0.005, endpoint: '' },
      { id: 'sage:audit', capability: 'security-audit', price: 0.008, endpoint: '' },
    ],
    buyPatterns: ['market-analysis', 'news-aggregation', 'translation'],
    personality: 'You are Sage, a code review and security audit agent. When buying services, explain what code context you need.',
  },
  {
    id: 'pixel', address: '0xPixel_Creative_003', name: 'Pixel', role: 'Creative',
    services: [
      { id: 'pixel:image-gen', capability: 'image-gen', price: 0.004, endpoint: '' },
      { id: 'pixel:design-review', capability: 'design-review', price: 0.003, endpoint: '' },
    ],
    buyPatterns: ['market-analysis', 'code-review', 'sentiment-analysis'],
    personality: 'You are Pixel, a creative agent generating images and design reviews. When buying services, explain what creative project needs this data.',
  },
  {
    id: 'quant', address: '0xQuant_Analyst_004', name: 'Quant', role: 'Analyst',
    services: [
      { id: 'quant:sentiment-analysis', capability: 'sentiment-analysis', price: 0.003, endpoint: '' },
      { id: 'quant:risk-model', capability: 'risk-assessment', price: 0.006, endpoint: '' },
    ],
    buyPatterns: ['market-analysis', 'news-aggregation', 'code-review'],
    personality: 'You are Quant, a quantitative analyst agent. You model risk and sentiment. When buying services, explain what analysis you\'re running.',
  },
  {
    id: 'echo', address: '0xEcho_Comms_005', name: 'Echo', role: 'Communications',
    services: [
      { id: 'echo:translation', capability: 'translation', price: 0.002, endpoint: '' },
      { id: 'echo:summarize', capability: 'summarization', price: 0.002, endpoint: '' },
    ],
    buyPatterns: ['market-analysis', 'image-gen', 'risk-assessment'],
    personality: 'You are Echo, a communications agent handling translation and summarization. When buying services, explain what message or content needs processing.',
  },
];

async function callNemo(prompt: string, maxTokens = 200): Promise<string> {
  if (!OPENROUTER_KEY) return '[Nemotron unavailable]';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://ghost-clio.github.io/arbilink/',
        'X-Title': 'ArbiLink Agent Fleet',
      },
      body: JSON.stringify({
        model: NEMO_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return `[Nemotron error: ${resp.status}]`;
    const data = await resp.json() as any;
    return data.choices?.[0]?.message?.content || '[empty]';
  } catch (err: any) {
    return `[Nemotron error: ${err.message}]`;
  }
}

async function registerService(service: any, sellerAddress: string): Promise<boolean> {
  try {
    const resp = await fetch(`${GATEWAY}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: service.id, seller: sellerAddress, price: service.price,
        capability: service.capability, endpoint: service.endpoint || `http://localhost:0/nemo/${service.id}`, asset: 'USDC',
      }),
    });
    return resp.ok;
  } catch { return false; }
}

async function discoverServices(capability: string): Promise<any[]> {
  try {
    const resp = await fetch(`${GATEWAY}/discover?capability=${encodeURIComponent(capability)}`);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return data.services || [];
  } catch { return []; }
}

async function buyService(serviceId: string, buyerAddress: string, amount: number, nemoResponse: string): Promise<any> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const probeController = new AbortController();
      const probeTimeout = setTimeout(() => probeController.abort(), 10000);
      const probeResp = await fetch(`${GATEWAY}/service/${serviceId}`, {
        headers: { 'X-BUYER-ADDRESS': buyerAddress },
        signal: probeController.signal,
      });
      clearTimeout(probeTimeout);
      if (probeResp.status !== 402) {
        console.log(`  [Buy] Unexpected status ${probeResp.status} for ${serviceId}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 500));
      // Generate valid 66-char tx hash
      const hexChars = '0123456789abcdef';
      let txHash = '0x';
      for (let i = 0; i < 64; i++) txHash += hexChars[Math.floor(Math.random() * 16)];
      
      const payController = new AbortController();
      const payTimeout = setTimeout(() => payController.abort(), 10000);
      const resp = await fetch(`${GATEWAY}/service/${serviceId}?q=${encodeURIComponent(nemoResponse.slice(0, 100))}`, {
        headers: {
          'X-BUYER-ADDRESS': buyerAddress,
          'X-PAYMENT-PROOF': txHash,
          'X-PAYMENT-AMOUNT': amount.toString(),
        },
        signal: payController.signal,
      });
      clearTimeout(payTimeout);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        return { error: true, status: resp.status, ...errData };
      }
      return await resp.json();
    } catch (err: any) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      console.error(`  [Buy] Error after ${maxRetries + 1} attempts: ${err.message}`);
      return null;
    }
  }
  return null;
}

async function runAgentCycle(agent: typeof AGENTS[0]) {
  const capability = agent.buyPatterns[Math.floor(Math.random() * agent.buyPatterns.length)];
  const services = await discoverServices(capability);
  if (services.length === 0) {
    console.log(`  [${agent.name}] No services found for "${capability}"`);
    return;
  }
  const available = services.filter(s => !s.seller?.includes(agent.id));
  if (available.length === 0) return;
  const target = available[Math.floor(Math.random() * available.length)];
  const amount = target.price || 0.003;
  
  const prompt = `${agent.personality}\n\nYou want to buy a "${capability}" service from ${target.seller || 'another agent'}. Price: $${amount.toFixed(4)} USDC.\nIn 1-2 sentences, explain what you need and why. Be specific and practical.`;
  const reason = await callNemo(prompt, 100);
  console.log(`  [${agent.name}] Buying ${capability} from ${target.id} ($${amount.toFixed(4)})`);
  console.log(`    Reason: ${reason.slice(0, 120)}`);
  
  const result = await buyService(target.id, agent.address, amount, reason);
  if (result?.error) {
    console.log(`    ❌ Denied: ${result.reason || result.error}`);
  } else if (result?.success) {
    console.log(`    ✅ Verified: ${result.txVerified} | Latency: ${result.latencyMs}ms`);
  } else {
    console.log(`    ⚠️ No result`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ArbiLink Nemotron Bot Fleet');
  console.log(`  ${AGENTS.length} agents | Gateway: ${GATEWAY}`);
  console.log(`  Model: ${NEMO_MODEL} (FREE)`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('📋 Registering services...');
  let registered = 0;
  for (const agent of AGENTS) {
    for (const svc of agent.services) {
      const ok = await registerService(svc, agent.address);
      if (ok) registered++;
      console.log(`  ${ok ? '✅' : '❌'} ${svc.id} ($${svc.price})`);
    }
  }
  console.log(`  Registered: ${registered} services\n`);
  
  console.log('📊 Setting spending policies...');
  for (const agent of AGENTS) {
    try {
      await fetch(`${GATEWAY}/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agent.address, perTxLimit: 0.01, dailyLimit: 0.05 }),
      });
      console.log(`  ✅ ${agent.name}: $0.01/tx, $0.05/day`);
    } catch { console.log(`  ❌ ${agent.name}: policy set failed`); }
  }
  console.log('');
  
  const CYCLE_INTERVAL_MS = parseInt(process.env.CYCLE_INTERVAL || '60000');
  const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || '0');
  let cycle = 0;
  
  console.log(`🔄 Starting transaction loop (interval: ${CYCLE_INTERVAL_MS / 1000}s)...\n`);
  
  const runCycle = async () => {
    cycle++;
    console.log(`\n── Cycle ${cycle} [${new Date().toISOString()}] ──`);
    
    // Re-register if gateway restarted
    try {
      const health = await (await fetch(`${GATEWAY}/health`)).json() as any;
      if (health.services === 0) {
        console.log('  [Re-registering services — gateway was restarted]');
        for (const agent of AGENTS) {
          for (const svc of agent.services) {
            await registerService(svc, agent.address);
          }
        }
      }
    } catch {}
    
    const shuffled = [...AGENTS].sort(() => Math.random() - 0.5);
    const active = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
    
    for (const agent of active) {
      await runAgentCycle(agent);
      await new Promise(r => setTimeout(r, 3000));
    }
    
    if (cycle % 5 === 0) {
      console.log(`  [POLICY TEST] Attempting over-limit transaction...`);
      const rogue = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const target = AGENTS.find(a => a.id !== rogue.id)!;
      const result = await buyService(target.services[0].id, rogue.address, 0.5, 'Testing spending policy enforcement');
      if (result?.error) {
        console.log(`    🛡️ Policy blocked: ${result.reason || result.error}`);
      } else {
        console.log(`    ⚠️ Policy should have blocked this!`);
      }
    }
    
    if (MAX_CYCLES > 0 && cycle >= MAX_CYCLES) {
      console.log(`\n✅ Completed ${MAX_CYCLES} cycles. Exiting.`);
      process.exit(0);
    }
  };
  
  await runCycle();
  setInterval(runCycle, CYCLE_INTERVAL_MS);
}

main().catch(err => { console.error('Fleet fatal error:', err); process.exit(1); });
