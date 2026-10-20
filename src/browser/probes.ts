/** One text run to measure fonts on, styled like the element it stands for. */
export interface FontProbe { text: string; fontFamily: string; fontWeight?: string; fontStyle?: string; fontSize?: string; lang?: string }

let host: HTMLElement | null = null;

/**
 * Add hidden, off-screen text runs for DevTools to report fonts on; returns one selector per probe.
 * Always followed by `removeFontProbes()`: the page is left as it was.
 */
export function addFontProbes(probes: FontProbe[]): string[] {
  removeFontProbes();
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;contain:strict;width:1px;height:1px;overflow:hidden';
  const selectors = probes.map((p, i) => {
    const span = document.createElement('span');
    span.setAttribute('data-fitlocale-probe', String(i));
    if (p.lang) span.lang = p.lang;
    span.style.fontFamily = p.fontFamily;
    if (p.fontWeight) span.style.fontWeight = p.fontWeight;
    if (p.fontStyle) span.style.fontStyle = p.fontStyle;
    if (p.fontSize) span.style.fontSize = p.fontSize;
    span.textContent = p.text;
    host!.appendChild(span);
    return `[data-fitlocale-probe="${i}"]`;
  });
  (document.body ?? document.documentElement).appendChild(host);
  // DevTools reports fonts from layout: lay the probes out now, before it asks.
  void host.getBoundingClientRect();
  for (const span of host.children) void (span as HTMLElement).offsetWidth;
  return selectors;
}

export function removeFontProbes(): void {
  host?.remove();
  host = null;
}
