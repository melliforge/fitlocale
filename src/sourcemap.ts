/** Just enough of the Source Map v3 format to map a CSS declaration back to its source file. */
export interface SourceMap { version: 3; sources: string[]; mappings: string; sourceRoot?: string }

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function parseSourceMap(text: string): SourceMap | null {
  try {
    const map = JSON.parse(text) as Partial<SourceMap>;
    if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== 'string') return null;
    return map as SourceMap;
  } catch {
    return null;
  }
}

/** Decode one segment's base64 VLQ fields. Throws on a character outside the alphabet. */
function decodeSegment(segment: string): number[] {
  const values: number[] = [];
  let value = 0, shift = 0;
  for (const ch of segment) {
    const digit = BASE64.indexOf(ch);
    if (digit === -1) throw new Error(`bad VLQ character ${ch}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/** The source position of a generated position (both 1-based), or null when unmapped or the map is malformed. */
export function originalPosition(map: SourceMap, line: number, column: number): { source: string; line: number; column: number } | null {
  try {
    const lines = map.mappings.split(';');
    let source = 0, srcLine = 0, srcCol = 0;
    let best: { source: number; line: number; column: number } | null = null;
    for (let l = 0; l < lines.length && l < line; l++) {
      let genCol = 0;
      for (const segment of lines[l].split(',')) {
        if (segment === '') continue;
        const f = decodeSegment(segment);
        genCol += f[0];
        if (f.length < 4) continue;
        source += f[1]; srcLine += f[2]; srcCol += f[3];
        if (l === line - 1 && genCol <= column - 1) best = { source, line: srcLine, column: srcCol };
      }
    }
    if (!best || !map.sources[best.source]) return null;
    // The raw entry of `sources`; resolveSource() turns it into a path a reader can open.
    return { source: map.sources[best.source], line: best.line + 1, column: best.column + 1 };
  } catch {
    return null;
  }
}

/**
 * A readable path for a source-map `sources` entry: bundler prefixes dropped (`webpack://app/./src/x.scss` → src/x.scss),
 * `sourceRoot` applied, and relative paths resolved against the map, then shown relative to its site.
 */
export function resolveSource(source: string, mapUrl: string, sourceRoot?: string): string {
  const bundler = /^webpack:\/\/[^/]*\/(?:\.\/)?(.*)$/.exec(source);
  if (bundler) return bundler[1];
  if (/^[a-z][a-z\d+.-]*:/i.test(source)) return source; // already a URL
  const joined = sourceRoot ? sourceRoot.replace(/\/?$/, '/') + source : source;
  let base: URL;
  try {
    base = new URL(mapUrl);
  } catch {
    return joined.replace(/^\.\//, '');
  }
  if (base.protocol === 'data:') return joined.replace(/^\.\//, '');
  const resolved = new URL(joined, base);
  return resolved.origin === base.origin ? resolved.pathname.replace(/^\//, '') : resolved.href;
}
