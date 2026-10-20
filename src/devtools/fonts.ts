import type { Page } from '@playwright/test';
import { clip } from '../browser/dom';
import { fallbackFonts, parseFontFamily, type PlatformFont } from '../rules/fonts';
import type { FitlocaleBrowserApi } from '../browser/api';
import type { RawIssue } from '../types';
import type { Devtools } from './session';

type Api = { __fitlocale: FitlocaleBrowserApi };

/** Arabic and Hebrew text drawn in a fallback font, because none of the declared fonts has those letters. */
export async function findFontFallback(page: Page, devtools: Devtools, ignore: string[]): Promise<RawIssue[]> {
  const { samples, loadedFamilies } = await page.evaluate(ig => (window as unknown as Api).__fitlocale.fontSamples(ig), ignore);
  const available = new Set(loadedFamilies.map(f => f.toLowerCase()));
  const measured: Array<{ sample: (typeof samples)[number]; declared: string[]; used: PlatformFont[] }> = [];
  for (const sample of samples) {
    try {
      const nodeId = await devtools.nodeFor(sample.key);
      if (!nodeId) continue;
      const { fonts } = await devtools.send('CSS.getPlatformFontsForNode', { nodeId });
      const declared = parseFontFamily(sample.fontFamily);
      const lower = new Set(declared.map(f => f.toLowerCase()));
      // A declared family seen drawing text anywhere on the page is installed on this machine.
      for (const f of fonts) if (f.glyphCount > 0 && (f.isCustomFont || lower.has(f.familyName.toLowerCase()))) available.add(f.familyName.toLowerCase());
      measured.push({ sample, declared, used: fonts });
    } catch { /* the element changed: skip it */ }
  }
  const issues: RawIssue[] = [];
  for (const { sample, declared, used } of measured) {
    if (!sample.rtl) continue;
    const fallback = fallbackFonts(declared, used, available);
    if (fallback.length === 0) continue;
    issues.push({
      rule: 'rtl/font-fallback', key: sample.key, selector: sample.selector, box: sample.box, text: clip(sample.text),
      used: fallback.join(', '), declared: declared.join(', '),
    });
  }
  return issues;
}
