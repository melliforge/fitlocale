import { test, expect } from '@playwright/test';
import { findLeaksInText } from '../../src/rules/leaks';

const r = (t: string, k?: string[]) => findLeaksInText(t, k && new Set(k)).map(m => `${m.rule}:${m.match}`);

test('raw keys', () => {
  expect(r('dashboard.welcome.title')).toEqual(['leak/raw-key:dashboard.welcome.title']);
  expect(r('nav.home', ['nav.home'])).toEqual(['leak/raw-key:nav.home']);
  expect(r('nav.home')).toEqual([]);
  expect(r('www.example.com')).toEqual([]);
  expect(r('report.final.pdf')).toEqual([]);
  expect(r('Version 1.2.3')).toEqual([]);
  for (const t of ['workspace.notion.so', 'api.acme.ai', 'docker-compose.override.yml', 'image.min.webp', 'next.config.mjs']) {
    expect(r(t), t).toEqual([]);
  }
});

// Every two-letter ending is a country's domain (m.webtoo.ls is a Mastodon server shown on every Elk page).
test('host names with a country domain are not raw keys', () => {
  for (const t of ['m.webtoo.ls', 'social.example.fm', 'cdn.assets.ws']) expect(r(t), t).toEqual([]);
  expect(r('settings.lang.en', ['settings.lang.en'])).toEqual(['leak/raw-key:settings.lang.en']);
});

// With the source messages known, a key the messages lack still leaks from a namespace they have.
test('with source messages, only tokens in their namespaces are raw keys', () => {
  const keys = ['settings.title', 'nav.home'];
  expect(r('settings.profile.missing', keys)).toEqual(['leak/raw-key:settings.profile.missing']);
  expect(r('status.example.social', keys)).toEqual([]);
});

test('placeholders', () => {
  expect(r('You have {count} messages')).toEqual(['leak/placeholder:{count}']);
  expect(r('Hi {{ name }}')).toEqual(['leak/placeholder:{{ name }}']);
  expect(r('Saved %s and %1$d')).toEqual(['leak/placeholder:%s', 'leak/placeholder:%1$d']);
  expect(r('Total: ${amount}')).toEqual(['leak/placeholder:${amount}']);
  expect(r('Use { and } carefully')).toEqual([]);
  expect(r('100% sure')).toEqual([]);
});

test('bad values', () => {
  expect(r('Price: undefined')).toEqual(['leak/bad-value:undefined']);
  expect(r('NaN items')).toEqual(['leak/bad-value:NaN']);
  expect(r('[object Object]')).toEqual(['leak/bad-value:[object Object]']);
  expect(r('null')).toEqual(['leak/bad-value:null']);
  expect(r('null and void')).toEqual([]);
  expect(r('Undefined behaviour')).toEqual([]);
});
