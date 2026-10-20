// Pure and dependency-free: this module is also bundled into the in-page script.

export interface CharBox { x: number; top: number }

const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
/** Sentence punctuation around a token belongs to the sentence, not to the value. */
const SENTENCE_PUNCTUATION = '.,;:!?…،؛؟"\'()';

export const hasRtlLetters = (text: string) => RTL_LETTER.test(text);

/** Whitespace-separated values mixing Latin letters, a phone prefix or a currency sign with symbols (C++, +1, $220, v2.0), without RTL letters. */
export function mixedTokens(text: string): Array<{ start: number; end: number; text: string }> {
  const tokens: Array<{ start: number; end: number; text: string }> = [];
  for (const m of text.matchAll(/\S+/g)) {
    let start = m.index!, end = start + m[0].length;
    while (start < end && SENTENCE_PUNCTUATION.includes(text[start])) start++;
    while (end > start && SENTENCE_PUNCTUATION.includes(text[end - 1])) end--;
    const token = text.slice(start, end);
    // Western digits with %, -, # or dates read correctly right-to-left in Arabic text: only Latin text,
    // phone prefixes (+1) and currency amounts ($220) are values whose order matters.
    const value = /[A-Za-z]/.test(token) || /^\+\d/.test(token) || /[$€£¥₹]/.test(token);
    // Emoji are drawn as pictures, not letters: their place says nothing about text direction.
    if (value && /[^A-Za-z0-9]/.test(token) && !RTL_LETTER.test(token) && !/\p{Extended_Pictographic}/u.test(token)) tokens.push({ start, end, text: token });
  }
  return tokens;
}

const sameLine = (a: CharBox, b: CharBox) => Math.abs(a.top - b.top) < 2;

/** Are two logically adjacent characters on one line drawn right-to-left (more than 1px)? */
export function outOfOrder(chars: CharBox[]): boolean {
  return chars.some((c, i) => i > 0 && sameLine(c, chars[i - 1]) && c.x < chars[i - 1].x - 1);
}

/** The characters in the order they are drawn: by line, then left to right. */
export function visualText(text: string, chars: CharBox[]): string {
  return chars
    .map((c, i) => ({ c, ch: text[i] }))
    .sort((a, b) => (sameLine(a.c, b.c) ? a.c.x - b.c.x : a.c.top - b.c.top))
    .map(e => e.ch)
    .join('');
}
