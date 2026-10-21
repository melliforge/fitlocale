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

  // An unterminated quote runs to the end of the query.
  await search.fill('project:"webk');
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('Old');
  await search.fill('"cart.em');
  await expect(visible()).toHaveCount(1);
  await expect(visible()).toContainText('cart.empty');

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

test('the sidebar marks the last section once the page is scrolled to the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const locales = ['de', 'fr', 'ar', 'ja'];
  await open(page, [
    check('chromium', locales.map(locale => makeIssue({ locale, text: `Text ${locale}` }))),
    // A short last section: no screenshot, one row.
    makeCheck({ project: 'chromium', url: 'http://app.test/z', issues: [makeIssue({ url: 'http://app.test/z', locale: 'pl', text: 'Last' })], screenshots: [] }),
  ]);
  const last = page.locator('nav.sidebar a[href="#page-2-1"]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(last).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('nav.sidebar [aria-current]')).toHaveCount(1);
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
    await expect(page.locator('nav.sidebar [data-sev="error"]')).toBeFocused();
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
    // Focus goes to the section, not back to the top of the page.
    await expect(page.locator('#page-1-2 > summary')).toBeFocused();
  });

  test('the by-rule table fits without sideways scrolling', async ({ page }) => {
    await open(page, [...THREE, check('chromium', [makeIssue({ rule: 'i18n/untranslated', locale: 'de-DE', text: 'Hallo' })])]);
    const card = page.locator('table.rules').locator('xpath=..');
    const overflow = await card.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Each row stays compact: the section links sit under the rule, across the card, not in a narrow column.
    const table = (await page.locator('table.rules').boundingBox())!;
    for (const where of await page.locator('table.rules td.where').all()) {
      const box = (await where.boundingBox())!;
      expect(box.width).toBeGreaterThan(table.width * 0.8);
    }
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

/* ---------- Problem detail panel and keyboard ---------- */

const panel = (page: Page) => page.locator('aside.panel');
const detail = (page: Page, id: string) => page.locator(`#d-${id}`);

test('clicking a row opens its detail and Esc closes it', async ({ page }) => {
  await serve(page, THREE);
  await expect(panel(page)).toBeHidden();
  await page.locator('#p2 td').last().click();
  await expect(panel(page)).toBeVisible();
  await expect(detail(page, 'p2')).toBeVisible();
  await expect(page.locator('article.detail:visible')).toHaveCount(1);
  await expect(page.locator('#p2')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#p2')).toHaveClass(/\bselected\b/);
  expect(page.url()).toBe('http://report.test/#p2');

  // Another row replaces it.
  await page.locator('#p1 td').last().click();
  await expect(detail(page, 'p1')).toBeVisible();
  await expect(detail(page, 'p2')).toBeHidden();
  await expect(page.locator('#p2')).not.toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  expect(page.url()).toBe('http://report.test/');

  // Enter on a focused row opens it; the Close button closes it.
  await page.locator('#p3').focus();
  await page.keyboard.press('Enter');
  await expect(detail(page, 'p3')).toBeVisible();
  await page.locator('aside.panel [data-close]').click();
  await expect(panel(page)).toBeHidden();
});

test('opening the selector folder in a row does not open the detail', async ({ page }) => {
  await open(page, THREE);
  await page.locator('#p1 details.sel summary').click();
  await expect(panel(page)).toBeHidden();
});

test('j and k move through visible problems only', async ({ page }) => {
  await open(page, THREE);
  await filter(page, 'rule').selectOption('overflow/clipped'); // hides p2
  await page.locator('body').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('j');
  await expect(page.locator('#p1')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#p1')).toBeFocused();
  await expect(panel(page)).toBeHidden(); // moving does not open the panel
  await page.keyboard.press('j');
  await expect(page.locator('#p3')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#p3')).toBeInViewport();
  await page.keyboard.press('j'); // the last one stays
  await expect(page.locator('#p3')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('k');
  await expect(page.locator('#p1')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('tr.problem[aria-current="true"]')).toHaveCount(1);

  // With the panel open, moving updates it.
  await page.keyboard.press('Enter');
  await expect(detail(page, 'p1')).toBeVisible();
  await page.keyboard.press('j');
  await expect(detail(page, 'p3')).toBeVisible();
  await expect(detail(page, 'p1')).toBeHidden();
});

test('#p2 opens problem 2 on load, and a later hash change opens another', async ({ page }) => {
  const html = renderReport(makeRun(THREE));
  await page.route('http://report.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://report.test/#p2');
  await expect(panel(page)).toBeVisible();
  await expect(detail(page, 'p2')).toBeVisible();
  await expect(page.locator('#p2')).toHaveAttribute('aria-current', 'true');

  // A link to a problem hidden by a filter clears the filter first.
  await filter(page, 'locale').selectOption('de');
  await expect(page.locator('#p3')).toBeHidden();
  await page.evaluate(() => { location.hash = '#p3'; });
  await expect(detail(page, 'p3')).toBeVisible();
  await expect(page.locator('#p3')).toBeVisible();
  await expect(filter(page, 'locale')).toHaveValue('');
});

test('Copy puts the selector on the clipboard', async ({ page, context, browserName }) => {
  const selector = 'form > button[data-testid="save"]';
  const html = renderReport(makeRun([check('chromium', [makeIssue({ selector })])]));
  // localhost is a secure context, where the Clipboard API exists.
  await page.route('http://localhost:4399/', route => route.fulfill({ contentType: 'text/html', body: html }));
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('http://localhost:4399/');
  await page.locator('#p1 td').last().click();
  const copy = detail(page, 'p1').locator('[data-copy]');
  await expect(copy).toHaveText('Copy');
  await copy.click();
  await expect(panel(page).locator('[data-announce]')).toHaveAttribute('aria-live', 'polite');
  await expect(panel(page).locator('[data-announce]')).toHaveText(/^(Copied|Selected)$/);
  // The copied text stays selected, so it is visible what was copied (and Ctrl+C works if copying failed).
  expect(await page.evaluate(() => String(window.getSelection()))).toBe(selector);
  if (browserName === 'chromium') {
    await expect(copy).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(selector);
    await expect(copy).toHaveText('Copy', { timeout: 3000 });
  }
});

test('keys are ignored while typing in search', async ({ page }) => {
  await open(page, THREE);
  const search = page.locator('[data-search]');
  await search.click();
  await page.keyboard.type('jk?/');
  await expect(search).toHaveValue('jk?/');
  await expect(page.locator('tr.problem[aria-current="true"]')).toHaveCount(0);
  await expect(page.locator('[data-keys]')).toBeHidden();
  await expect(search).toBeFocused();
});

test('/ focuses the search and ? toggles the shortcut help', async ({ page }) => {
  await open(page, THREE);
  await page.locator('body').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('?');
  await expect(page.locator('[data-keys]')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.locator('[data-keys]')).toBeHidden();
  await page.keyboard.press('?');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-keys]')).toBeHidden();
  await page.keyboard.press('/');
  await expect(page.locator('[data-search]')).toBeFocused();
  await expect(page.locator('[data-search]')).toHaveValue('');
  // Modified keys are the browser's.
  await page.locator('body').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('Control+j');
  await expect(page.locator('tr.problem[aria-current="true"]')).toHaveCount(0);
});

test('search finds text past the label', async ({ page }) => {
  await open(page, [check('chromium', [makeIssue({ text: `${'Long label '.repeat(10)}tail-word` }), makeIssue({ text: 'Other' })])]);
  await page.locator('[data-search]').fill('tail-word');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
});

test('at 1440px the panel sits beside the table without covering it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, THREE);
  await page.locator('#p1 td').last().click();
  const aside = (await panel(page).boundingBox())!;
  expect(aside.width).toBe(480);
  expect(aside.x + aside.width).toBeCloseTo(1440, 0);
  const table = (await page.locator('#page-1-1 table').boundingBox())!;
  expect(table.x + table.width).toBeLessThanOrEqual(aside.x);
  // Sticky below the top bar, with its own scroll.
  await page.evaluate(() => { document.querySelector('main')!.style.minHeight = '5000px'; window.scrollTo(0, 1500); });
  expect((await panel(page).boundingBox())!.y).toBe(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('at 1100px the open panel takes the sidebar\'s place, which becomes a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(page, THREE);
  const sidebar = page.locator('nav.sidebar');
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  await expect(sidebar).toBeVisible();
  await expect(filters).toBeHidden();

  await page.locator('#p1 td').last().click();
  const aside = (await panel(page).boundingBox())!;
  expect(aside.width).toBe(480);
  expect(aside.x + aside.width).toBeCloseTo(1100, 0);
  // The list gets the rest of the width.
  const main = (await page.locator('main').boundingBox())!;
  expect(main.x).toBe(0);
  expect(main.width).toBeCloseTo(1100 - 480, 0);
  await expect(sidebar).toBeHidden();
  await expect(filters).toBeVisible();

  // The sidebar is a drawer, as on phones: Filters opens it, Esc closes it first, then the panel.
  await filters.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('[data-scrim]')).toBeVisible();
  await expect(page.locator('nav.sidebar [data-sev="error"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(filters).toBeFocused();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(sidebar).toBeVisible();
  await expect(filters).toBeHidden();
});

test('at 1100px the selected row stays readable beside the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const fix = 'In http://localhost:3001/:141 (.excalidraw .welcome-screen-menu-item__text), replace "margin-right: auto" with "margin-inline-end: auto".';
  await open(page, [check('chromium', [
    makeIssue({ rule: 'i18n/locale-messages-not-matched', severity: 'warning', text: 'Open', fix }),
    makeIssue({ rule: 'rtl/not-mirrored', severity: 'warning', text: 'Live collaboration and sharing', selector: 'body>div:nth-child(3)>div:nth-child(1)>div:nth-child(1)>button:nth-child(1)', fix }),
  ])]);
  await page.locator('#p2 td').last().click();
  await expect(panel(page)).toBeVisible();
  const label = page.locator('#p2 .label');
  await expect(label).toBeInViewport();
  const l = (await label.boundingBox())!, aside = (await panel(page).boundingBox())!;
  expect(l.x + l.width).toBeLessThanOrEqual(aside.x);
  const overflow = await page.locator('#page-1-1 .scroll').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('at 1440px a keyboard user reaches the panel and keeps focus in it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, THREE);
  const inPanel = () => page.evaluate(() => !!document.activeElement && document.querySelector('aside.panel')!.contains(document.activeElement));

  await page.locator('#p1').focus();
  await page.keyboard.press('Enter');
  await expect(detail(page, 'p1')).toBeVisible();
  expect(await inPanel()).toBe(true);
  await expect(detail(page, 'p1').locator('[data-copy]').first()).toBeFocused();

  // j and k still move, and focus stays in the panel.
  await page.keyboard.press('j');
  await expect(detail(page, 'p2')).toBeVisible();
  expect(await inPanel()).toBe(true);
  await page.keyboard.press('k');
  await expect(detail(page, 'p1')).toBeVisible();
  expect(await inPanel()).toBe(true);

  // The step buttons keep focus on themselves.
  const down = panel(page).locator('[data-step="1"]');
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(detail(page, 'p2')).toBeVisible();
  await expect(down).toBeFocused();
  await down.click();
  await expect(detail(page, 'p3')).toBeVisible();
  expect(await inPanel()).toBe(true);
  await expect(down).toBeFocused();

  // Esc closes the panel and returns to the row.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#p3')).toBeFocused();
});

test('at 1440px a click on a row leaves focus where it is', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, THREE);
  await page.locator('#p1 td').last().click();
  await expect(detail(page, 'p1')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('aside.panel')!.contains(document.activeElement))).toBe(false);
});

test('at 700px ? does nothing, since the help is not shown there', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await open(page, THREE);
  await page.locator('#p1 td').last().click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.locator('[data-keys]')).toHaveAttribute('hidden', '');
  // Esc is not swallowed by an invisible help.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('the sidebar highlight follows a filter change', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  // Short sections (no screenshots), and a last page that only the info toggle hides.
  await open(page, [
    makeCheck({ issues: ['de', 'fr', 'ar', 'ja'].map(locale => makeIssue({ locale, text: `Text ${locale}` })), screenshots: [] }),
    makeCheck({ url: 'http://app.test/z', issues: [makeIssue({ url: 'http://app.test/z', locale: 'pl', severity: 'info', text: 'Last' })], screenshots: [] }),
  ]);
  const info = page.locator('nav.sidebar [data-sev="info"]');
  await info.uncheck();
  // At the bottom of the page, the last section shown is marked.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const marked = page.locator('nav.sidebar a[aria-current="true"]');
  await expect(marked).toHaveAttribute('href', '#page-1-4');
  // Showing the last page adds content below the window only: nothing scrolls and no section enters or leaves the
  // band, but the page is no longer at its bottom, so the section in the band is marked.
  await info.check();
  const expected = await page.evaluate(() => {
    const spy = Array.from(document.querySelectorAll<HTMLElement>('#summary, details.section'));
    const hit = spy.find(el => { const r = el.getBoundingClientRect(); return r.bottom > 96 && r.top < window.innerHeight * 0.45; });
    return hit ? '#' + hit.id : null;
  });
  expect(expected).toMatch(/^#page-1-[123]$/);
  await expect(marked).toHaveAttribute('href', expected!);
});

test('the detail screenshot scrolls to its box', async ({ page }) => {
  const path = await png(page, 1000, 4000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(renderReport(makeRun([makeCheck({
    issues: [makeIssue({ box: { x: 100, y: 3000, width: 200, height: 100 } })],
    screenshots: [{ ...shot({ width: 1000, height: 4000 }), path }],
  })])));
  await page.locator('#p1 td').last().click();
  const crop = detail(page, 'p1').locator('.crop');
  const box = detail(page, 'p1').locator('.dbox');
  await expect(box).toBeVisible();
  const c = (await crop.boundingBox())!, b = (await box.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(c.y);
  expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 1);
});

/** Eight checks, each with one screenshot showing two problems; p1 is the first. */
const shotChecks = () => Array.from({ length: 8 }, (_, i) => makeCheck({
  testTitle: `test ${i}`,
  issues: [makeIssue(), makeIssue({ text: 'Other', box: { x: 0, y: 0, width: 10, height: 10 } })],
  screenshots: [{ ...shot({ width: 1000, height: 2000 }), path: `data:image/png;base64,AAA${i}` }],
}));

test('opening a problem builds its screenshots from the section figures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, shotChecks());
  // Nothing is built before a problem opens.
  await expect(page.locator('.dshot')).toHaveCount(0);
  await expect(detail(page, 'p1').locator('[data-shots]')).toBeHidden();

  await page.locator('#p1 td').last().click();
  const shots = detail(page, 'p1').locator('.dshot');
  // At most 6, with a note for the rest.
  await expect(shots).toHaveCount(6);
  await expect(detail(page, 'p1').locator('.d-block .more')).toHaveText('+2 more in the section');
  await expect(detail(page, 'p1').locator('[data-shots]')).toBeVisible();
  await expect(shots.first().locator('img')).toHaveAttribute('src', /AAA0$/);
  await expect(shots.last().locator('img')).toHaveAttribute('src', /AAA5$/);
  await expect(shots.first().locator('figcaption')).toContainText('test 0');
  // Only this problem's boxes, at the place they have in the section.
  await expect(detail(page, 'p1').locator('.dbox')).toHaveCount(6);
  expect(await detail(page, 'p1').locator('.dbox').first().getAttribute('style')).toContain('left:10%;top:10%;width:5%;height:1%');
  // Copies, not the thumbnails: no thumbnail button, no section classes, and the section keeps its own.
  await expect(detail(page, 'p1').locator('button.shot, .shot-wrap, .box')).toHaveCount(0);
  await expect(page.locator('details.section figure.shot-wrap')).toHaveCount(8);
  await expect(page.locator('details.section .box')).toHaveCount(16);

  // Opening it again, or another problem and back, does not stack a second set.
  await page.locator('#p2 td').last().click();
  await expect(detail(page, 'p2').locator('.dshot')).toHaveCount(6);
  await expect(detail(page, 'p2').locator('.dbox')).toHaveCount(6);
  expect(await detail(page, 'p2').locator('.dbox').first().getAttribute('style')).toContain('left:0%;top:0%');
  await page.locator('#p1 td').last().click();
  await expect(detail(page, 'p1').locator('.dshot')).toHaveCount(6);
  await expect(detail(page, 'p1').locator('.d-block .more')).toHaveCount(1);
});

test('detail screenshots show even when a filter hides the section figure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, [
    check('chromium', [makeIssue({ text: 'One' })]),
    check('webkit', [makeIssue({ text: 'One' })]),
  ]);
  await filter(page, 'project').selectOption('webkit');
  await expect(page.locator('figure.shot-wrap[data-project="chromium"]')).toBeHidden();
  await page.locator('#p1 td').last().click();
  // Both projects' screenshots of the problem, none of them hidden or enlarged.
  await expect(detail(page, 'p1').locator('.dshot:visible')).toHaveCount(2);
  await expect(detail(page, 'p1').locator('.dbox:visible')).toHaveCount(2);
});

/** `n` checks of one project, each with one screenshot of the same problem: one section with `n` thumbnails. */
const strip = (n: number, project = 'chromium') => Array.from({ length: n }, (_, i) =>
  makeCheck({ project, testTitle: `${project} ${i}`, issues: [makeIssue()], screenshots: [shot()] }));
const thumbnails = (page: Page) => page.locator('#page-1-1 .shots figure.shot-wrap');
const showAll = (page: Page) => page.locator('#page-1-1 .shots .shots-toggle');

test('a long thumbnail strip shows the first 6 and a control for the rest', async ({ page }) => {
  await open(page, strip(10));
  await expect(thumbnails(page)).toHaveCount(10);
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(6);
  await expect(thumbnails(page).nth(5)).toBeVisible();
  await expect(thumbnails(page).nth(6)).toBeHidden();
  await expect(showAll(page)).toHaveText('Show all 10 screenshots');
  await expect(showAll(page)).toHaveAttribute('aria-expanded', 'false');

  await showAll(page).click();
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(10);
  await expect(showAll(page)).toHaveText('Show fewer');
  await expect(showAll(page)).toHaveAttribute('aria-expanded', 'true');

  await showAll(page).click();
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(6);
  await expect(showAll(page)).toHaveText('Show all 10 screenshots');
});

test('a strip of 6 or fewer has no control', async ({ page }) => {
  await open(page, strip(6));
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(6);
  await expect(page.locator('.shots-toggle:visible')).toHaveCount(0);
});

test('the cap counts the thumbnails a filter leaves, not the hidden ones', async ({ page }) => {
  await open(page, [...strip(8, 'chromium'), ...strip(8, 'webkit')]);
  await expect(showAll(page)).toHaveText('Show all 16 screenshots');
  await filter(page, 'project').selectOption('webkit');
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(6);
  await expect(thumbnails(page).filter({ visible: true }).first()).toHaveAttribute('data-project', 'webkit');
  await expect(showAll(page)).toHaveText('Show all 8 screenshots');
  // Fewer than 7 left: nothing to expand.
  await open(page, [...strip(8, 'chromium'), ...strip(3, 'webkit')]);
  await filter(page, 'project').selectOption('webkit');
  await expect(thumbnails(page).filter({ visible: true })).toHaveCount(3);
  await expect(showAll(page)).toBeHidden();
});

test('a thumbnail past the cap still feeds the detail panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, strip(10));
  await page.locator('#p1 td').last().click();
  await expect(detail(page, 'p1').locator('.dshot:visible')).toHaveCount(6);
  await expect(detail(page, 'p1').locator('.d-block .more')).toHaveText('+4 more in the section');
  await expect(detail(page, 'p1').locator('[data-over]')).toHaveCount(0);
});

test.describe('the thumbnail strip without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows every thumbnail and no dead control', async ({ page }) => {
    await open(page, strip(10));
    await expect(thumbnails(page).filter({ visible: true })).toHaveCount(10);
    await expect(page.locator('.shots-toggle')).toHaveCount(0);
  });
});

test.describe('the panel without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('is not shown, and the rows keep the selector and the fix', async ({ page }) => {
    await page.setContent(renderReport(makeRun([makeCheck({ issues: [makeIssue({ fix: 'Grow it.' })] })])));
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('#p1')).toContainText('Grow it.');
    await expect(page.locator('#p1 details.sel code')).toHaveText('#save');
    expect(await page.locator('#p1').getAttribute('tabindex')).toBeNull();
  });
});

test('closing the panel keeps a hash the reader navigated to', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await serve(page, THREE);
  await page.locator('#p1 td').last().click();
  expect(page.url()).toBe('http://report.test/#p1');
  await page.locator('nav.sidebar a[href="#page-1-2"]').click();
  await expect(page).toHaveURL('http://report.test/#page-1-2');
  await expect(panel(page)).toBeVisible(); // beside the content, the panel stays open
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  expect(page.url()).toBe('http://report.test/#page-1-2');
});

test('at 1280px the table beside the panel needs no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fix = 'In http://localhost:3001/:141 (.excalidraw .welcome-screen-menu-item__text), replace "margin-right: auto" with "margin-inline-end: auto".';
  await open(page, [check('chromium', [
    makeIssue({ rule: 'i18n/locale-messages-not-matched', severity: 'warning', text: 'Open', message: 'None of the visible text matches the "de" messages in localeMessages, so overflow was not checked in this locale.', fix }),
    makeIssue({ rule: 'rtl/not-mirrored', severity: 'warning', text: 'Live collaboration and sharing', selector: 'body>div:nth-child(3)>div:nth-child(1)>div:nth-child(1)>button:nth-child(1)', fix }),
  ])]);
  await page.locator('#p1 td').last().click();
  await expect(panel(page)).toBeVisible();
  const overflow = await page.locator('#page-1-1 .scroll').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Every row keeps its message readable: at least about 200px wide.
  for (const td of await page.locator('#page-1-1 tr.problem > td:last-child').all()) expect((await td.boundingBox())!.width).toBeGreaterThan(200);
});

test.describe('the panel at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('closes when the reader navigates, filters or searches, since it covers the content', async ({ page }) => {
    await open(page, THREE);
    const filters = page.getByRole('button', { name: 'Filters', exact: true });

    await page.locator('#p1 td').last().click();
    await expect(panel(page)).toBeVisible();
    await filters.click();
    await page.locator('nav.sidebar a[href="#page-1-2"]').click();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('#page-1-2')).toBeInViewport();

    await page.locator('#p1 td').last().click();
    await filters.click();
    await filter(page, 'rule').selectOption('overflow/clipped');
    await page.keyboard.press('Escape'); // the drawer
    await expect(panel(page)).toBeHidden();

    await page.locator('#p1 td').last().click();
    await expect(panel(page)).toBeVisible();
    await page.locator('[data-search]').fill('One');
    await expect(panel(page)).toBeHidden();
    await expect(rows(page).filter({ visible: true })).toHaveCount(1);
  });

  test('Esc closes the drawer above the panel first, then the panel', async ({ page }) => {
    await open(page, THREE);
    await page.locator('#p1 td').last().click();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.locator('nav.sidebar')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('nav.sidebar')).toBeHidden();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
  });

  test('is full width', async ({ page }) => {
    await open(page, THREE);
    await page.locator('#p1 td').last().click();
    const aside = (await panel(page).boundingBox())!;
    expect(aside.x).toBe(0);
    expect(aside.width).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
  });
});

test('a matrix cell of a run without projects filters by locale only', async ({ page }) => {
  await open(page, [makeCheck({ issues: [makeIssue({ locale: 'de', text: 'One' }), makeIssue({ locale: 'fr', text: 'Two' })], screenshots: [shot()] })]);
  await filter(page, 'locale').selectOption('');
  await page.locator('#summary [data-pick-locale="fr"]').click();
  await expect(filter(page, 'locale')).toHaveValue('fr');
  await expect(rows(page).filter({ visible: true })).toHaveCount(1);
});

test('matrix cells for no locale or no project are plain counts, and a project cell still sets its project', async ({ page }) => {
  await open(page, [
    check('chromium', [makeIssue({ locale: 'de', text: 'One' }), makeIssue({ locale: '', text: 'Nolocale' })]),
    check('webkit', [makeIssue({ locale: 'de', text: 'Two' })]),
    makeCheck({ issues: [makeIssue({ locale: 'de', text: 'Noproject' })], screenshots: [shot()] }),
  ]);
  await filter(page, 'project').selectOption('webkit');
  await page.locator('#summary .matrix td.num').filter({ hasText: '1' }).locator('button').first().click(); // de in chromium
  await expect(filter(page, 'project')).toHaveValue('chromium');
  // The cells without a button have nothing to click: their count is plain text.
  await expect(page.locator('#summary .matrix td.num:not(:has(button)):not(:has(.zero))')).toHaveCount(2);
});
