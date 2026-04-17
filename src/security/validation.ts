/**
 * ISEE v2 — Input Validation and Sanitization
 *
 * Validates and sanitizes query inputs before they enter the pipeline.
 * Controlled by ISEE_INPUT_VALIDATION_ENABLED (default: true).
 */

/** Whether input validation is enabled. Set ISEE_INPUT_VALIDATION_ENABLED=false to disable. */
export function isValidationEnabled(): boolean {
  return process.env.ISEE_INPUT_VALIDATION_ENABLED !== 'false';
}

/** Minimum and maximum allowed query lengths. */
const MIN_LENGTH = 10;
const MAX_LENGTH = 10000;

/**
 * Checks whether text contains XSS patterns.
 *
 * Detects: <script> tags, javascript: URLs, inline event handlers, eval() calls.
 */
export function containsXSSPattern(text: string): boolean {
  const patterns = [
    /<script[\s\S]*?>/i,
    /javascript\s*:/i,
    /\bon\w+\s*=/i,       // onclick=, onload=, onerror=, etc.
    /\beval\s*\(/i,
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Checks whether text contains SQL injection patterns.
 *
 * Detects: UNION SELECT, OR 1=1, DROP TABLE, -- comments, ; followed by SQL keywords.
 */
export function containsSQLInjectionPattern(text: string): boolean {
  const patterns = [
    /\bunion\s+select\b/i,
    /\bor\s+1\s*=\s*1\b/i,
    /\bdrop\s+table\b/i,
    // Note: Removed /--/ pattern as it causes false positives with normal text containing double dashes
    /;\s*(select|insert|update|delete|drop|create|alter|exec)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Sanitizes a query string:
 * - Strips leading/trailing whitespace
 * - Normalizes unicode to NFC
 * - Encodes HTML special characters for output safety
 */
export function sanitizeQuery(query: string): string {
  const trimmed = query.trim();
  const normalized = trimmed.normalize('NFC');
  return normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validates a query string against all rules.
 *
 * When validation is disabled via ISEE_INPUT_VALIDATION_ENABLED=false, always
 * returns valid with the trimmed query.
 *
 * @returns `{ valid: true, sanitized }` on success, or `{ valid: false, error, code, field }` on failure.
 */
export function validateQuery(query: string): {
  valid: boolean;
  error?: string;
  code?: string;
  sanitized?: string;
} {
  if (!isValidationEnabled()) {
    return { valid: true, sanitized: query.trim() };
  }

  if (typeof query !== 'string') {
    return {
      valid: false,
      error: 'Query must be a string',
      code: 'QUERY_TYPE_INVALID',
    };
  }

  // Validate UTF-8 by checking for replacement character sequences that
  // indicate encoding errors (Bun decodes JSON as UTF-8; malformed bytes
  // become U+FFFD replacement characters).
  if (query.includes('\uFFFD')) {
    return {
      valid: false,
      error: 'Query contains invalid UTF-8 characters',
      code: 'QUERY_ENCODING_INVALID',
    };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: `Query must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      code: 'QUERY_LENGTH_INVALID',
    };
  }

  if (trimmed.length < MIN_LENGTH) {
    return {
      valid: false,
      error: `Query must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      code: 'QUERY_LENGTH_INVALID',
    };
  }

  if (trimmed.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Query must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      code: 'QUERY_LENGTH_INVALID',
    };
  }

  if (containsXSSPattern(trimmed)) {
    return {
      valid: false,
      error: 'Query contains disallowed content',
      code: 'QUERY_CONTENT_INVALID',
    };
  }

  if (containsSQLInjectionPattern(trimmed)) {
    return {
      valid: false,
      error: 'Query contains disallowed content',
      code: 'QUERY_CONTENT_INVALID',
    };
  }

  return { valid: true, sanitized: sanitizeQuery(trimmed) };
}
