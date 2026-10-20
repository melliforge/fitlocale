import { test, expect } from '@playwright/test';
import { logicalReplacement, pickResponsible, type Declaration } from '../../src/rules/logical';

const d = (name: string, value: string, ruleIndex: number, important = false): Declaration =>
  ({ name, value, important, ruleIndex, selector: `.r${ruleIndex}`, line: ruleIndex + 1, column: 1 });

test('physical properties map to their logical replacements', () => {
  const cases: Array<[string, string, string]> = [
    ['left', '16px', 'inset-inline-start: 16px'],
    ['right', '0', 'inset-inline-end: 0'],
    ['margin-left', '8px', 'margin-inline-start: 8px'],
    ['margin-right', 'auto', 'margin-inline-end: auto'],
    ['padding-left', '4px', 'padding-inline-start: 4px'],
    ['padding-right', '4px', 'padding-inline-end: 4px'],
    ['border-left', '1px solid red', 'border-inline-start: 1px solid red'],
    ['border-right-width', '2px', 'border-inline-end-width: 2px'],
    ['text-align', 'left', 'text-align: start'],
    ['text-align', 'right', 'text-align: end'],
    ['float', 'left', 'float: inline-start'],
    ['clear', 'right', 'clear: inline-end'],
    ['border-top-left-radius', '4px', 'border-start-start-radius: 4px'],
    ['border-top-right-radius', '4px', 'border-start-end-radius: 4px'],
    ['border-bottom-left-radius', '4px', 'border-end-start-radius: 4px'],
    ['border-bottom-right-radius', '4px', 'border-end-end-radius: 4px'],
    ['margin', '0 0 0 16px', 'margin-block: 0 0; margin-inline: 16px 0'],
    ['padding', '1px 2px 3px 4px', 'padding-block: 1px 3px; padding-inline: 4px 2px'],
  ];
  for (const [name, value, expected] of cases) expect(logicalReplacement(name, value), `${name}: ${value}`).toBe(expected);
});

test('nothing physical, nothing to replace', () => {
  expect(logicalReplacement('text-align', 'center')).toBeNull();
  expect(logicalReplacement('margin', '0 8px')).toBeNull();
  expect(logicalReplacement('margin', '1px 2px 3px 2px')).toBeNull();
  expect(logicalReplacement('color', 'red')).toBeNull();
});

test.describe('pickResponsible follows the cascade', () => {
  test('a later rule wins', () => {
    expect(pickResponsible([d('left', '16px', 1), d('left', '20px', 2)], 'absolute')?.value).toBe('20px');
  });

  test('the inline style wins over rules', () => {
    expect(pickResponsible([d('left', '16px', 1), d('left', '20px', 2), d('left', '3px', 99)], 'absolute')?.value).toBe('3px');
  });

  test('an earlier !important wins over a later normal declaration', () => {
    expect(pickResponsible([d('left', '16px', 1, true), d('left', '20px', 2), d('left', '3px', 99)], 'absolute')?.value).toBe('16px');
  });

  test('left does not apply to static elements; an auto margin is picked instead', () => {
    expect(pickResponsible([d('left', '16px', 1), d('margin-left', 'auto', 1)], 'static')?.name).toBe('margin-left');
  });

  test('position before float before margin before text-align', () => {
    const all = [d('text-align', 'left', 1), d('margin-left', 'auto', 1), d('float', 'left', 1), d('right', '0', 1)];
    expect(pickResponsible(all, 'relative')?.name).toBe('right');
    expect(pickResponsible(all, 'static')?.name).toBe('float');
  });

  test('no physical declaration, nothing to point at', () => {
    expect(pickResponsible([d('color', 'red', 1), d('margin', '0 8px', 1)], 'absolute')).toBeNull();
  });
});

test.describe('pickResponsible names only real causes', () => {
  test('a later shorthand overrides an earlier longhand', () => {
    const picked = pickResponsible([d('left', '30px', 1), d('inset', '0 auto auto 100px', 2)], 'absolute');
    expect([picked?.name, picked?.value]).toEqual(['inset', '0 auto auto 100px']);
    expect(pickResponsible([d('margin-left', 'auto', 1), d('margin', '0', 2)], 'static')).toBeNull();
  });

  test('zero margins, fixed margins, padding and borders are not causes', () => {
    expect(pickResponsible([d('margin-left', '0', 1), d('margin-right', '8px', 1)], 'static')).toBeNull();
    expect(pickResponsible([d('padding-left', '24px', 1), d('border-left', '2px solid', 1)], 'static')).toBeNull();
  });

  test('an auto margin pushing the box to one side is a cause', () => {
    expect(pickResponsible([d('margin-left', 'auto', 1)], 'static')?.name).toBe('margin-left');
    expect(pickResponsible([d('margin-left', 'auto', 1), d('margin-right', 'auto', 1)], 'static')).toBeNull();
  });

  test('left and right set to the same value, or auto, are not causes', () => {
    expect(pickResponsible([d('left', '0', 1), d('right', '0', 1)], 'absolute')).toBeNull();
    expect(pickResponsible([d('left', 'auto', 1)], 'absolute')).toBeNull();
    expect(pickResponsible([d('left', '0', 1)], 'absolute')?.value).toBe('0');
  });
});

test('inset shorthands get a logical replacement', () => {
  expect(logicalReplacement('inset', '0 auto auto 100px')).toBe('inset-block: 0 auto; inset-inline: 100px auto');
});
