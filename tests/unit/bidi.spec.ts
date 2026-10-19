import { test, expect } from '@playwright/test';
import { hasRtlLetters, mixedTokens, outOfOrder, visualText } from '../../src/rules/bidi';

const tokens = (text: string) => mixedTokens(text).map(t => t.text);

test('mixed tokens: Latin or digits plus symbols, sentence punctuation trimmed', () => {
  expect(tokens('تعلم C++ اليوم')).toEqual(['C++']);
  expect(tokens('راسلنا john@x.com.')).toEqual(['john@x.com']);
  expect(tokens('مرحبا Ahmed')).toEqual([]);
  expect(tokens('السعر $220')).toEqual(['$220']);
  const [t] = mixedTokens('راسلنا john@x.com.');
  expect('راسلنا john@x.com.'.slice(t.start, t.end)).toBe('john@x.com');
});

test('hasRtlLetters finds Arabic and Hebrew script', () => {
  expect(hasRtlLetters('مرحبا')).toBe(true);
  expect(hasRtlLetters('שלום')).toBe(true);
  expect(hasRtlLetters('Hello 123')).toBe(false);
});

test('outOfOrder: logical neighbours drawn right-to-left on one line', () => {
  expect(outOfOrder([{ x: 10, top: 0 }, { x: 20, top: 0 }, { x: 30, top: 0 }])).toBe(false);
  expect(outOfOrder([{ x: 30, top: 0 }, { x: 10, top: 0 }, { x: 20, top: 0 }])).toBe(true);
  expect(outOfOrder([{ x: 30, top: 0 }, { x: 10, top: 20 }])).toBe(false);
});

test('visualText reads the characters in drawn order', () => {
  expect(visualText('C++', [{ x: 30, top: 0 }, { x: 10, top: 0 }, { x: 20, top: 0 }])).toBe('++C');
});

test('numbers that read correctly right-to-left are not tokens', () => {
  for (const text of ['خصم 50%', 'من 10-20', 'بتاريخ 2026-10-19', 'درجة -5', 'رقم #3']) expect(tokens(text), text).toEqual([]);
  expect(tokens('اتصل على +1 5551234')).toEqual(['+1']);
  expect(tokens('السعر $220 أو €15')).toEqual(['$220', '€15']);
  expect(tokens('لغة C# رائعة')).toEqual(['C#']);
});
