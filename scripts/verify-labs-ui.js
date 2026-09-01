/* Browser-level regression checks for the interactions that carry assessment evidence. */
'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let playwright;
try {
  playwright = require('playwright');
} catch (error) {
  if (!process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = require(process.env.PLAYWRIGHT_MODULE);
}

const webRoot = path.resolve(__dirname, '..', 'labs', 'webapp');
const urlFor = (...parts) => pathToFileURL(path.join(webRoot, ...parts)).href;

async function freshPage(browser, labNumber) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(urlFor('labs', `lab-${String(labNumber).padStart(2, '0')}`, 'index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return { page, errors };
}

async function setRange(page, id, value) {
  await page.locator(id).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function verifyThreeUniqueRuns(browser) {
  const { page, errors } = await freshPage(browser, 11);
  await page.fill('#w-prediction', 'Reducing pixel pitch should increase the modelled sampling resolution.');
  await page.click('#record-run');
  await setRange(page, '#ctrl-pitch', 0.1);
  await page.click('#record-run');
  await setRange(page, '#ctrl-receptor', 0);
  await page.click('#record-run');
  const result = await page.evaluate(() => ({
    status: document.querySelector('#run-status').textContent.trim(),
    runs: (Object.values(RadLab.state.activities).find((activity) => Array.isArray(activity.runs)) || { runs: [] }).runs.length,
    done: !!(Object.values(RadLab.state.activities).find((activity) => Array.isArray(activity.runs)) || {}).done
  }));
  await page.close();
  if (errors.length || result.runs !== 3 || !result.done) {
    throw new Error(`Lab 11 run log failed: ${JSON.stringify({ result, errors })}`);
  }
  return result;
}

async function verifyLab1ScientificAssets(browser) {
  const { page, errors } = await freshPage(browser, 1);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  const result = await page.evaluate(() => ({
    tubeSource: document.querySelector('#tube-hotspot-container img').getAttribute('src'),
    receptorSource: document.querySelector('#sec-receptors figure img').getAttribute('src'),
    hotspots: document.querySelectorAll('#tube-hotspot-container .hotspot').length
  }));
  await page.locator('#tube-hotspot-container').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  for (const hotspot of await page.locator('#tube-hotspot-container .hotspot').all()) await hotspot.click();
  result.hotspotActivityDone = await page.evaluate(() => RadLab.state.activities['station-tube-hotspots'].done);
  await page.close();
  const scientificSources = result.tubeSource.endsWith('xray-tube-scientific.svg') &&
    result.receptorSource.endsWith('receptor-family-scientific.svg');
  if (errors.length || !scientificSources || result.hotspots !== 6 || !result.hotspotActivityDone) {
    throw new Error(`Lab 1 scientific assets failed: ${JSON.stringify({ result, errors })}`);
  }
  return result;
}

async function verifyLab2VisualSchematic(browser) {
  const { page, errors } = await freshPage(browser, 2);
  const canvas = page.locator('#sim-canvas');
  await canvas.waitFor();
  if (process.env.RAD321_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.RAD321_SCREENSHOT_DIR, { recursive: true });
    await page.locator('#sec-experiment').screenshot({
      path: path.join(process.env.RAD321_SCREENSHOT_DIR, 'rad321-lab02-schematic.png')
    });
  }
  const baseline = await canvas.evaluate((element) => element.toDataURL());
  const controls = await page.evaluate(() => LAB.controls.map((control) => ({
    id: control.id,
    baseline: control.value,
    test: control.value === control.min ? control.max : control.min
  })));
  const changed = {};
  for (const control of controls) {
    await setRange(page, `#ctrl-${control.id}`, control.test);
    const signature = await canvas.evaluate((element) => element.toDataURL());
    changed[control.id] = signature !== baseline;
    await setRange(page, `#ctrl-${control.id}`, control.baseline);
  }
  const visualStats = await canvas.evaluate((element) => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 1600) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    return { width: element.width, height: element.height, sampledColors: colors.size };
  });
  await page.close();
  if (errors.length || Object.values(changed).some((value) => !value) || visualStats.sampledColors < 8) {
    throw new Error(`Lab 2 visual schematic failed: ${JSON.stringify({ changed, visualStats, errors })}`);
  }
  return { changed, visualStats };
}

async function verifyMatchActivity(browser) {
  const { page, errors } = await freshPage(browser, 8);
  const concept = await page.evaluate(() => ({ id: CONCEPT.id, pairs: CONCEPT.pairs }));
  for (const [left, right] of Object.entries(concept.pairs)) {
    await page.locator(`#concept-activity [data-id="${left}"]`).click();
    await page.locator(`#concept-activity [data-id="${right}"]`).click();
  }
  const done = await page.evaluate((id) => RadLab.state.activities[id].done, concept.id);
  await page.close();
  if (errors.length || !done) {
    throw new Error(`Lab 8 match activity failed: ${JSON.stringify({ done, errors })}`);
  }
  return { done };
}

async function verifyOrderActivity(browser) {
  const { page, errors } = await freshPage(browser, 2);
  const concept = await page.evaluate(() => ({ id: CONCEPT.id, correct: CONCEPT.correct }));
  for (let target = 0; target < concept.correct.length; target += 1) {
    const itemId = concept.correct[target];
    while (true) {
      const current = await page.locator('.drag-item').evaluateAll(
        (items, id) => items.findIndex((item) => item.dataset.id === id),
        itemId
      );
      if (current <= target) break;
      await page.locator(`.drag-item[data-id="${itemId}"] .drag-key-controls button`).first().click();
    }
  }
  await page.getByRole('button', { name: 'Check Order' }).click();
  const done = await page.evaluate((id) => RadLab.state.activities[id].done, concept.id);
  await page.close();
  if (errors.length || !done) {
    throw new Error(`Lab 2 order activity failed: ${JSON.stringify({ done, errors })}`);
  }
  return { done };
}

async function verifyLocalDate(browser) {
  const context = await browser.newContext({ timezoneId: 'Asia/Riyadh' });
  const page = await context.newPage();
  await page.goto(urlFor('labs', 'lab-02', 'index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const result = await page.evaluate(() => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    return { expected, actual: document.querySelector('#meta-date').value };
  });
  await context.close();
  if (result.actual !== result.expected) {
    throw new Error(`Local date initialization failed: ${JSON.stringify(result)}`);
  }
  return result;
}

(async () => {
  const browser = await playwright.chromium.launch({ headless: process.env.RAD321_HEADLESS !== '0' });
  try {
    const results = {
      lab01ScientificAssets: await verifyLab1ScientificAssets(browser),
      lab02VisualSchematic: await verifyLab2VisualSchematic(browser),
      lab11ThreeUniqueRuns: await verifyThreeUniqueRuns(browser),
      lab08MatchActivity: await verifyMatchActivity(browser),
      lab02OrderActivity: await verifyOrderActivity(browser),
      riyadhLocalDate: await verifyLocalDate(browser)
    };
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
