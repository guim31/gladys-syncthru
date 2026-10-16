// -----------------------------------------------------------------------------
// The SyncThru "JSON" is not JSON.
//
// `home.json` is a JavaScript object literal written by the printer's embedded
// web server: unquoted keys (`status: {`), raw line breaks inside strings (a
// C480FW answers `status1: "   Warming Up\n Please Wait..."` with real
// newlines), trailing commas, stray spaces before colons. JSON.parse refuses
// every one of them; pysyncthru goes through demjson3 and still has to escape
// the line breaks by hand. This is a small recursive-descent reader for that
// dialect: objects, arrays, single- or double-quoted strings, numbers,
// true/false/null, comments. It evaluates nothing.
// -----------------------------------------------------------------------------

const MAX_DEPTH = 32;

/**
 * Parse a SyncThru payload.
 * @param {string} text
 * @returns {unknown}
 * @throws {SyntaxError} when the text is not an object literal of that dialect
 */
export function parseSyncThruPayload(text) {
  if (typeof text !== 'string') {
    throw new SyntaxError('SyncThru payload: not a text');
  }
  const reader = new Reader(text);
  reader.skip();
  const value = reader.value(0);
  reader.skip();
  // Some firmwares end the file with a semicolon.
  if (reader.peek() === ';') {
    reader.pos += 1;
    reader.skip();
  }
  if (!reader.done()) {
    reader.fail('unexpected text after the value');
  }
  return value;
}

class Reader {
  constructor(text) {
    // A UTF-8 byte order mark is not part of the value.
    this.text = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    this.pos = 0;
  }

  done() {
    return this.pos >= this.text.length;
  }

  peek() {
    return this.text[this.pos];
  }

  fail(message) {
    throw new SyntaxError(`SyncThru payload: ${message} at offset ${this.pos}`);
  }

  /** Skip blanks and comments. */
  skip() {
    for (;;) {
      const char = this.peek();
      if (char === undefined) {
        return;
      }
      if (/\s/.test(char)) {
        this.pos += 1;
      } else if (this.text.startsWith('//', this.pos)) {
        const end = this.text.indexOf('\n', this.pos);
        this.pos = end === -1 ? this.text.length : end + 1;
      } else if (this.text.startsWith('/*', this.pos)) {
        const end = this.text.indexOf('*/', this.pos + 2);
        if (end === -1) {
          this.fail('unterminated comment');
        }
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  value(depth) {
    if (depth > MAX_DEPTH) {
      this.fail('too deeply nested');
    }
    const char = this.peek();
    if (char === '{') {
      return this.object(depth);
    }
    if (char === '[') {
      return this.array(depth);
    }
    if (char === '"' || char === "'") {
      return this.string();
    }
    if (char !== undefined && /[-+.\d]/.test(char)) {
      return this.number();
    }
    const word = this.word();
    if (word === 'true') {
      return true;
    }
    if (word === 'false') {
      return false;
    }
    if (word === 'null' || word === 'undefined') {
      return null;
    }
    return this.fail(word ? `unexpected word "${word.slice(0, 20)}"` : 'unexpected character');
  }

  word() {
    const match = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.pos, this.pos + 256));
    if (!match) {
      return '';
    }
    this.pos += match[0].length;
    return match[0];
  }

  object(depth) {
    const result = {};
    this.pos += 1;
    for (;;) {
      this.skip();
      if (this.peek() === '}') {
        this.pos += 1;
        return result;
      }
      let key;
      const char = this.peek();
      if (char === '"' || char === "'") {
        key = this.string();
      } else if (char !== undefined && /\d/.test(char)) {
        key = String(this.number());
      } else {
        key = this.word();
      }
      if (!key) {
        this.fail('expected a key');
      }
      this.skip();
      if (this.peek() !== ':') {
        this.fail(`expected ":" after "${key.slice(0, 20)}"`);
      }
      this.pos += 1;
      this.skip();
      const value = this.value(depth + 1);
      // Never let the payload reach a prototype.
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        result[key] = value;
      }
      this.skip();
      if (this.peek() === ',') {
        this.pos += 1;
      } else if (this.peek() !== '}') {
        this.fail('expected "," or "}"');
      }
    }
  }

  array(depth) {
    const result = [];
    this.pos += 1;
    for (;;) {
      this.skip();
      if (this.peek() === ']') {
        this.pos += 1;
        return result;
      }
      result.push(this.value(depth + 1));
      this.skip();
      if (this.peek() === ',') {
        this.pos += 1;
      } else if (this.peek() !== ']') {
        this.fail('expected "," or "]"');
      }
    }
  }

  string() {
    const quote = this.peek();
    this.pos += 1;
    let out = '';
    for (;;) {
      const char = this.peek();
      if (char === undefined) {
        this.fail('unterminated string');
      }
      this.pos += 1;
      if (char === quote) {
        return out;
      }
      if (char !== '\\') {
        // Raw line breaks are kept: the SyncThru dialect allows them.
        out += char;
        continue;
      }
      const escaped = this.peek();
      this.pos += 1;
      switch (escaped) {
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'u':
        case 'x': {
          const length = escaped === 'u' ? 4 : 2;
          const hex = this.text.slice(this.pos, this.pos + length);
          if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) {
            this.fail('bad escape');
          }
          out += String.fromCharCode(parseInt(hex, 16));
          this.pos += length;
          break;
        }
        case undefined:
          this.fail('unterminated string');
          break;
        default:
          // \" \' \\ \/ and an escaped line break (a continuation).
          out += escaped === '\n' || escaped === '\r' ? '' : escaped;
      }
    }
  }

  number() {
    const match = /^[-+]?(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/.exec(
      this.text.slice(this.pos, this.pos + 64),
    );
    if (!match) {
      this.fail('bad number');
    }
    this.pos += match[0].length;
    const raw = match[0];
    const sign = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[-+]/, '');
    const value = /^0x/i.test(body) ? parseInt(body, 16) : Number(body);
    return sign * value;
  }
}
