import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

type Icons = Record<string, 'mirror' | 'invariant' | 'ignore'>;

/** Snapshot icons, force right-to-left, compare, restore. Returns "rule selector" strings. */
async function run(page: Page, css: string, html: string, icons: Icons = {}): Promise<string[]> {
  await load(page, `<style>${css}</style>${html}`);
  return page.evaluate(icons => {
    const fl = window.__fitlocale;
    fl.rememberIcons([], icons);
    fl.setDir('rtl');
    try {
      return fl.findIconIssues([], icons).map(i => `${i.rule} ${i.selector}`);
    } finally {
      fl.setDir(null);
    }
  }, icons);
}

const NEXT = `<button aria-label="Next"><svg id=n width=16 height=16 class="icon-chevron"><path d="M0 0h16"/></svg></button>`;
const GIF_A = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const GIF_B = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';

test('a directional icon that does not flip is reported', async ({ page }) => {
  expect(await run(page, '', NEXT)).toEqual(['rtl/icon-not-mirrored #n']);
});

for (const flip of ['transform: scaleX(-1)', 'scale: -1 1', 'rotate: 180deg']) {
  test(`a directional icon flipped with ${flip} is fine`, async ({ page }) => {
    expect(await run(page, `[dir=rtl] .icon-chevron { ${flip} }`, NEXT)).toEqual([]);
  });
}

test('an icon whose drawing changes in right-to-left is fine', async ({ page }) => {
  const html = `<span id=b class="icon icon-arrow-left" style="display:inline-block;width:16px;height:16px"></span>`;
  const css = `.icon-arrow-left { background-image: url(${GIF_A}) } [dir=rtl] .icon-arrow-left { background-image: url(${GIF_B}) }`;
  expect(await run(page, css, html)).toEqual([]);
  // Control: the same sprite without the right-to-left swap is reported.
  expect(await run(page, `.icon-arrow-left { background-image: url(${GIF_A}) }`, html)).toEqual(['rtl/icon-not-mirrored #b']);
});

test('a media icon that flips is reported', async ({ page }) => {
  const html = `<svg id=p class="icon-play" width=16 height=16><path d="M0 0h16"/></svg>`;
  expect(await run(page, '[dir=rtl] svg { transform: scaleX(-1) }', html)).toEqual(['rtl/icon-mirrored #p']);
});

test('a vertical chevron is never reported', async ({ page }) => {
  expect(await run(page, '', `<svg id=d class="icon-chevron-down" width=16 height=16><path d="M0 0h16"/></svg>`)).toEqual([]);
});

test('ignored areas and data-fitlocale-icon="ignore" are skipped', async ({ page }) => {
  expect(await run(page, '', `<div data-fitlocale-ignore>${NEXT}</div>`)).toEqual([]);
  expect(await run(page, '', NEXT.replace('<button', '<button data-fitlocale-icon="ignore"'))).toEqual([]);
});

test('the icons option names your own icons', async ({ page }) => {
  const html = `<svg id=g class="my-glyph" width=16 height=16><path d="M0 0h16"/></svg>`;
  expect(await run(page, '', html, { glyph: 'mirror' })).toEqual(['rtl/icon-not-mirrored #g']);
});

test('large images are not icons', async ({ page }) => {
  expect(await run(page, '', `<svg id=big class="arrow-right" width=200 height=200><path d="M0 0h16"/></svg>`)).toEqual([]);
});

test('an icon button is not the icon: a flipped SVG inside it is fine', async ({ page }) => {
  const html = '<button id=b class="MuiIconButton-root" aria-label="back" style="width:32px;height:32px">'
    + '<svg class="MuiSvgIcon-root" data-testid="ArrowBackIcon" width=16 height=16><path d="M0 0h16"/></svg></button>';
  expect(await run(page, '[dir=rtl] .MuiSvgIcon-root { transform: scaleX(-1) }', html)).toEqual([]);
});

test('a flip on ::before counts as flipped', async ({ page }) => {
  const html = '<i id=b class="bi bi-chevron-right" style="display:inline-block;width:16px;height:16px"></i>';
  const css = '.bi-chevron-right::before { content: "›"; display: inline-block }';
  expect(await run(page, `${css} [dir=rtl] .bi-chevron-right::before { transform: scaleX(-1) }`, html)).toEqual([]);
  expect(await run(page, css, html)).toEqual(['rtl/icon-not-mirrored #b']);
});

test('Material ligature icons are checked', async ({ page }) => {
  const html = '<span id=m class="material-icons" style="display:inline-block;width:16px;height:16px;overflow:hidden">arrow_back</span>';
  expect(await run(page, '', html)).toEqual(['rtl/icon-not-mirrored #m']);
});
