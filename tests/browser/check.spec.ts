import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { FIXES, type CheckResult } from '../../src/types';

const CLIPPED = `<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const BADGE = `<div id=badge style="position:absolute;left:16px">New</div>`;
const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector} ${i.mode}`).sort();

test.use({ fitlocale: { viewports: 'current', failOn: 'never' } });

test('source leaks and pseudo-long overflow', async ({ page, localeCheck }) => {
  await page.setContent(`${CLIPPED}<p id=k>dashboard.welcome.title</p>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['leak/raw-key #k source', 'overflow/clipped #s pseudo-long']);
  for (const i of result.issues) {
    expect(i.severity).toBe('error');
    expect(i.message.length).toBeGreaterThan(0);
    expect(i.url).toBe('about:blank');
    expect(i.viewport).toEqual({ width: 1280, height: 720 });
  }
});

test('noise rule drops issues already present in source', async ({ page, localeCheck }) => {
  await page.setContent(`<div id=e style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A very long account settings title</div>`);
  const result = await localeCheck();
  expect(result.issues.filter(i => i.rule.startsWith('overflow/'))).toEqual([]);
});

test('pseudo-rtl flags absolute left element', async ({ page, localeCheck }) => {
  await page.setContent(`<body style="margin:0">${BADGE}</body>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/not-mirrored #badge pseudo-rtl']);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('dir'))).toBe(false);
  await expect(page.locator('#badge')).toHaveText('New');
});

test('already-RTL page skips mirroring', async ({ page, localeCheck }) => {
  await page.setContent(`<html dir="rtl"><body style="margin:0">${BADGE}</body></html>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/skipped-already-rtl html pseudo-rtl']);
  expect(result.issues[0].severity).toBe('info');
});

test.describe('with a locale switcher that updates lang', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never',
    setLocale: async (page, l) => { await page.evaluate(x => { document.documentElement.lang = x; }, l); } } });

  test('persistence', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="de"><body>${CLIPPED}</body></html>`);
    await useLocale('fr');
    await page.evaluate(() => { document.documentElement.lang = 'de'; });
    const result = await localeCheck();
    expect(list(result)).toEqual(['locale/persistence html source']);
    expect(result.issues[0].message).toBe('The page language changed back: expected "fr", found "de".');
  });
});

test.describe('with a locale switcher that never updates lang', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: async () => {} } });

  test('persistence says lang never reflected the locale', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="en"><body><p>Hallo</p></body></html>`);
    await useLocale('de');
    const result = await localeCheck();
    expect(list(result)).toEqual(['locale/persistence html source']);
    expect(result.issues[0].message).toBe(
      'The page\'s lang attribute is "en", not "de", even right after switching locale. Update <html lang> or set the localeProbe option.');
  });
});

test('useLocale without setLocale throws', async ({ useLocale }) => {
  await expect(useLocale('de')).rejects.toThrow('useLocale() needs the setLocale option');
});

test.describe('mobile viewport', () => {
  test.use({ fitlocale: { viewports: [{ width: 390, height: 844 }], failOn: 'never' } });

  test('viewports are applied and restored', async ({ page, localeCheck }) => {
    await page.setContent(CLIPPED);
    const before = page.viewportSize();
    const result = await localeCheck();
    expect(result.issues.length).toBeGreaterThan(0);
    for (const i of result.issues) expect(i.viewport).toEqual({ width: 390, height: 844 });
    expect(page.viewportSize()).toEqual(before);
  });
});

test.describe('failing on errors', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'error', baseline: false } });

  test('failOn error fails the test', async ({ page, localeCheck }) => {
    test.fail();
    await page.setContent(CLIPPED);
    await localeCheck();
  });
});

test('attachments are written', async ({ page, localeCheck }, testInfo) => {
  await page.setContent(CLIPPED);
  await localeCheck();
  expect(testInfo.attachments.filter(a => a.name === 'fitlocale:result')).toHaveLength(1);
  const shots = testInfo.attachments.filter(a => a.name === 'fitlocale:screenshot');
  expect(shots.length).toBeGreaterThan(0);
  expect(existsSync(shots[0].path!)).toBe(true);
});

test('body dir=rtl page skips mirroring with one info issue', async ({ page, localeCheck }) => {
  await page.setContent(`<body dir="rtl" style="margin:0">${BADGE}<p style="width:200px">مرحبا</p><button>زر</button></body>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/skipped-already-rtl html pseudo-rtl']);
});

test('app root with dir=rtl is not flagged', async ({ page, localeCheck }) => {
  await page.setContent(`<body style="margin:0"><div id=root dir="rtl" style="position:relative;height:100px">
    <div style="position:absolute;right:16px">شارة</div><p style="width:200px">مرحبا</p><button>زر</button></div></body>`);
  const result = await localeCheck();
  expect(result.issues.filter(i => i.rule === 'rtl/not-mirrored')).toEqual([]);
});

test('config-level fitlocale options merge with test.use overrides', async ({ page, localeCheck }) => {
  // playwright.config.ts sets fitlocale.ignore = ['.config-ignored'] for the browser project.
  await page.setContent(`<p class="config-ignored">You have {count} messages</p>`);
  const result = await localeCheck();
  expect(result.issues).toEqual([]);
});

test('waits for web fonts after rewriting text', async ({ page, localeCheck }) => {
  await page.setContent(`<button id=s style="width:300px;overflow:hidden;white-space:nowrap">Save changes</button>`);
  // A font that only starts loading once the accented pseudo text needs it, and makes the text wider.
  await page.evaluate(() => {
    let pending: Promise<void> | null = null;
    Object.defineProperty(document.fonts, 'ready', {
      configurable: true,
      get: () => pending ??= new Promise<void>(resolve => setTimeout(() => {
        document.getElementById('s')!.style.fontSize = '40px';
        resolve();
      }, 150)),
    });
  });
  const result = await localeCheck();
  expect(list(result)).toEqual(['overflow/clipped #s pseudo-long']);
});

test('the page is put back exactly as it was', async ({ page, localeCheck }) => {
  await page.setContent(`<body style="margin:0">${CLIPPED}${BADGE}<p id=k>dashboard.welcome.title</p></body>`);
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  await localeCheck();
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});

test.describe('two viewports on an RTL page', () => {
  test.use({ fitlocale: { viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }], failOn: 'never' } });

  test('skipped-already-rtl is reported once per check', async ({ page, localeCheck }) => {
    await page.setContent(`<html dir="rtl"><body style="margin:0">${BADGE}</body></html>`);
    const result = await localeCheck();
    expect(list(result)).toEqual(['rtl/skipped-already-rtl html pseudo-rtl']);
  });
});

test('a navigation during the check gives a clear error', async ({ page, localeCheck }) => {
  await page.route('http://fitlocale.test/**', route => route.fulfill({ contentType: 'text/html', body: `<p id=p>Hello</p>
    <script>new MutationObserver(() => location.reload()).observe(document.body, { subtree: true, characterData: true });</script>` }));
  await page.goto('http://fitlocale.test/');
  await expect(localeCheck()).rejects.toThrow('fitlocale: the page navigated during localeCheck()');
});

test.describe('context without a fixed viewport', () => {
  test.use({ viewport: null, fitlocale: { viewports: [{ width: 390, height: 844 }], failOn: 'never' } });

  test('the window size is restored after checking other viewports', async ({ page, localeCheck }) => {
    await page.setContent(CLIPPED);
    const size = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const before = await size();
    expect(before).not.toEqual({ width: 390, height: 844 });
    await localeCheck();
    expect(await size()).toEqual(before);
  });
});

test.describe('with a custom testIdAttribute', () => {
  test.use({ testIdAttribute: 'data-qa' });

  test('selectors use the project test id attribute', async ({ page, localeCheck }) => {
    await page.setContent(`<p data-qa="welcome">dashboard.welcome.title</p>`);
    const result = await localeCheck();
    expect(list(result)).toEqual(['leak/raw-key [data-qa="welcome"] source']);
  });
});

test('issues record the locale they were found in', async ({ page, localeCheck }) => {
  await page.setContent(`${CLIPPED}<p id=k>dashboard.welcome.title</p>`);
  const result = await localeCheck();
  expect(result.issues.map(i => i.locale)).toEqual(['en', 'en']);
});

test.describe('locale field after switching', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never',
    setLocale: async (page, l) => { await page.evaluate(x => { document.documentElement.lang = x; }, l); } } });

  test('issues in a switched locale carry that locale', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="en"><body><p id=k>dashboard.welcome.title</p></body></html>`);
    await useLocale('de');
    const result = await localeCheck();
    expect(result.issues.map(i => `${i.rule} ${i.locale}`)).toEqual(['leak/raw-key de']);
  });
});

test('deeply nested pages stay within budget', async ({ page, localeCheck }) => {
  // 1,500 rows, 25 levels deep, with text at every level: about 39,000 text elements.
  // This took over 20s before clip results were cached and text writes stopped updating live Ranges.
  const row = (i: number) => '<div>x '.repeat(25) + `<span>Row ${i} label</span>` + '</div>'.repeat(25);
  await page.setContent(Array.from({ length: 1500 }, (_, i) => row(i)).join(''));
  const t0 = Date.now();
  await localeCheck();
  expect(Date.now() - t0).toBeLessThan(6000);
});

const setLang = async (page: Page, l: string) => { await page.evaluate(x => { document.documentElement.lang = x; }, l); };

test.describe('integrated pseudo-locale mode', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang } });

  test('hardcoded, concatenated and overflow are found, and the page is restored', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<p id=h>Free shipping</p>
      <p id=c><span>⟦You saved ~⟧</span> <span>⟦on this order ~~⟧</span></p>
      <button id=s style="width:120px;overflow:hidden;white-space:nowrap">⟦Šávé çháñgéš ~~~~~⟧</button>
      <p id=d>October 19, 2026</p>`);
    await useLocale('en-XA');
    const before = await page.content();
    const result = await localeCheck();
    expect(list(result)).toEqual(['i18n/concatenated #c source', 'i18n/hardcoded #h source', 'overflow/clipped #s source']);
    expect(result.issues.map(i => i.locale)).toEqual(['en-XA', 'en-XA', 'en-XA']);
    expect(await page.content()).toBe(before);
  });

  test('overflow already present in the source text is not reported', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<div id=e style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">⟦Á véry löñg áççöüñt šéttîñgš tîtlé ~~~~~~~~~~⟧</div>`);
    await useLocale('en-XA');
    const result = await localeCheck();
    expect(result.issues.filter(i => i.rule.startsWith('overflow/'))).toEqual([]);
  });

  test('a pseudo locale sharing the source language never gets pseudo-long text', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<button id=s style="width:100px;overflow:hidden;white-space:nowrap">⟦Šávé ~~⟧</button>`);
    await useLocale('en-XA');
    const result = await localeCheck();
    expect(list(result)).toEqual([]);
    expect(result.screenshots.filter(s => s.mode === 'pseudo-long')).toEqual([]);
  });

  test('without useLocale, a page whose lang is a pseudo locale is checked as one', async ({ page, localeCheck }) => {
    await page.setContent(`<html lang="en-XA"><body><p>⟦Hömé ~⟧</p><p id=h>Free shipping</p></body></html>`);
    const result = await localeCheck();
    expect(list(result)).toContain('i18n/hardcoded #h source');
  });
});

test.describe('integrated mode edge cases', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang } });

  test('pseudo-locale messages that never loaded give one clear issue', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<p>Home</p><p>Free shipping</p><button>Save changes</button>`);
    await useLocale('en-XA');
    const result = await localeCheck();
    expect(list(result)).toEqual(['i18n/pseudo-not-loaded html source']);
    expect(result.issues[0].message).toContain('"en-XA"');
  });

  test('overflow of a message ending in a tag is found', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<button id=a style="width:100px;overflow:hidden;white-space:nowrap">⟦Öpéñ hélp ~~~~~~~~⟧</button>
      <button id=b style="width:100px;overflow:hidden;white-space:nowrap">⟦Öpéñ <b>hélp</b> ~~~~~~~~⟧</button>`);
    await useLocale('en-XA');
    expect(list(await localeCheck())).toEqual(['overflow/clipped #a source', 'overflow/clipped #b source']);
  });

  test('icon-font ligatures are not hardcoded text', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<p>⟦Hömé ~⟧</p><button id=x><span class="material-icons">close</span></button>
      <a href=# id=y><span class="material-symbols-outlined">arrow_forward</span></a>`);
    await useLocale('en-XA');
    expect(list(await localeCheck())).toEqual([]);
  });
});

test.describe('real locale with source messages', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang, sourceMessages: 'tests/browser/fixtures/messages-en.json' } });
  const CONTENT = `<p id=u>Billing details</p><p id=t>Rechnungsdetails</p>`;

  test('untranslated text is reported', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(CONTENT);
    await useLocale('de');
    expect(list(await localeCheck())).toEqual(['i18n/untranslated #u source']);
  });

  test.describe('with a regional source locale', () => {
    test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang, sourceMessages: 'tests/browser/fixtures/messages-en.json', sourceLocale: 'en-US' } });

    test('another region of the source language is not untranslated', async ({ page, localeCheck, useLocale }) => {
      await page.setContent(CONTENT);
      await useLocale('en-GB');
      expect(list(await localeCheck())).toEqual([]);
    });
  });
});

test.describe('right-to-left depth', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang } });
  const NEXT_ICON = '<button aria-label="Next"><svg id=n class="icon-chevron" width=16 height=16><path d="M0 0h16"/></svg></button>';

  test('icons are checked when the page is forced right-to-left', async ({ page, localeCheck }) => {
    await page.setContent(`<style>[dir=rtl] #p { transform: scaleX(-1) }</style>${NEXT_ICON}
      <svg id=p class="icon-play" width=16 height=16><path d="M0 0h16"/></svg>`);
    const found = list(await localeCheck());
    expect(found).toContain('rtl/icon-not-mirrored #n pseudo-rtl');
    expect(found).toContain('rtl/icon-mirrored #p pseudo-rtl');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('dir'))).toBe(false);
  });

  test.describe('two viewports', () => {
    test.use({ fitlocale: { viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }], failOn: 'never' } });

    test('a canvas gets one info notice per check', async ({ page, localeCheck }) => {
      await page.setContent('<canvas id=chart width=200 height=100></canvas>');
      const result = await localeCheck();
      const canvas = result.issues.filter(i => i.rule === 'rtl/canvas');
      expect(canvas.map(i => `${i.selector} ${i.mode} ${i.severity}`)).toEqual(['#chart pseudo-rtl info']);
    });
  });

  test('a right-to-left locale laid out left-to-right is an error', async ({ page, localeCheck, useLocale }) => {
    await page.setContent('<p>مرحبا</p>');
    await useLocale('ar');
    const result = await localeCheck();
    expect(list(result)).toContain('rtl/missing-dir html source');
    expect(result.issues.find(i => i.rule === 'rtl/missing-dir')!.message).toContain('"ar"');
  });

  test('direction set on an app wrapper counts as right-to-left', async ({ page, localeCheck, useLocale }) => {
    await page.setContent('<div id=app dir="rtl"><p>مرحبا بكم في المتجر</p><p id=c>تعلم C++ اليوم</p></div>');
    await useLocale('ar');
    const found = list(await localeCheck());
    expect(found.filter(f => f.startsWith('rtl/missing-dir'))).toEqual([]);
    expect(found).toContain('rtl/bidi-order #c source');
  });

  test('a right-to-left page gets bidi and canvas checks, but no icon checks', async ({ page, localeCheck }) => {
    await page.setContent(`<html dir="rtl" lang="ar"><body><p id=c>تعلم C++ اليوم</p>
      <canvas id=chart width=200 height=100></canvas>${NEXT_ICON}</body></html>`);
    const result = await localeCheck();
    const found = list(result);
    expect(found).toContain('rtl/bidi-order #c source');
    expect(found).toContain('rtl/canvas #chart source');
    expect(found).toContain('rtl/skipped-already-rtl html pseudo-rtl');
    expect(found.filter(f => f.includes('icon'))).toEqual([]);
    expect(result.issues.find(i => i.rule === 'rtl/bidi-order')!.message)
      .toBe('Mixed-direction text is shown in the wrong order: "C++" appears as "++C".');
  });
});

test.describe('DevTools checks', () => {
  const POSITIONED = '<body style="margin:0"><div id=badge style="position:absolute;left:16px">New</div></body>';
  const notMirrored = (r: CheckResult) => r.issues.find(i => i.rule === 'rtl/not-mirrored')!;

  test.describe('turned off', () => {
    test.use({ fitlocale: { viewports: 'current', failOn: 'never', devtools: false } });

    test('mirroring issues keep the generic fix', async ({ page, localeCheck }) => {
      await page.setContent(POSITIONED);
      const issue = notMirrored(await localeCheck());
      expect(issue.source).toBeUndefined();
      expect(issue.fix).toBe(FIXES['rtl/not-mirrored']);
    });
  });

  test('by default a mirroring issue points at its CSS', async ({ page, localeCheck }) => {
    await page.setContent(POSITIONED);
    const issue = notMirrored(await localeCheck());
    expect(issue.source).toMatchObject({ selector: 'style attribute', property: 'left', replacement: 'inset-inline-start: 16px' });
  });

  test.describe('several viewports', () => {
    test.use({ fitlocale: { viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }], failOn: 'never' } });

    test('the CSS is read while the viewport that found the issue is active', async ({ page, localeCheck }) => {
      await page.setContent(`<style>.side { width: 100px } @media (min-width: 768px) { .side { position: absolute; left: 10px } }</style>
        <body style="margin:0"><div id=side class=side>Side</div></body>`);
      const issue = notMirrored(await localeCheck());
      expect(issue.viewport.width).toBe(1280);
      expect(issue.source).toMatchObject({ property: 'left', value: '10px' });
    });
  });

  test('clipped marks are checked on right-to-left pages', async ({ page, localeCheck }) => {
    await page.setContent('<html dir="rtl" lang="ar"><body><div id=t style="height:14px;line-height:1;font-size:20px;overflow:hidden;white-space:nowrap">إِنَّ الْعِلْمَ</div></body></html>');
    expect(list(await localeCheck())).toContain('rtl/clipped-marks #t source');
  });
});
