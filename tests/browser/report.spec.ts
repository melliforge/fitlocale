import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { renderReport } from '../../src/report/html';
import type { CheckResult, Issue, Screenshot } from '../../src/types';
import { makeCheck, makeIssue, makeRun } from '../unit/fixtures';

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', e => errors.push(e.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const shot = (size = { width: 1280, height: 800 }): Screenshot => ({
  mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: 'data:image/png;base64,iVBORw0KGgo=', size,
});
const check = (project: string, issues: Issue[]): CheckResult => makeCheck({ project, issues, screenshots: [shot()] });
const open = (page: Page, checks: CheckResult[]) => page.setContent(renderReport(makeRun(checks)));
const rows = (page: Page) => page.locator('tr.problem');
const filter = (page: Page, name: string) => page.locator(`select[data-filter="${name}"]`);

/** Three problems: two rules, locales de and ar, projects chromium and webkit. */
const THREE = [
  check('chromium', [
    makeIssue({ rule: 'overflow/clipped', locale: 'de', text: 'One' }),
    makeIssue({ rule: 'overflow/clipped', locale: 'ar', text: 'Three' }),
  ]),
  check('webkit', [makeIssue({ rule: 'overflow/ellipsis', locale: 'de', text: 'Two' })]),
];

test('filters by rule, locale and project', async ({ page }) => {
  await open(page, THREE);
  await expect(rows(page)).toHaveCount(3);

  await filter(page, 'rule').selectOption('overflow/ellipsis');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('tr.problem[data-rule="overflow/clipped"]').first()).toBeHidden();
  await expect(page.locator('[data-status]')).toHaveText('Showing 1 of 3 problems');

  await filter(page, 'rule').selectOption('');
  await filter(page, 'locale').selectOption('de');
  await expect(page.locator('#page-1-1')).toBeVisible();
  await expect(page.locator('#page-1-2')).toBeHidden(); // the ar section
  await expect(page.locator('[data-status]')).toHaveText('Showing 2 of 3 problems');

  await filter(page, 'project').selectOption('webkit');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('tr.problem[data-rule="overflow/ellipsis"]')).toBeVisible();
  await expect(page.locator('figure[data-project="chromium"]').first()).toBeHidden();
  await expect(page.locator('figure[data-project="webkit"]')).toBeVisible();
  await expect(page.locator('.box:visible')).toHaveCount(1);
});

test('a page with no visible problem is hidden', async ({ page }) => {
  await open(page, [
    makeCheck({ project: 'chromium', url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a', text: 'A' })], screenshots: [shot()] }),
    makeCheck({ project: 'webkit', url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b', rule: 'overflow/ellipsis', text: 'B' })], screenshots: [shot()] }),
  ]);
  await filter(page, 'rule').selectOption('overflow/ellipsis');
  await expect(page.locator('#page-1')).toBeHidden();
  await expect(page.locator('#page-2')).toBeVisible();
});

test('severity and accepted toggles still hide rows', async ({ page }) => {
  await open(page, [check('chromium', [
    makeIssue({ severity: 'error', text: 'E' }),
    makeIssue({ severity: 'warning', text: 'W' }),
    makeIssue({ severity: 'warning', text: 'A', baselined: true }),
  ])]);
  await expect(page.locator('tr.problem:visible')).toHaveCount(3);

  await page.locator('[data-sev="error"]').uncheck();
  await expect(page.locator('tr.problem.error')).toBeHidden();
  await expect(page.locator('.box.error')).toBeHidden();
  await expect(page.locator('tr.problem:visible')).toHaveCount(2);

  await page.locator('[data-sev="accepted"]').uncheck();
  await expect(page.locator('tr.problem.accepted')).toBeHidden();
  await expect(page.locator('tr.problem:visible')).toHaveCount(1);
  await expect(page.locator('[data-status]')).toHaveText('Showing 1 of 3 problems');

  await page.locator('[data-sev="error"]').check();
  await expect(page.locator('tr.problem:visible')).toHaveCount(2);
});

test('a summary rule button or matrix cell sets the filters', async ({ page }) => {
  await open(page, THREE);

  await page.locator('[data-pick-rule="overflow/ellipsis"]').click();
  await expect(filter(page, 'rule')).toHaveValue('overflow/ellipsis');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);

  await page.locator('[data-clear]').click();
  await page.locator('[data-pick-locale="ar"][data-pick-project="chromium"]').click();
  await expect(filter(page, 'locale')).toHaveValue('ar');
  await expect(filter(page, 'project')).toHaveValue('chromium');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('[data-status]')).toHaveText('Showing 1 of 3 problems');
});

test('clear resets every filter', async ({ page }) => {
  await open(page, [check('chromium', [makeIssue({ severity: 'info', text: 'I' }), makeIssue({ severity: 'warning', text: 'W', baselined: true })]), ...THREE]);
  await filter(page, 'rule').selectOption('overflow/ellipsis');
  await filter(page, 'locale').selectOption('de');
  await filter(page, 'project').selectOption('webkit');
  await page.locator('[data-sev="info"]').uncheck();
  await page.locator('[data-sev="accepted"]').uncheck();
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);

  await page.locator('[data-clear]').click();
  for (const name of ['rule', 'locale', 'project']) await expect(filter(page, name)).toHaveValue('');
  await expect(page.locator('[data-sev="info"]')).toBeChecked();
  await expect(page.locator('[data-sev="accepted"]')).toBeChecked();
  await expect(rows(page).filter({ visible: true })).toHaveCount(5);
  await expect(page.locator('[data-status]')).toHaveText('Showing 5 of 5 problems');
});

test('a link to a folded section opens it', async ({ page }) => {
  await open(page, THREE);
  await page.locator('[data-fold="close"]').click();
  await expect(page.locator('#page-1')).not.toHaveAttribute('open', '');
  await expect(page.locator('#page-1-1')).not.toHaveAttribute('open', '');

  await page.locator('#summary a[href="#page-1-1"]').first().click();
  await expect(page.locator('#page-1')).toHaveAttribute('open', '');
  await expect(page.locator('#page-1-1')).toHaveAttribute('open', '');
  await expect(page.locator('#page-1-1')).toBeInViewport();

  await page.locator('[data-fold="open"]').click();
  await expect(page.locator('#page-1-2')).toHaveAttribute('open', '');
});

test('a link to a section hidden by a filter clears the filters and shows it', async ({ page }) => {
  await open(page, THREE);
  await page.locator('[data-fold="close"]').click();
  await filter(page, 'rule').selectOption('overflow/ellipsis');
  await expect(page.locator('#page-1-2')).toBeHidden(); // the ar section has no ellipsis problem
  await expect(page.locator('[data-sev="error"]')).toBeChecked();

  await page.locator('#summary a[href="#page-1-2"]').first().click();
  await expect(filter(page, 'rule')).toHaveValue('');
  await expect(page.locator('#page-1-2')).toBeVisible();
  await expect(page.locator('#page-1-2')).toHaveAttribute('open', '');
  await expect(page.locator('#page-1-2')).toBeInViewport();
  await expect(page.locator('[data-status]')).toHaveText('Showing 3 of 3 problems');
});

test('a link to a section hidden by a severity toggle too, when they still hide it', async ({ page }) => {
  await open(page, THREE);
  await filter(page, 'rule').selectOption('overflow/ellipsis');
  await page.locator('[data-sev="error"]').uncheck();
  await page.locator('#summary a[href="#page-1-2"]').first().click();
  await expect(page.locator('#page-1-2')).toBeVisible(); // still hidden after the filters: the toggles reset too
  await expect(page.locator('[data-sev="error"]')).toBeChecked();
});

test('opening the report on a link to a folded section opens it', async ({ page }) => {
  const html = renderReport(makeRun(THREE)).replace(/<details class="(page|section)" open/g, '<details class="$1"');
  await page.route('http://report.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://report.test/#page-1-2');
  await expect(page.locator('#page-1')).toHaveAttribute('open', '');
  await expect(page.locator('#page-1-2')).toHaveAttribute('open', '');
  await expect(page.locator('#page-1-1')).not.toHaveAttribute('open', '');
});

const tallPng = 'data:image/png;base64,iVBORw0KGgo=';

/** A PNG of the given size, drawn by the browser. */
const png = (page: Page, width: number, height: number) => page.evaluate(([w, h]) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ccc';
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL('image/png');
}, [width, height]);

async function openTall(page: Page) {
  const path = await png(page, 1000, 4000);
  const tall = makeCheck({
    issues: [makeIssue({ box: { x: 100, y: 3000, width: 200, height: 100 } })],
    screenshots: [{ ...shot({ width: 1000, height: 4000 }), path }],
  });
  await page.setContent(renderReport(makeRun([tall])));
}

test('a thumbnail enlarges on click and shrinks again', async ({ page }) => {
  await openTall(page);
  const figure = page.locator('figure.shot-wrap');
  const button = page.locator('button.shot');
  const width = async () => (await figure.boundingBox())!.width;
  const container = (await page.locator('.shots').boundingBox())!.width;

  expect(await width()).toBe(240);
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.click();
  expect(await width()).toBeCloseTo(container, 0);
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  await button.click();
  expect(await width()).toBe(240);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('boxes stay on their element in a cropped thumbnail', async ({ page }) => {
  await openTall(page);
  const frame = page.locator('.frame');
  const box = page.locator('.box');
  const offset = async () => {
    const f = (await frame.boundingBox())!;
    const b = (await box.boundingBox())!;
    return { top: b.y - f.y, height: f.height };
  };

  await page.locator('button.shot').click(); // enlarged
  const big = await offset();
  expect(Math.abs(big.top - big.height * 0.75)).toBeLessThanOrEqual(1);

  await page.locator('button.shot').click(); // thumbnail: the button crops the frame at 360px
  const small = await offset();
  expect(small.height).toBeGreaterThan(360);
  expect(small.top).toBeGreaterThan(360); // below the visible crop
  expect(Math.abs(small.top - small.height * 0.75)).toBeLessThanOrEqual(1);
});

test('filters match values with spaces and quotes', async ({ page }) => {
  await open(page, [
    check('Mobile "Safari"', [makeIssue({ locale: 'x<y', text: 'Odd' })]),
    check('chromium', [makeIssue({ locale: 'de', text: 'Plain' })]),
  ]);
  await filter(page, 'project').selectOption('Mobile "Safari"');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('figure[data-project="chromium"]')).toBeHidden();

  await page.locator('[data-clear]').click();
  await filter(page, 'locale').selectOption('x<y');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('tr.problem[data-locale="x<y"]')).toBeVisible();
  await expect(page.locator('[data-status]')).toHaveText('Showing 1 of 2 problems');

  await page.locator('[data-clear]').click();
  await page.locator(`[data-pick-locale="x<y"][data-pick-project='Mobile "Safari"']`).click();
  await expect(filter(page, 'project')).toHaveValue('Mobile "Safari"');
  await expect(filter(page, 'locale')).toHaveValue('x<y');
});

test('the controls stay at the top while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await open(page, THREE);
  await page.evaluate(() => { document.querySelector('main')!.style.minHeight = '5000px'; window.scrollTo(0, 1500); });
  const bar = await page.locator('.bar').boundingBox();
  expect(bar!.y).toBe(0);
  expect(bar!.height).toBeLessThan(200);
});

test('thumbnails are cropped only when the script runs', async ({ page }) => {
  await openTall(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('js'))).toBe(true);
  expect(await page.locator('button.shot').evaluate(el => getComputedStyle(el).maxHeight)).toBe('360px');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('thumbnails are not cropped, so every box can be reached', async ({ page }) => {
    await page.setContent(renderReport(makeRun([makeCheck({
      issues: [makeIssue({ box: { x: 100, y: 3000, width: 200, height: 100 } })],
      screenshots: [{ ...shot({ width: 1000, height: 4000 }), path: tallPng }],
    })])));
    const style = await page.locator('button.shot').evaluate(el => { const s = getComputedStyle(el); return { maxHeight: s.maxHeight, cursor: s.cursor, overflow: s.overflow }; });
    expect(style.maxHeight).toBe('none');
    expect(style.cursor).not.toBe('zoom-in');
    expect(style.overflow).toBe('visible');
  });
});

/** Serves the report from an origin, so reloads and localStorage work. */
async function serve(page: Page, checks: CheckResult[]) {
  const html = renderReport(makeRun(checks));
  await page.route('http://report.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://report.test/');
}
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK_BG = 'rgb(27, 27, 31)', LIGHT_BG = 'rgb(255, 255, 255)';

test('the theme toggle switches light and dark and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await serve(page, THREE);
  const html = page.locator('html');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(html).not.toHaveAttribute('data-theme', /./);
  expect(await background(page)).toBe(LIGHT_BG);

  // auto → light → dark
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background(page)).toBe(DARK_BG);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background(page)).toBe(DARK_BG);

  // Back to auto: the system preference decides again.
  await page.locator('[data-theme-toggle]').click();
  await expect(html).not.toHaveAttribute('data-theme', /./);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background(page)).toBe(DARK_BG);
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', /./);

  // A light choice wins over a dark system.
  await page.locator('[data-theme-toggle]').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await background(page)).toBe(LIGHT_BG);
});

test('the report works when localStorage throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  });
  await serve(page, THREE);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('[data-status]')).toHaveText('Showing 3 of 3 problems');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('search filters by free text and tokens', async ({ page }) => {
  await serve(page, [
    check('chromium', [
      makeIssue({ rule: 'leak/raw-key', locale: 'de', text: 'checkout.title' }),
      makeIssue({ rule: 'leak/raw-key', locale: 'fr', text: 'cart.empty' }),
      makeIssue({ rule: 'overflow/clipped', locale: 'de', text: 'Speichern', severity: 'warning' }),
    ]),
    check('webkit', [makeIssue({ rule: 'overflow/clipped', locale: 'ar', text: 'Old', baselined: true })]),
  ]);
  const search = page.locator('[data-search]');
  const visible = () => rows(page).filter({ visible: true });
  const status = page.locator('[data-status]');
  await expect(status).toHaveText('Showing 4 of 4 problems');

  await search.fill('rule:leak/raw-key de');
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('checkout.title');
  await expect(status).toHaveText('Showing 1 of 4 problems');

  await search.fill('SPEICH'); // free text, any case
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('Speichern');

  await search.fill('sev:warning');
  await expect(visible()).toContainText('Speichern');
  await search.fill('is:accepted');
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('Old');
  await search.fill('is:new project:webkit');
  await expect(visible()).toHaveCount(0);
  await expect(status).toHaveText('Showing 0 of 4 problems');
  await search.fill('locale:ar');
  await expect(visible()).toHaveCount(1);

  // Tokens and the selects combine (AND).
  await search.fill('rule:leak');
  await expect(visible()).toHaveCount(2);
  await filter(page, 'locale').selectOption('fr');
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('cart.empty');

  // Clear empties the search too; the query never reaches the URL.
  expect(page.url()).toBe('http://report.test/');
  await page.locator('[data-clear]').click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveText('Showing 4 of 4 problems');
});

test('the sidebar highlights the section in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await open(page, [
    ...THREE,
    check('chromium', [makeIssue({ rule: 'overflow/clipped', locale: 'fr', text: 'Four' }), makeIssue({ rule: 'overflow/clipped', locale: 'ja', text: 'Five' })]),
  ]);
  await page.evaluate(() => { document.querySelector('main')!.style.minHeight = '5000px'; });
  const link = (id: string) => page.locator(`nav.sidebar a[href="#${id}"]`);
  await expect(link('summary')).toHaveAttribute('aria-current', 'true');

  await page.locator('#page-1-2').evaluate(el => el.scrollIntoView());
  await expect(link('page-1-2')).toHaveAttribute('aria-current', 'true');
  await expect(link('page-1-1')).not.toHaveAttribute('aria-current', 'true');
  await expect(link('summary')).not.toHaveAttribute('aria-current', 'true');
});

test('the sidebar hides sections that the filters hide', async ({ page }) => {
  await open(page, THREE);
  await filter(page, 'locale').selectOption('de');
  await expect(page.locator('nav.sidebar a[href="#page-1-2"]')).toBeHidden();
  await expect(page.locator('nav.sidebar a[href="#page-1-1"]')).toBeVisible();
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sidebar is a drawer opened by the Filters button', async ({ page }) => {
    await open(page, THREE);
    const sidebar = page.locator('nav.sidebar');
    const button = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(sidebar).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(sidebar).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await filter(page, 'locale').selectOption('ar');
    await expect(rows(page).filter({ visible: true })).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    // A link in the drawer closes it and shows its section.
    await button.click();
    await page.locator('nav.sidebar a[href="#page-1-2"]').click();
    await expect(sidebar).toBeHidden();
    await expect(page.locator('#page-1-2')).toBeInViewport();
  });

  test('no horizontal page scroll', async ({ page }) => {
    const long = 'x'.repeat(300);
    await open(page, [...THREE, check('a-project-with-a-rather-long-name', [makeIssue({ text: long, locale: long, selector: `#${long}` })])]);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
