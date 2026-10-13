import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDir = '/Users/jiviteshgarg/.gemini/antigravity/brain/f99e1e43-1f03-4ec5-baf5-55113ef1f5fc/scratch/qa_screenshots';

fs.mkdirSync(outputDir, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// Start static server
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(distDir, urlPath);
  if (urlPath === '/' || !path.extname(urlPath) || !fs.existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

const VIEWPORTS = [
  { name: '320px_se1', width: 320, height: 750, mobile: true, scale: 2 },
  { name: '375px_mobile', width: 375, height: 850, mobile: true, scale: 2 },
  { name: '390px_iphone14', width: 390, height: 880, mobile: true, scale: 2 },
  { name: '430px_promax', width: 430, height: 950, mobile: true, scale: 2 },
  { name: '1280px_desktop', width: 1280, height: 850, mobile: false, scale: 1 },
];

const PAGES = [
  { route: '/dashboard', label: 'dashboard' },
  { route: '/timetable', label: 'timetable' },
  { route: '/attendance', label: 'attendance' },
  { route: '/settings', label: 'settings' },
];

server.listen(4173, '127.0.0.1', async () => {
  console.log('Static server listening on 4173');

  const userDataDir = '/tmp/chrome_cdp_qa_suite_' + Date.now();
  const chromeProcess = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + userDataDir,
  ], { stdio: 'ignore' });

  async function waitForCDP() {
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        if (res.ok) return true;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('CDP failed to start');
  }

  try {
    await waitForCDP();
    console.log('Chrome CDP ready.');

    // Function to run a single test page
    async function capturePage(route, label, vp) {
      const url = `http://127.0.0.1:4173${route}?qa_preview=1`;
      const targetRes = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      const target = await targetRes.json();

      const ws = new WebSocket(target.webSocketDebuggerUrl);
      let id = 1;
      const callbacks = new Map();

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
          callbacks.get(msg.id)(msg);
          callbacks.delete(msg.id);
        }
      };

      await new Promise((resolve) => ws.onopen = resolve);

      function send(method, params = {}) {
        return new Promise((resolve) => {
          const reqId = id++;
          callbacks.set(reqId, resolve);
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });
      }

      await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.scale,
        mobile: vp.mobile,
      });

      // Wait 1200ms for React hydration, query params, animations
      await new Promise(r => setTimeout(r, 1200));

      // Check horizontal overflow in page
      const evalRes = await send('Runtime.evaluate', {
        expression: `({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          currentPath: window.location.pathname
        })`,
        returnByValue: true
      });

      const metrics = evalRes.result?.result?.value || {};

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const fileName = `${label}_${vp.name}.png`;
      const outPath = path.join(outputDir, fileName);

      if (shot.result?.data) {
        fs.writeFileSync(outPath, Buffer.from(shot.result.data, 'base64'));
      }

      // Close page target
      ws.close();
      await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);

      return {
        fileName,
        outPath,
        metrics,
      };
    }

    console.log('\n--- Capturing Viewports & Pages ---');
    const results = [];
    for (const vp of VIEWPORTS) {
      for (const page of PAGES) {
        const res = await capturePage(page.route, page.label, vp);
        console.log(`[${vp.name}] ${page.label} -> saved (${res.metrics.hasHOverflow ? 'OVERFLOW!' : 'clean no-overflow'})`);
        results.push({ vp: vp.name, page: page.label, ...res });
      }
    }

    // Test Redirects
    console.log('\n--- Testing Route Redirects ---');
    const redirectTests = [
      { from: '/subjects', expected: '/attendance' },
      { from: '/email-sync', expected: '/dashboard' }
    ];

    for (const rt of redirectTests) {
      const url = `http://127.0.0.1:4173${rt.from}?qa_preview=1`;
      const targetRes = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      const target = await targetRes.json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      let id = 1;
      const callbacks = new Map();
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
          callbacks.get(msg.id)(msg);
          callbacks.delete(msg.id);
        }
      };
      await new Promise(r => ws.onopen = r);
      function send(method, params = {}) {
        return new Promise((r) => {
          const reqId = id++;
          callbacks.set(reqId, r);
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });
      }
      await send('Page.enable');
      await new Promise(r => setTimeout(r, 800));
      const evalRes = await send('Runtime.evaluate', {
        expression: 'window.location.pathname',
        returnByValue: true
      });
      const finalPath = evalRes.result?.result?.value;
      console.log(`Redirect ${rt.from} -> ${finalPath} (Expected: ${rt.expected}) : ${finalPath === rt.expected ? 'PASS' : 'FAIL'}`);
      ws.close();
      await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
    }

    // Test Settings Presets Interaction
    console.log('\n--- Testing Settings Presets (50%, 75%, 95%) ---');
    const settingsTarget = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent('http://127.0.0.1:4173/settings?qa_preview=1')}`, { method: 'PUT' })).json();
    const ws = new WebSocket(settingsTarget.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };
    await new Promise(r => ws.onopen = r);
    function send(method, params = {}) {
      return new Promise((r) => {
        const reqId = id++;
        callbacks.set(reqId, r);
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 950, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 1200));

    // Verify clicking presets updates slider and badge
    const presetResults = await send('Runtime.evaluate', {
      expression: `(async () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn50 = buttons.find(b => b.textContent.includes('50%'));
        const btn75 = buttons.find(b => b.textContent.includes('75%'));
        const btn95 = buttons.find(b => b.textContent.includes('95%'));
        const slider = document.querySelector('input[type="range"]');

        const log = [];
        if (btn50 && slider) {
          btn50.click();
          await new Promise(r => setTimeout(r, 100));
          log.push({ clicked: 50, sliderVal: slider.value });
        }
        if (btn95 && slider) {
          btn95.click();
          await new Promise(r => setTimeout(r, 100));
          log.push({ clicked: 95, sliderVal: slider.value });
        }
        if (btn75 && slider) {
          btn75.click();
          await new Promise(r => setTimeout(r, 100));
          log.push({ clicked: 75, sliderVal: slider.value });
        }
        return log;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Preset test log:', presetResults.result?.result?.value);

    // Capture settings after clicking 75%
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.result?.data) {
      fs.writeFileSync(path.join(outputDir, 'settings_preset_interactive_390.png'), Buffer.from(shot.result.data, 'base64'));
    }

    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${settingsTarget.id}`);

    console.log('\nAll Visual QA captures and interaction checks complete!');
  } catch (err) {
    console.error('Test suite error:', err);
  } finally {
    chromeProcess.kill('SIGKILL');
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
});
