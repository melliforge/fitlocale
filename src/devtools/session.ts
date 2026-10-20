import type { CDPSession, Page } from '@playwright/test';

export interface SheetHeader { sourceURL: string; startLine: number; startColumn: number; sourceMapURL?: string }

/** A Chromium DevTools session with the DOM and CSS domains on, and elements found by their fitlocale key. */
export interface Devtools {
  send: CDPSession['send'];
  sheets: Map<string, SheetHeader>;
  /** The DevTools node of the element with this key (a DOM path selector), or null when it is gone or inside a shadow root or frame. */
  nodeFor(key: string): Promise<number | null>;
  close(): Promise<void>;
}

/** Null when DevTools are not available: another browser, or a page that closed. */
export async function openDevtools(page: Page): Promise<Devtools | null> {
  let cdp: CDPSession;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    return null;
  }
  const sheets = new Map<string, SheetHeader>();
  cdp.on('CSS.styleSheetAdded', ({ header }) => {
    sheets.set(header.styleSheetId, {
      sourceURL: header.sourceURL, startLine: header.startLine, startColumn: header.startColumn, sourceMapURL: header.sourceMapURL || undefined,
    });
  });
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
  } catch {
    await cdp.detach().catch(() => {});
    return null;
  }
  let root: number | null = null;
  return {
    send: cdp.send.bind(cdp) as CDPSession['send'],
    sheets,
    async nodeFor(key) {
      // Inside a shadow root or frame (a Playwright selector chain): DOM.querySelector cannot reach it.
      if (key.includes(' >> ')) return null;
      root ??= (await cdp.send('DOM.getDocument', { depth: 0 })).root.nodeId;
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root, selector: key });
      return nodeId || null;
    },
    async close() {
      await cdp.detach().catch(() => {});
    },
  };
}
