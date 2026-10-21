import { test, expect } from '@playwright/test';
import { elementLabel, shortPath } from '../../src/report/label';
import { makeIssue } from './fixtures';

const PATH = 'body>div:nth-child(3)>button:nth-child(1)';

test('page-level issues are labelled Whole page', () => {
  expect(elementLabel(makeIssue({ selector: 'html', key: 'html' }))).toEqual({ label: 'Whole page', kind: 'page', short: 'html' });
});

test('text comes first, whitespace collapsed', () => {
  expect(elementLabel(makeIssue({ text: '  Save\n changes ', key: PATH, selector: PATH }))).toEqual({ label: 'Save changes', kind: 'text', short: 'div › button' });
});

test('long text is clipped to 80 characters', () => {
  const { label, kind } = elementLabel(makeIssue({ text: 'x'.repeat(100) }));
  expect(kind).toBe('text');
  expect(label).toHaveLength(80);
  expect(label.endsWith('…')).toBe(true);
});

test('without text, the accessible name', () => {
  const r = elementLabel(makeIssue({ text: '', name: 'Close dialog' }));
  expect(r.kind).toBe('name');
  expect(r.label).toBe('Close dialog');
});

test('then the test id, unescaped', () => {
  const selector = '[data-testid="say \\"hi\\""]';
  expect(elementLabel(makeIssue({ text: '', selector }))).toEqual({ label: 'say "hi"', kind: 'test-id', short: selector });
});

test('then a unique id', () => {
  expect(elementLabel(makeIssue({ text: '', selector: '#save' }))).toEqual({ label: '#save', kind: 'id', short: '#save' });
});

test('else the last two steps of the DOM path', () => {
  const p = 'body>div:nth-child(3)>div:nth-child(1)>canvas:nth-child(7)';
  expect(elementLabel(makeIssue({ text: '', key: p, selector: p }))).toEqual({ label: 'div › canvas', kind: 'path', short: 'div › canvas' });
});

test('inside shadow roots and frames only the last part counts', () => {
  expect(shortPath('body>my-app:nth-child(1) >> :scope>div:nth-child(2)>span:nth-child(1)')).toBe('div › span');
  const r = elementLabel(makeIssue({ text: '', selector: 'body>iframe:nth-child(1) >> internal:control=enter-frame >> [data-testid="pay"] >> nth=1' }));
  expect(r.label).toBe('pay');
  expect(r.kind).toBe('test-id');
});
