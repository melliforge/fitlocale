import { test, expect } from '@playwright/test';
import { browserProjects } from '../browsers';

test('Chromium alone keeps the project names', () => {
  expect(browserProjects(undefined).map(p => p.name)).toEqual(['unit', 'browser', 'examples', 'demo']);
});

test('each extra browser gets its own browser, examples and demo projects', () => {
  const projects = browserProjects('chromium,webkit');
  expect(projects.map(p => p.name)).toEqual(['unit', 'browser', 'examples', 'demo', 'browser-webkit', 'examples-webkit', 'demo-webkit']);
  const browser = projects.find(p => p.name === 'browser')!, webkit = projects.find(p => p.name === 'browser-webkit')!;
  expect(webkit.use).toEqual({ ...browser.use, browserName: 'webkit' });
  expect(webkit.testDir).toBe(browser.testDir);
  expect(projects.find(p => p.name === 'demo-webkit')!.use).toMatchObject({ baseURL: 'http://localhost:4310', browserName: 'webkit' });
});

test('an unknown browser name is refused', () => {
  expect(() => browserProjects('chromium,edge')).toThrow(/edge.*chromium, firefox, webkit/);
});
