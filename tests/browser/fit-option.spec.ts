import type { Page } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import type { CheckResult } from '../../src/types';

const setLang = async (page: Page, locale: string) => { await page.evaluate(l => { document.documentElement.lang = l; }, locale); };
const PAGE = `<!doctype html><meta charset=utf-8><html lang=en><body style="margin:0;font:16px/20px sans-serif">
  <button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button><p id=u>Billing details</p>`;
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector} ${i.mode} ${i.viewport.width}`).sort();

test.describe('with fitMap', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', setLocale: setLang, sourceMessages: 'tests/browser/fixtures/messages-en.json', fitMap: true } });

  test('fitMap: true records one fit record per viewport on a source page', async ({ page, localeCheck }) => {
    await page.setContent(PAGE);
    const result = await localeCheck();
    expect(result.fit?.map(r => r.viewport)).toEqual(VIEWPORTS);
    for (const rec of result.fit!) expect(rec.entries.map(e => e.key).sort()).toEqual(['a', 'b']);
    const save = result.fit![0].entries.find(e => e.key === 'b')!;
    expect(save.oneLine).toBe(true);
    expect(save.roomX).not.toBeNull();
  });

  test('never on a real locale page', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(PAGE.replace('Save changes', 'Änderungen speichern'));
    await useLocale('de');
    expect((await localeCheck()).fit).toBeUndefined();
  });
});

test.describe('without fitMap', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', sourceMessages: 'tests/browser/fixtures/messages-en.json' } });

  test('off by default', async ({ page, localeCheck }) => {
    await page.setContent(PAGE);
    expect((await localeCheck()).fit).toBeUndefined();
  });
});

test.describe('recording leaves the other checks alone', () => {
  let withFit: string[] = [];
  test.describe(() => {
    test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', sourceMessages: 'tests/browser/fixtures/messages-en.json', fitMap: true } });
    test('with', async ({ page, localeCheck }) => { await page.setContent(PAGE); withFit = list(await localeCheck()); });
  });
  test.describe(() => {
    test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', sourceMessages: 'tests/browser/fixtures/messages-en.json' } });
    test('recording does not change what the other modes find', async ({ page, localeCheck }) => {
      await page.setContent(PAGE);
      const without = list(await localeCheck());
      expect(without.length).toBeGreaterThan(0);
      expect(withFit).toEqual(without);
    });
  });
});
