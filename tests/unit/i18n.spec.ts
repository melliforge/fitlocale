import { test, expect } from '@playwright/test';
import { findConcatenated, findHardcoded, markedMask, sameLanguage, topLevelFragments } from '../../src/rules/i18n';
import type { InlineControl, TextBlock } from '../../src/types';

const BOX = { x: 0, y: 0, width: 100, height: 20 };

/** A control over the first occurrence of `sub` in `text`. */
function control(text: string, sub: string, selector: string, lang = 'en-XA'): InlineControl {
  const start = text.indexOf(sub);
  if (start === -1) throw new Error(`"${sub}" not in "${text}"`);
  return { start, end: start + sub.length, key: `body>${selector}`, selector, box: BOX, lang };
}

function block(text: string, controls: InlineControl[] = [], lang = 'en-XA'): TextBlock {
  return { key: 'body>p:nth-child(1)', selector: '#p', box: BOX, text, lang, controls };
}

const PSEUDO = { pageLocale: 'en-XA', sourceLocale: 'en' };
const hardcoded = (b: TextBlock) => findHardcoded([b], PSEUDO);

test.describe('markers', () => {
  test('markedMask marks marker pairs and their content', () => {
    expect(markedMask('a⟦bc⟧d')).toEqual([false, true, true, true, true, false]);
    expect(markedMask('⟦a⟦b⟧c⟧').every(Boolean)).toBe(true);
    expect(markedMask('⟦ab').every(Boolean)).toBe(true);
  });

  test('topLevelFragments counts only outermost pairs', () => {
    expect(topLevelFragments('⟦a ~⟧ 3 ⟦b ⟦c⟧ ~⟧')).toHaveLength(2);
  });
});

test.describe('hardcoded', () => {
  test('flags text without markers', () => {
    const issues = hardcoded(block('Free shipping on all orders'));
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('i18n/hardcoded');
    expect(issues[0].selector).toBe('#p');
    expect(issues[0].text).toBe('Free shipping on all orders');
  });

  test('marked text is not hardcoded', () => {
    expect(hardcoded(block('⟦Fréé šhíppíñg ~~⟧'))).toEqual([]);
  });

  for (const text of ['October 19, 2026', 'Mon, Oct 19', '10:30 PM', 'support@fitshop.example', 'www.example.com', '42 €', 'x']) {
    test(`dates, emails, URLs, numbers and single letters are not hardcoded: ${text}`, () => {
      expect(hardcoded(block(text))).toEqual([]);
    });
  }

  test('text explicitly in another language, and native language names, are not hardcoded', () => {
    expect(hardcoded(block('Deutsch', [], 'de'))).toEqual([]);
    expect(hardcoded(block('Deutsch'))).toEqual([]);
    const text = '⟦Pick ~⟧ Português (Brasil)';
    expect(hardcoded(block(text, [control(text, 'Português (Brasil)', '#pt', 'pt-BR')]))).toEqual([]);
  });

  test('leaks are left to the leak rules', () => {
    expect(hardcoded(block('dashboard.welcome.title'))).toEqual([]);
  });

  test('a link inside a translated sentence is not hardcoded', () => {
    const text = '⟦Read the help center first ~⟧';
    expect(hardcoded(block(text, [control(text, 'help center', '#help')]))).toEqual([]);
  });

  test('an unmarked link next to a marked one is reported on the link', () => {
    const text = '⟦Terms ~⟧ · Privacy';
    const issues = hardcoded(block(text, [control(text, '⟦Terms ~⟧', '#terms'), control(text, 'Privacy', '#privacy')]));
    expect(issues.map(i => i.selector)).toEqual(['#privacy']);
  });
});

test.describe('concatenated', () => {
  const concatenated = (b: TextBlock) => findConcatenated([b], { pageLocale: 'en-XA' });

  test('flags a sentence made of two messages', () => {
    const issues = concatenated(block('⟦You saved ~⟧ ⟦on this order ~~⟧'));
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('i18n/concatenated');
  });

  test('one message with a nested message is one fragment', () => {
    expect(concatenated(block('⟦Hello ⟦World ~⟧ ~~⟧'))).toEqual([]);
  });

  test('a list of links is not a sentence', () => {
    const text = '⟦Terms ~⟧ · ⟦Privacy ~⟧';
    expect(concatenated(block(text, [control(text, '⟦Terms ~⟧', '#t'), control(text, '⟦Privacy ~⟧', '#p2')]))).toEqual([]);
  });

  test('a block explicitly in another language is skipped', () => {
    expect(concatenated(block('⟦You saved ~⟧ ⟦on this order ~~⟧', [], 'de'))).toEqual([]);
  });
});

test('sameLanguage compares primary language subtags', () => {
  expect(sameLanguage('en-GB', 'en-US')).toBe(true);
  expect(sameLanguage('en', 'de')).toBe(false);
  expect(sameLanguage('EN', 'en-xa')).toBe(true);
});
