#!/usr/bin/env node
// QA Visual Audit for Riftbound Online replay/spectate pages.
// Produces screenshots + image/console/layout telemetry.

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('/tmp/qa-audit/node_modules/puppeteer');
}

const ARTIFACTS_DIR = '/Users/miszion/workplace/nexus-data/artifacts';
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const BASE = 'http://localhost:3001';
const REPLAY_PATH = '/replay/selfplay-0-20260417';
const SPECTATE_PATH = '/spectate';

const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1024', width: 1024, height: 768 },
];

const imageResponses = [];
const consoleLog = [];

function logLine(arr, obj) {
  arr.push({ ts: new Date().toISOString(), ...obj });
}

async function auditPage(browser, viewport, url, screenshotName) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height });

  page.on('response', async (resp) => {
    try {
      const req = resp.request();
      const type = req.resourceType();
      if (type === 'image' || /\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i.test(req.url())) {
        const headers = resp.headers();
        logLine(imageResponses, {
          viewport: viewport.name,
          url: req.url(),
          status: resp.status(),
          contentLength: headers['content-length'] || null,
          contentType: headers['content-type'] || null,
        });
      }
    } catch {}
  });

  page.on('pageerror', (err) => {
    logLine(consoleLog, { viewport: viewport.name, type: 'pageerror', message: String(err && err.message || err), stack: err && err.stack });
  });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'warning' && type !== 'error') return;
    let text;
    try { text = msg.text(); } catch { text = '(unreadable)'; }
    logLine(consoleLog, { viewport: viewport.name, type, text });
  });

  let crashed = false;
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    logLine(consoleLog, { viewport: viewport.name, type: 'navigation-error', message: String(e && e.message || e) });
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e2) {
      crashed = true;
      logLine(consoleLog, { viewport: viewport.name, type: 'navigation-fatal', message: String(e2 && e2.message || e2) });
    }
  }

  await new Promise((r) => setTimeout(r, 3000));

  const screenshotPath = path.join(ARTIFACTS_DIR, screenshotName);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (e) {
    logLine(consoleLog, { viewport: viewport.name, type: 'screenshot-error', message: String(e && e.message || e) });
  }

  let report = null;
  try {
    report = await page.evaluate(() => {
      function getComputedWidth(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          clientWidth: el.clientWidth,
          offsetWidth: el.offsetWidth,
          computedWidth: cs.width,
          maxWidth: cs.maxWidth,
          display: cs.display,
          rectWidth: rect.width,
          rectLeft: rect.left,
          rectRight: rect.right,
          outerHTMLHead: el.outerHTML.slice(0, 160),
        };
      }

      function firstEl(sel) { return document.querySelector(sel); }
      function allEls(sel) { return Array.from(document.querySelectorAll(sel)); }

      // Images
      const imgs = allEls('img').map((img) => ({
        src: img.getAttribute('src') || img.src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        displayedW: img.clientWidth,
        displayedH: img.clientHeight,
        alt: img.alt,
        hasError: !img.complete || img.naturalWidth === 0,
      }));

      // Rune tiles - try several selectors
      const runeSelectors = [
        '[class*="rune" i]',
        '[data-rune]',
        '[class*="Rune"]',
      ];
      const runeEls = [];
      const seen = new Set();
      runeSelectors.forEach((sel) => {
        allEls(sel).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            runeEls.push(el);
          }
        });
      });
      const runeSummary = runeEls.slice(0, 20).map((el) => ({
        tag: el.tagName,
        className: el.className && el.className.toString ? el.className.toString() : String(el.className),
        hasImg: !!el.querySelector('img'),
        imgSrc: el.querySelector('img')?.src || null,
        text: (el.textContent || '').trim().slice(0, 40),
        outerHTML: el.outerHTML.slice(0, 400),
        rectW: el.getBoundingClientRect().width,
        rectH: el.getBoundingClientRect().height,
      }));
      const runeWithImg = runeEls.filter((el) => el.querySelector('img')).length;

      // Card elements
      const cardSelectors = [
        '[data-card-id]',
        '[class*="rift-card" i]',
        '[class*="RiftboundCard" i]',
        '[class*="card-art" i]',
      ];
      const cardEls = [];
      const cseen = new Set();
      cardSelectors.forEach((sel) => {
        allEls(sel).forEach((el) => {
          if (!cseen.has(el)) { cseen.add(el); cardEls.push(el); }
        });
      });

      // Card locations
      const handEls = allEls('[class*="hand" i]');
      const battleEls = allEls('[class*="battlefield" i], [class*="arena" i]');
      function countContainedIn(cards, containers) {
        let n = 0;
        for (const card of cards) {
          for (const c of containers) {
            if (c.contains(card) && c !== card) { n++; break; }
          }
        }
        return n;
      }
      const cardInHand = countContainedIn(cardEls, handEls);
      const cardInBattlefield = countContainedIn(cardEls, battleEls);

      const cardSamples = cardEls.slice(0, 10).map((el) => {
        const img = el.querySelector('img');
        return {
          className: el.className && el.className.toString ? el.className.toString() : String(el.className),
          hasImg: !!img,
          imgSrc: img?.src || null,
          imgComplete: img?.complete || false,
          imgNaturalW: img?.naturalWidth || 0,
          bg: (window.getComputedStyle(el).backgroundImage || '').slice(0, 120),
          rectW: el.getBoundingClientRect().width,
          rectH: el.getBoundingClientRect().height,
          outerHead: el.outerHTML.slice(0, 220),
        };
      });

      // Layout measurements
      const layout = {
        viewportInnerWidth: window.innerWidth,
        gameScreen: getComputedWidth(firstEl('.game-screen')),
        gameScreenContainer: getComputedWidth(firstEl('.game-screen.container')),
        gameScreenBoard: getComputedWidth(firstEl('.game-screen__board')),
        arenaLayout: getComputedWidth(firstEl('.arena-layout')),
        arenaLayoutMain: getComputedWidth(firstEl('.arena-layout__main')),
        arenaLayoutColumnDock: getComputedWidth(firstEl('.arena-layout__column--dock')),
        // All columns
        arenaColumns: allEls('[class*="arena-layout__column"]').map((el) => ({
          className: el.className && el.className.toString ? el.className.toString() : String(el.className),
          clientWidth: el.clientWidth,
          computedWidth: window.getComputedStyle(el).width,
        })),
        body: {
          scrollWidth: document.body.scrollWidth,
          clientWidth: document.body.clientWidth,
        },
      };

      // Auth gate detection
      const bodyText = document.body ? document.body.textContent || '' : '';
      const requireAuthBlocked = /sign in|log in|authentic/i.test(document.title || '') && bodyText.length < 2000;

      return {
        title: document.title,
        url: location.href,
        totalImgs: imgs.length,
        brokenImgs: imgs.filter((i) => i.hasError).length,
        imgSample: imgs.slice(0, 30),
        runeCount: runeEls.length,
        runeWithImgCount: runeWithImg,
        runeSamples: runeSummary,
        cardCount: cardEls.length,
        cardInHand,
        cardInBattlefield,
        cardSamples,
        layout,
        bodyTextHead: bodyText.slice(0, 300),
        requireAuthBlocked,
      };
    });
  } catch (e) {
    logLine(consoleLog, { viewport: viewport.name, type: 'eval-error', message: String(e && e.message || e) });
  }

  await page.close();
  return { viewport: viewport.name, url, screenshotPath, report, crashed };
}

(async () => {
  console.log('Launching puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  let anyCrash = false;

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Auditing ${REPLAY_PATH} at ${vp.name} ===`);
    const r = await auditPage(browser, vp, REPLAY_PATH, `qa-replay-${vp.name}.png`);
    results.push(r);
    if (r.crashed) anyCrash = true;
    console.log(`  title: ${r.report?.title}`);
    console.log(`  imgs: ${r.report?.totalImgs} (broken: ${r.report?.brokenImgs})`);
    console.log(`  runes: ${r.report?.runeCount} (with <img>: ${r.report?.runeWithImgCount})`);
    console.log(`  cards: ${r.report?.cardCount} (hand: ${r.report?.cardInHand}, bf: ${r.report?.cardInBattlefield})`);
    console.log(`  arena-main width: ${r.report?.layout?.arenaLayoutMain?.clientWidth} / viewport ${vp.width}`);
  }

  // Also spectate index at 1920 only
  console.log(`\n=== Auditing ${SPECTATE_PATH} at 1920 ===`);
  const spec = await auditPage(browser, VIEWPORTS[0], SPECTATE_PATH, 'qa-spectate-index.png');
  results.push(spec);

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'qa-replay-image-responses.json'),
    JSON.stringify(imageResponses, null, 2),
  );

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'qa-replay-console.log'),
    consoleLog.map((e) => JSON.stringify(e)).join('\n'),
  );

  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'qa-replay-report.json'),
    JSON.stringify(results, null, 2),
  );

  await browser.close();

  console.log(`\nArtifacts written to ${ARTIFACTS_DIR}`);
  if (anyCrash) {
    console.error('One or more pages crashed during audit.');
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(2);
});
