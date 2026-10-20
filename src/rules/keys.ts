const SHADOW = ' >> :scope';
const FRAME = ' >> internal:control=enter-frame >> body';

/** The key of an element's parent in the composed tree: a shadow root's top element has its host, a frame's body its <iframe>. */
export function parentKey(key: string): string | null {
  for (const boundary of [FRAME, SHADOW]) {
    if (key.endsWith(boundary)) return key.slice(0, -boundary.length);
  }
  const step = key.lastIndexOf('>');
  if (step <= 0) return null;
  const parent = key.slice(0, step);
  // The top of a shadow root or frame: its parent is the host or the <iframe>.
  for (const boundary of [FRAME, SHADOW]) {
    if (parent.endsWith(boundary)) return parent.slice(0, -boundary.length);
  }
  return parent;
}
