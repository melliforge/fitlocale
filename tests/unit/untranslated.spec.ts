import { test, expect } from '@playwright/test';
import { findUntranslated, sourceMatcher } from '../../src/rules/untranslated';
import type { TextBlock } from '../../src/types';

const BOX = { x: 0, y: 0, width: 100, height: 20 };
const values = [
  'Billing details', 'You have {count} messages', 'Read the <a href="#">help center</a> first', 'OK', 'Total',
  '{n, plural, one {# item} other {# items}}',
];

function block(text: string, lang = 'de', control?: string): TextBlock {
  const start = control ? text.indexOf(control) : -1;
  return {
    key: 'body>p:nth-child(1)', selector: '#p', box: BOX, text, lang,
    controls: control ? [{ start, end: start + control.length, key: 'body>p>a', selector: '#link', box: BOX, lang }] : [],
  };
}

const DE = { pageLocale: 'de', sourceLocale: 'en' };

test.describe('sourceMatcher', () => {
  const match = sourceMatcher(values);

  test('matches source strings, with placeholders filled and HTML stripped', () => {
    expect(match('Billing details')).toBe(true);
    expect(match('You have 3 messages')).toBe(true);
    expect(match('Read the help center first')).toBe(true);
  });

  test('ignores one-word strings, other case and longer text', () => {
    expect(match('OK')).toBe(false);
    expect(match('Total')).toBe(false);
    expect(match('billing details')).toBe(false);
    expect(match('Billing details extra')).toBe(false);
  });
});

test.describe('findUntranslated', () => {
  const match = sourceMatcher(values);

  test('reports a block identical to a source string', () => {
    const issues = findUntranslated([block('Billing details')], match, DE);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('i18n/untranslated');
    expect(issues[0].selector).toBe('#p');
  });

  test('text explicitly marked as the source language is skipped', () => {
    expect(findUntranslated([block('Billing details', 'en')], match, DE)).toEqual([]);
  });

  test('a regional variant of the source language is not checked', () => {
    expect(findUntranslated([block('Billing details', 'en-GB')], match, { pageLocale: 'en-GB', sourceLocale: 'en-US' })).toEqual([]);
  });

  test('a link left in the source language is reported on the link', () => {
    const issues = findUntranslated([block('Rechnung: Billing details', 'de', 'Billing details')], match, DE);
    expect(issues.map(i => i.selector)).toEqual(['#link']);
  });

  test('large message files stay fast', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `Label number ${i} text`);
    for (let i = 0; i < 500; i++) many.push(`Item {x} costs ${i} coins`);
    const blocks = Array.from({ length: 1000 }, (_, i) => block(i % 10 ? `Seite ${i} mit Inhalt` : `Label number ${i} text`));
    const t0 = performance.now();
    const issues = findUntranslated(blocks, sourceMatcher(many), DE);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(issues).toHaveLength(100);
  });
});
