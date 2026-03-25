import { describe, test, expect } from 'bun:test';
import {
  validateQuery,
  sanitizeQuery,
  containsXSSPattern,
  containsSQLInjectionPattern,
} from './validation';

// ---------------------------------------------------------------------------
// containsXSSPattern
// ---------------------------------------------------------------------------

describe('containsXSSPattern', () => {
  test('detects <script> tag', () => {
    expect(containsXSSPattern('<script>alert(1)</script>')).toBe(true);
  });

  test('detects <SCRIPT> tag (case insensitive)', () => {
    expect(containsXSSPattern('<SCRIPT src="x.js">')).toBe(true);
  });

  test('detects javascript: URL', () => {
    expect(containsXSSPattern('javascript:void(0)')).toBe(true);
  });

  test('detects onclick handler', () => {
    expect(containsXSSPattern('<img onclick=alert(1)>')).toBe(true);
  });

  test('detects onload handler', () => {
    expect(containsXSSPattern('<body onload="evil()">')).toBe(true);
  });

  test('detects onerror handler', () => {
    expect(containsXSSPattern('<img src=x onerror=alert(1)>')).toBe(true);
  });

  test('detects eval() call', () => {
    expect(containsXSSPattern('eval(atob("..."))')).toBe(true);
  });

  test('allows normal text', () => {
    expect(containsXSSPattern('What is the best way to scale a startup?')).toBe(false);
  });

  test('allows angle brackets in non-script context', () => {
    expect(containsXSSPattern('Is A < B or B > A?')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// containsSQLInjectionPattern
// ---------------------------------------------------------------------------

describe('containsSQLInjectionPattern', () => {
  test('detects UNION SELECT', () => {
    expect(containsSQLInjectionPattern('1 UNION SELECT * FROM users')).toBe(true);
  });

  test('detects OR 1=1', () => {
    expect(containsSQLInjectionPattern("' OR 1=1 --")).toBe(true);
  });

  test('detects DROP TABLE', () => {
    expect(containsSQLInjectionPattern('DROP TABLE users')).toBe(true);
  });

  test('detects -- comment', () => {
    expect(containsSQLInjectionPattern("admin'--")).toBe(true);
  });

  test('detects ; followed by SELECT', () => {
    expect(containsSQLInjectionPattern('; SELECT * FROM secrets')).toBe(true);
  });

  test('detects ; followed by DROP', () => {
    expect(containsSQLInjectionPattern('; DROP TABLE logs')).toBe(true);
  });

  test('allows normal query text', () => {
    expect(containsSQLInjectionPattern('How should I design my database schema?')).toBe(false);
  });

  test('allows "table" in normal sentence', () => {
    expect(containsSQLInjectionPattern('How do I set up a table of contents?')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeQuery
// ---------------------------------------------------------------------------

describe('sanitizeQuery', () => {
  test('trims whitespace', () => {
    expect(sanitizeQuery('  hello world  ')).toBe('hello world');
  });

  test('normalizes unicode to NFC', () => {
    // Compose é (U+0065 + U+0301) → é (U+00E9)
    const composed = '\u00E9';
    const decomposed = '\u0065\u0301';
    expect(sanitizeQuery(decomposed)).toBe(composed);
  });

  test('encodes & character', () => {
    expect(sanitizeQuery('cats & dogs')).toBe('cats &amp; dogs');
  });

  test('encodes < and >', () => {
    expect(sanitizeQuery('a < b > c')).toBe('a &lt; b &gt; c');
  });

  test('encodes double quotes', () => {
    expect(sanitizeQuery('"hello"')).toBe('&quot;hello&quot;');
  });

  test('encodes single quotes', () => {
    expect(sanitizeQuery("it's fine")).toBe('it&#x27;s fine');
  });
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe('validateQuery', () => {
  test('rejects empty string', () => {
    const result = validateQuery('');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_LENGTH_INVALID');
  });

  test('rejects whitespace-only string', () => {
    const result = validateQuery('   ');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_LENGTH_INVALID');
  });

  test('rejects query shorter than 10 chars', () => {
    const result = validateQuery('too short');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_LENGTH_INVALID');
    expect(result.error).toContain('10');
  });

  test('rejects query longer than 2000 chars', () => {
    const result = validateQuery('a'.repeat(2001));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_LENGTH_INVALID');
    expect(result.error).toContain('2000');
  });

  test('accepts query of exactly 10 chars', () => {
    const result = validateQuery('1234567890');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBeDefined();
  });

  test('accepts query of exactly 2000 chars', () => {
    const result = validateQuery('a'.repeat(2000));
    expect(result.valid).toBe(true);
  });

  test('rejects query with <script> tag', () => {
    const result = validateQuery('How do I use <script>alert(1)</script> in HTML?');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_CONTENT_INVALID');
  });

  test('rejects query with SQL injection', () => {
    const result = validateQuery("What happens with ' OR 1=1 -- in a login form?");
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_CONTENT_INVALID');
  });

  test('rejects query with replacement characters (invalid UTF-8)', () => {
    const result = validateQuery('What is the best way\uFFFD to scale?');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('QUERY_ENCODING_INVALID');
  });

  test('accepts a valid query and returns sanitized version', () => {
    const result = validateQuery('  What is the best strategy for scaling a B2B SaaS startup?  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('What is the best strategy for scaling a B2B SaaS startup?');
  });

  test('strips leading/trailing whitespace from sanitized output', () => {
    const result = validateQuery('  How should I prioritize features?  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized!.startsWith(' ')).toBe(false);
    expect(result.sanitized!.endsWith(' ')).toBe(false);
  });

  test('bypasses all checks when validation disabled', () => {
    const original = process.env.ISEE_INPUT_VALIDATION_ENABLED;
    process.env.ISEE_INPUT_VALIDATION_ENABLED = 'false';
    try {
      const result = validateQuery('<script>');
      expect(result.valid).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env.ISEE_INPUT_VALIDATION_ENABLED;
      } else {
        process.env.ISEE_INPUT_VALIDATION_ENABLED = original;
      }
    }
  });
});
