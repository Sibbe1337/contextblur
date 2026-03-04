/**
 * ContextBlur - Detection Patterns
 * PII + code-secret regex patterns for sensitive data detection.
 * Reuses patterns from the Chrome extension + adds code-specific patterns.
 */

export interface PatternDef {
  /** Unique key matching the config setting name */
  key: string;
  /** Human-readable label */
  label: string;
  /** The detection regex (global flag required) */
  regex: RegExp;
  /** Pattern severity used for risk scoring */
  severity: 'low' | 'high' | 'critical';
  /** Only apply in files matching these globs (optional) */
  fileFilter?: string[];
}

/**
 * All detection patterns.
 * Keys match `contextblur.patterns.<key>` settings.
 */
export const PATTERNS: PatternDef[] = [
  // ── PII patterns (from Chrome extension) ──

  {
    key: 'email',
    label: 'Email Address',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    severity: 'low',
  },
  {
    key: 'phone',
    label: 'Phone Number',
    regex: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    severity: 'low',
  },
  {
    key: 'ssn',
    label: 'Social Security Number',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    severity: 'high',
  },
  {
    key: 'creditCard',
    label: 'Credit Card Number',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    severity: 'high',
  },
  {
    key: 'personnummer',
    label: 'Swedish Personal ID',
    regex: /\b\d{6,8}[-+]?\d{4}\b/g,
    severity: 'high',
  },

  // ── Code-specific patterns ──

  {
    key: 'apiKey',
    label: 'API Key / Token',
    // Matches long alphanumeric tokens typically used as API keys
    // Requires at least 20 chars, mix of upper/lower/digits
    regex: /(?:api[_-]?key|api[_-]?secret|token|secret[_-]?key|access[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi,
    severity: 'critical',
  },
  {
    key: 'awsKey',
    label: 'AWS Access Key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'critical',
  },
  {
    key: 'privateKey',
    label: 'Private Key Block',
    regex: /-----BEGIN\s[\w\s]*PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    key: 'connectionString',
    label: 'Database Connection String',
    regex: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql):\/\/[^\s'"`,)}\]]+/gi,
    severity: 'critical',
  },
  {
    key: 'jwt',
    label: 'JWT Token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    severity: 'critical',
  },
  {
    key: 'envValue',
    label: 'Environment Variable Value',
    // Matches KEY=value lines in .env files — blurs the value part
    regex: /^[A-Z][A-Z0-9_]{2,}=(.+)$/gm,
    severity: 'high',
    fileFilter: ['*.env', '*.env.*', '.env', '.env.*'],
  },
];

/**
 * Get pattern definitions filtered by enabled settings.
 */
export function getEnabledPatterns(enabledMap: Record<string, boolean>): PatternDef[] {
  return PATTERNS.filter((p) => enabledMap[p.key] !== false);
}
