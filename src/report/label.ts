import type { Issue } from '../types';

export interface ElementLabel {
  label: string;
  kind: 'page' | 'text' | 'name' | 'test-id' | 'id' | 'path';
  short: string;
}

const MAX_LABEL = 80;
const TEST_ID = /^\[[^=\]]+="((?:[^"\\]|\\.)*)"\]$/;

function clip(s: string): string {
  return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s;
}

function collapse(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function lastPart(selector: string): string {
  const parts = selector.split(' >> ');
  if (parts.length > 1 && /^nth=\d+$/.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1];
}

/** The last two DOM steps of a key, e.g. `div › button`. */
export function shortPath(key: string): string {
  const parts = key.split(' >> ');
  const last = parts[parts.length - 1].replace(/^:scope/, '');
  const steps = last.split('>').map((s) => s.replace(/:nth-child\(\d+\)/g, '').trim()).filter(Boolean);
  return steps.slice(-2).join(' › ');
}

export function elementLabel(issue: Pick<Issue, 'key' | 'selector' | 'text' | 'name'>): ElementLabel {
  if (issue.key === 'html' || issue.selector === 'html') return { label: 'Whole page', kind: 'page', short: 'html' };
  const path = shortPath(issue.key);
  const text = collapse(issue.text);
  if (text) return { label: clip(text), kind: 'text', short: path };
  const name = collapse(issue.name);
  if (name) return { label: clip(name), kind: 'name', short: path };
  const last = lastPart(issue.selector);
  const testId = TEST_ID.exec(last);
  if (testId) return { label: testId[1].replace(/\\(.)/g, '$1'), kind: 'test-id', short: last };
  if (last.startsWith('#') && !/[\s>]/.test(last)) return { label: last, kind: 'id', short: last };
  return { label: path, kind: 'path', short: path };
}
