import { inert } from '../comment/render';
import type { FitVerdict } from './predict';

const MAX_LISTED = 30;

/** The Markdown summary of one message file: what won't fit first, then counts, untested keys and font warnings. */
export function renderFitSummary(r: { locale: string; verdicts: FitVerdict[]; fontWarnings: string[]; changed: number }): string {
  const by = (v: FitVerdict['verdict']) => r.verdicts.filter(x => x.verdict === v);
  const notChecked = by('not-checked');
  const over = by('overflows');
  const lines = [`**Will it fit?** ${inert(r.locale, 40)}: checked ${r.verdicts.length - notChecked.length} of ${r.changed} changed keys`, ''];
  if (over.length) {
    lines.push(`${over.length} won't fit:`, '', '| Key | Viewport | Needs | Has | Text |', '|---|---|---|---|---|');
    for (const v of over) {
      lines.push(`| ${inert(v.key, 120)} | ${inert(v.vp ?? '', 20)} | ${v.need ?? ''} px | ${v.room ?? ''} px | ${inert(v.text, 160)}${v.fontMissing ? ' (font missing)' : ''} |`);
    }
    lines.push('');
  }
  lines.push(`Grows (more lines, the layout moves): ${by('grows').length} · English already overflows: ${by('already').length} · Fits: ${by('fits').length} · Not checked: ${notChecked.length}`);
  if (notChecked.length) {
    const shown = notChecked.slice(0, MAX_LISTED).map(v => inert(v.key, 120)).join(', ');
    const more = notChecked.length > MAX_LISTED ? `, …and ${notChecked.length - MAX_LISTED} more` : '';
    lines.push('', `Not on any tested page, so not checked: ${shown}${more}`);
  }
  for (const w of r.fontWarnings) lines.push('', `> Warning: ${inert(w, 300)}`);
  return lines.join('\n') + '\n';
}
