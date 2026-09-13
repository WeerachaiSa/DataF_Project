import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {accounts} from './fixtures.mjs';

// This suite uses the running app; it only reads application data and logs in/out.
// The existing browser-check suite owns mutating checks in its disposable database.
const base = (process.env.HOME_CHECK_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const requireCsp = process.env.HOME_CHECK_REQUIRE_CSP !== '0' && new URL(base).port !== '5173';
const artifact = name => fileURLToPath(new URL('../test-results/' + name, import.meta.url));
const startedAt = new Date().toISOString();
const results = [], pageErrors = [], consoleErrors = [], contexts = [];
let browser, failed;
await mkdir(new URL('../test-results/', import.meta.url), {recursive:true});

async function check(name, fn) {
  const started = performance.now();
  try {
    const metrics = await fn();
    results.push({name, status:'passed', durationMs:Math.round(performance.now() - started), ...(metrics && {metrics})});
    console.log('PASS', name, metrics ? JSON.stringify(metrics) : '');
  } catch (error) {
    results.push({name, status:'failed', durationMs:Math.round(performance.now() - started), error:error.message});
    throw error;
  }
}

// Instrument the page's animation scheduler before app code starts. It measures
// pending callbacks after SPA unmounts, not merely the presence of a canvas node.
function instrumentRaf() {
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const pending = new Set();
  let completed = 0;
  window.requestAnimationFrame = callback => {
    const id = request(time => { pending.delete(id); completed++; callback(time); });
    pending.add(id);
    return id;
  };
  window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
  window.__homeRaf = () => ({pending:pending.size, completed});
}

async function newPage(options = {}, expectedErrors = false) {
  const context = await browser.newContext({viewport:{width:1440,height:1050}, ...options});
  contexts.push(context);
  await context.addInitScript(instrumentRaf);
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push({url:page.url(), message:error.message}));
  page.on('console', message => {
    if (message.type() === 'error' && !expectedErrors && !/401 \(Unauthorized\)/.test(message.text())) {
      consoleErrors.push({url:page.url(), message:message.text()});
    }
  });
  return page;
}

async function ready(page) {
  await expect(page.locator('.dormitory-scene')).toHaveAttribute('data-state', 'ready', {timeout:30000});
  await expect(page.locator('.dormitory-scene canvas')).toHaveCount(1);
  await expect.poll(() => page.locator('.dormitory-scene__viewport').getAttribute('data-frame-count')).not.toBeNull();
}

async function metrics(page) {
  return page.locator('.dormitory-scene__viewport').evaluate(host => ({
    frames:Number(host.dataset.frameCount), drawCalls:Number(host.dataset.drawCalls),
    triangles:Number(host.dataset.triangles), azimuth:Number(host.dataset.cameraAzimuth),
    canvasWidth:host.querySelector('canvas').width, canvasHeight:host.querySelector('canvas').height,
    cssWidth:host.clientWidth, cssHeight:host.clientHeight,
  }));
}

async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, viewport:innerWidth}));
  assert.ok(dimensions.scroll <= dimensions.viewport, JSON.stringify(dimensions));
  return dimensions;
}

async function freezeCheck(page) {
  const first = await metrics(page);
  await page.waitForTimeout(250);
  const second = await metrics(page);
  assert.equal(second.frames, first.frames, 'paused scene must not keep rendering');
  assert.equal((await page.evaluate(() => window.__homeRaf())).pending, 0, 'paused scene must cancel its animation callback');
  return second;
}

async function catalog(page) {
  await expect(page).toHaveURL(base + '/search');
  await expect(page.locator('.room-card')).toHaveCount(18);
  await expect(page.locator('.dormitory-scene, .home-page')).toHaveCount(0);
}

async function homeFromCatalog(page) {
  await page.getByRole('link', {name:'DataF หน้าหลัก', exact:true}).click();
  await expect(page).toHaveURL(base + '/');
  await expect(page.locator('#home-heading')).toBeVisible();
}

try {
  browser = await chromium.launch({
    channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true,
    // Headless CI gets real WebGL through Chromium's software backend.
    args:['--enable-unsafe-swiftshader'],
  });
  const page = await newPage();

  await check('direct catalog loads without Three.js, model or decoder requests', async () => {
    const requests = [];
    const record = request => requests.push(new URL(request.url()).pathname);
    page.on('request', record);
    await page.goto(base + '/search');
    await catalog(page);
    await page.waitForLoadState('networkidle');
    page.off('request', record);
    const isolatedRequests = requests.filter(path => /DormitoryCanvas|\/models\/|\bthree(?:[.\/_-]|$)/i.test(path));
    assert.deepEqual(isolatedRequests, [], 'homepage 3D assets must remain lazy');
    return {requestCount:requests.length, homepageAssetRequests:isolatedRequests};
  });

  await check('desktop Home, grouped navigation and live Draco model render', async () => {
    await homeFromCatalog(page);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.home-action-hub')).toBeVisible();
    await expect(page.locator('.home-action-hub a[href="/search"]')).toBeVisible();
    await expect(page.locator('.home-action-hub a[href="/login"]')).toBeVisible();
    await expect(page.locator('.home-mobile-actions')).not.toBeVisible();
    await expect(page.locator('.home-service-grid article')).toHaveCount(4);
    await noOverflow(page);
    const scene = await metrics(page);
    assert.ok(scene.drawCalls > 0 && scene.drawCalls <= 60, 'scene draw-call budget');
    assert.ok(scene.triangles > 0 && scene.triangles <= 16000, 'scene triangle budget including shadow pass');
    return scene;
  });

  await check('animation pauses without RAF activity and pointer/keyboard orbit still work', async () => {
    await page.getByRole('button', {name:'หยุดภาพเคลื่อนไหว', exact:true}).click();
    await expect(page.locator('.dormitory-scene')).toHaveAttribute('data-paused', 'true');
    await freezeCheck(page);
    const before = await metrics(page);
    const box = await page.locator('.dormitory-scene canvas').boundingBox();
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .53, {steps:10});
    await page.mouse.up();
    const dragged = await metrics(page);
    assert.ok(Math.abs(dragged.azimuth - before.azimuth) > .05, 'drag must rotate the camera');
    const right = page.getByRole('button', {name:'หมุนหอพักไปทางขวา', exact:true});
    await right.focus();
    await page.keyboard.press('Enter');
    const keyboard = await metrics(page);
    assert.ok(Math.abs(keyboard.azimuth - dragged.azimuth) > .05, 'keyboard rotation control must work');
    await page.getByRole('button', {name:'กลับสู่มุมมองเริ่มต้น', exact:true}).click();
    await freezeCheck(page);
    await page.getByRole('button', {name:'เล่นภาพเคลื่อนไหว', exact:true}).click();
    const resumed = await metrics(page);
    await expect.poll(async () => (await metrics(page)).frames).toBeGreaterThan(resumed.frames);
    return {initialAzimuth:before.azimuth, draggedAzimuth:dragged.azimuth, keyboardAzimuth:keyboard.azimuth};
  });

  await check('all loop phases render and latest desktop screenshot is saved', async () => {
    const observed = new Set();
    const end = Date.now() + 19000;
    while (Date.now() < end && observed.size < 3) {
      observed.add(await page.locator('.dormitory-scene').getAttribute('data-phase'));
      await page.waitForTimeout(150);
    }
    assert.deepEqual([...observed].sort(), ['assembly', 'disassembly', 'hold']);
    await expect(page.locator('.dormitory-scene')).toHaveAttribute('data-phase', 'hold', {timeout:17000});
    await page.getByRole('button', {name:'หยุดภาพเคลื่อนไหว', exact:true}).click();
    await page.getByRole('button', {name:'กลับสู่มุมมองเริ่มต้น', exact:true}).click();
    await page.screenshot({path:artifact('home-desktop.png'), fullPage:true});
    return {phases:[...observed], screenshot:'test-results/home-desktop.png', ...(await metrics(page))};
  });

  await check('SPA navigation removes canvas and cancels RAF on every unmount', async () => {
    await page.getByRole('button', {name:'เล่นภาพเคลื่อนไหว', exact:true}).click();
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.locator('.home-action-hub a[href="/search"]').click();
      await catalog(page);
      await expect(page.locator('canvas')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__homeRaf().pending)).toBe(0);
      const stopped = await page.evaluate(() => window.__homeRaf().completed);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__homeRaf().completed), stopped, 'unmounted scene still scheduling frames');
      await homeFromCatalog(page);
      await ready(page);
      await expect(page.locator('.dormitory-scene canvas')).toHaveCount(1);
    }
    await page.locator('.home-action-hub a[href="/login"]').click();
    await expect(page).toHaveURL(base + '/login');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__homeRaf().pending)).toBe(0);
    return {remountCycles:3, pendingRafAfterNavigation:await page.evaluate(() => window.__homeRaf().pending)};
  });

  await check('authenticated Home remains public and account/search routes keep existing destinations', async () => {
    const account = accounts[1];
    await page.getByLabel('อีเมลมหาวิทยาลัย').fill(account[0] + '@cdti.ac.th');
    await page.getByLabel('รหัสผ่าน', {exact:true}).fill(account[4]);
    await page.getByRole('button', {name:'เข้าสู่ระบบ', exact:true}).click();
    await expect(page).toHaveURL(base + '/resident');
    await page.goto(base + '/');
    await expect(page.locator('#home-heading')).toBeVisible();
    await expect(page).toHaveURL(base + '/');
    await page.locator('.home-action-hub a[href="/login"]').click();
    await expect(page).toHaveURL(base + '/resident');
    await page.goto(base + '/search');
    await expect(page).toHaveURL(base + '/announcements');
    await page.getByRole('button', {name:'ออกจากระบบ', exact:true}).click();
    await expect(page).toHaveURL(base + '/');
    await expect(page.locator('#home-heading')).toBeVisible();
  });

  await check('mobile action bar, responsive canvas and 320px layout stay accessible', async () => {
    const mobile = await newPage({viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, reducedMotion:'reduce'});
    await mobile.goto(base + '/');
    await ready(mobile);
    await expect(mobile.locator('.home-mobile-actions')).toBeVisible();
    await expect(mobile.locator('.home-action-hub')).not.toBeVisible();
    await noOverflow(mobile);
    await mobile.locator('.dormitory-scene').scrollIntoViewIfNeeded();
    const size = await metrics(mobile);
    assert.ok(size.canvasWidth <= Math.ceil(size.cssWidth * 1.5), 'DPR must remain capped at 1.5');
    await mobile.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready; });
    await mobile.screenshot({path:artifact('home-mobile.png'), fullPage:true});
    await mobile.locator('.home-mobile-actions a[href="/search"]').click();
    await catalog(mobile);
    await homeFromCatalog(mobile);
    await mobile.locator('.home-mobile-actions a[href="/login"]').click();
    await expect(mobile).toHaveURL(base + '/login');
    await mobile.goto(base + '/');
    await mobile.setViewportSize({width:320,height:740});
    await ready(mobile);
    const narrow = await noOverflow(mobile);
    await expect(mobile.locator('.home-mobile-actions a[href="/search"]')).toBeVisible();
    return {screenshot:'test-results/home-mobile.png', scene:size, narrow};
  });

  await check('reduced motion renders an assembled static building without an animation loop', async () => {
    const reduced = await newPage({reducedMotion:'reduce'});
    await reduced.goto(base + '/');
    await ready(reduced);
    await expect(reduced.locator('.dormitory-scene')).toHaveAttribute('data-phase', 'static');
    await expect(reduced.locator('.dormitory-scene')).toHaveAttribute('data-paused', 'true');
    await expect(reduced.getByRole('button', {name:'หยุดภาพเคลื่อนไหว', exact:true})).toHaveCount(0);
    await freezeCheck(reduced);
    await reduced.emulateMedia({reducedMotion:'no-preference'});
    await expect(reduced.locator('.dormitory-scene')).toHaveAttribute('data-paused', 'false');
    const before = await metrics(reduced);
    await expect.poll(async () => (await metrics(reduced)).frames).toBeGreaterThan(before.frames);
    return {staticFrames:before.frames, livePreferenceChange:true};
  });

  await check('blocked WebGL keeps a static fallback and working search navigation', async () => {
    const blocked = await newPage({}, true);
    await blocked.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (/webgl/i.test(type)) return null;
        return getContext.call(this, type, ...args);
      };
    });
    await blocked.goto(base + '/');
    await expect(blocked.locator('.dormitory-scene')).toHaveAttribute('data-state', 'fallback');
    await expect(blocked.locator('.dormitory-scene__fallback')).toBeVisible();
    await blocked.locator('.home-search-trigger').click();
    await catalog(blocked);
  });

  await check('failed GLB download keeps fallback and does not crash the host application', async () => {
    const broken = await newPage({}, true);
    await broken.route('**/models/dataf-dormitory.glb', route => route.fulfill({status:503, body:'Test model failure'}));
    await broken.goto(base + '/');
    await expect(broken.locator('.dormitory-scene')).toHaveAttribute('data-state', 'fallback');
    await expect(broken.locator('.dormitory-scene__fallback')).toBeVisible();
    await broken.locator('.home-action-hub a[href="/search"]').click();
    await catalog(broken);
    await expect.poll(() => broken.evaluate(() => window.__homeRaf().pending)).toBe(0);
  });

  await check('rapid navigation cancels delayed model loads and remounts only one canvas', async () => {
    const delayed = await newPage();
    await delayed.route('**/models/dataf-dormitory.glb', async route => {
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.continue().catch(() => {}); // A cancelled navigation legitimately aborts a route.
    });
    await delayed.goto(base + '/search');
    await catalog(delayed);
    for (let cycle = 0; cycle < 3; cycle++) {
      await homeFromCatalog(delayed);
      await expect(delayed.locator('.dormitory-scene')).toHaveAttribute('data-state', 'loading');
      await delayed.locator('.home-action-hub a[href="/search"]').click();
      await catalog(delayed);
    }
    await delayed.waitForTimeout(900);
    await expect(delayed.locator('canvas')).toHaveCount(0);
    assert.equal(await delayed.evaluate(() => window.__homeRaf().pending), 0);
    await homeFromCatalog(delayed);
    await ready(delayed);
    return {cancelledMountCycles:3, liveCanvasCount:await delayed.locator('canvas').count()};
  });

  await check('production routes and CSP permit local Draco workers without unsafe-eval', async () => {
    const home = await page.request.get(base + '/');
    const search = await page.request.get(base + '/search');
    assert.equal(home.status(), 200);
    assert.equal(search.status(), 200);
    const policy = home.headers()['content-security-policy'];
    if (requireCsp) {
      assert.ok(policy, 'production must return Content-Security-Policy');
      const script = policy.split(';').find(directive => directive.startsWith('script-src '));
      const worker = policy.split(';').find(directive => directive.startsWith('worker-src '));
      assert.ok(script?.includes("'self'") && script.includes("'wasm-unsafe-eval'"));
      assert.ok(!script.includes("'unsafe-eval'"));
      assert.ok(worker?.includes("'self'") && worker.includes('blob:'));
    }
    assert.deepEqual(pageErrors, [], 'unexpected uncaught browser exceptions');
    assert.deepEqual(consoleErrors, [], 'unexpected console errors');
    return {cspRequired:requireCsp, contentSecurityPolicy:policy || null};
  });
} catch (error) {
  failed = error;
  console.error(error);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await writeFile(artifact('home-results.json'), JSON.stringify({
    startedAt, completedAt:new Date().toISOString(), baseUrl:base,
    browserChannel:process.env.BROWSER_CHANNEL || 'msedge',
    renderingBackend:'Chromium headless with --enable-unsafe-swiftshader',
    status:failed ? 'failed' : 'passed', results, pageErrors, consoleErrors,
  }, null, 2));
}
if (failed) process.exitCode = 1;
