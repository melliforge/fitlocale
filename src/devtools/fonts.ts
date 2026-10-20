import type { Page } from '@playwright/test';
import { clip } from '../browser/dom';
import { fallbackFonts, isGeneric, parseFontFamily, type PlatformFont } from '../rules/fonts';
import type { FitlocaleBrowserApi } from '../browser/api';
import type { RawIssue } from '../types';
import type { Devtools } from './session';

type Api = { __fitlocale: FitlocaleBrowserApi };

interface StyleProps { cssProperties: Array<{ name: string }> }
interface RuleMatch { rule: { origin: string; style: StyleProps } }

/** Does an author style on this element or an ancestor set its font? The browser's default font is not a declared one. */
async function authorSetsFont(devtools: Devtools, nodeId: number): Promise<boolean> {
  const m = await devtools.send('CSS.getMatchedStylesForNode', { nodeId }) as {
    matchedCSSRules?: RuleMatch[]; inlineStyle?: StyleProps; inherited?: Array<{ matchedCSSRules?: RuleMatch[]; inlineStyle?: StyleProps }>;
  };
  const sets = (style?: StyleProps) => !!style?.cssProperties.some(p => p.name === 'font-family' || p.name === 'font');
  const levels = [{ matchedCSSRules: m.matchedCSSRules, inlineStyle: m.inlineStyle }, ...(m.inherited ?? [])];
  return levels.some(l => sets(l.inlineStyle) || (l.matchedCSSRules ?? []).some(r => r.rule.origin !== 'user-agent' && sets(r.rule.style)));
}

const LATIN_PROBE = 'abcdefghijklmnopqrstuvwxyz';
const RTL_LETTERS = /[\p{Script=Arabic}\p{Script=Hebrew}]/gu;
const quote = (family: string) => `"${family.replace(/["\\]/g, '\\$&')}"`;

/**
 * Arabic and Hebrew text drawn in a fallback font, because none of the declared fonts has those letters.
 * Fonts are measured on hidden probes: the element's right-to-left letters alone in its font, and each named
 * family alone (is it on this machine?). The probes are removed before returning.
 */
export async function findFontFallback(page: Page, devtools: Devtools, ignore: string[]): Promise<RawIssue[]> {
  const { samples, loadedFamilies } = await page.evaluate(ig => (window as unknown as Api).__fitlocale.fontSamples(ig), ignore);
  const rtl = samples.filter(s => s.rtl);
  if (rtl.length === 0) return [];
  const families = [...new Set(rtl.flatMap(s => parseFontFamily(s.fontFamily)).filter(f => !isGeneric(f)))];
  const probes = [
    ...rtl.map(s => ({
      text: (s.text.match(RTL_LETTERS) ?? []).join(''), fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, fontSize: s.fontSize, lang: s.lang,
    })),
    ...families.map(f => ({ text: LATIN_PROBE, fontFamily: quote(f) })),
  ];
  const fontsOf = async (selector: string): Promise<PlatformFont[] | null> => {
    const nodeId = await devtools.nodeFor(selector);
    return nodeId ? (await devtools.send('CSS.getPlatformFontsForNode', { nodeId })).fonts : null;
  };

  const selectors = await page.evaluate(p => (window as unknown as Api).__fitlocale.addFontProbes(p), probes);
  const rtlUsed: Array<PlatformFont[] | null> = [];
  // A loaded @font-face is on this machine by definition; other families are checked with a probe.
  const available = new Set(loadedFamilies.map(f => f.toLowerCase()));
  try {
    for (let i = 0; i < rtl.length; i++) rtlUsed.push(await fontsOf(selectors[i]).catch(() => null));
    for (let i = 0; i < families.length; i++) {
      const used = await fontsOf(selectors[rtl.length + i]).catch(() => null);
      // On this machine when its own face draws the probe: a loaded @font-face, or an installed font of that name.
      if (used?.some(f => f.glyphCount > 0 && (f.isCustomFont || f.familyName.toLowerCase() === families[i].toLowerCase()))) {
        available.add(families[i].toLowerCase());
      }
    }
  } finally {
    await page.evaluate(() => (window as unknown as Api).__fitlocale.removeFontProbes());
  }

  const issues: RawIssue[] = [];
  for (let i = 0; i < rtl.length; i++) {
    const sample = rtl[i], used = rtlUsed[i];
    if (!used) continue;
    const declared = parseFontFamily(sample.fontFamily);
    const fallback = fallbackFonts(declared, used, available);
    if (fallback.length === 0) continue;
    try {
      const nodeId = await devtools.nodeFor(sample.key);
      if (!nodeId || !await authorSetsFont(devtools, nodeId)) continue;
    } catch {
      continue;
    }
    issues.push({
      rule: 'rtl/font-fallback', key: sample.key, selector: sample.selector, box: sample.box, text: clip(sample.text),
      used: fallback.join(', '), declared: declared.join(', '),
    });
  }
  return issues;
}
