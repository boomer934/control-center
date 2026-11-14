import { describe, expect, it } from 'vitest';
import { findSecrets, redactSecrets } from './redact';

// Fake secrets are assembled at run time, so no secret-shaped literal lives in the repository
// (gitleaks scans it). None of them is a real credential.
const j = (...parts: string[]) => parts.join('');
const FAKE = {
  anthropic: j('sk-', 'ant-', 'api03-', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'),
  openai: j('sk-', 'proj-', 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2'),
  github: j('gh', 'p_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'),
  aws: j('AK', 'IA', 'QWERTYUIOPASDFGH'),
  jwt: j(
    'eyJ',
    'hbGciOiJIUzI1NiJ9',
    '.',
    'eyJ',
    'zdWIiOiIxMjM0NTY3ODkwIn0',
    '.',
    'SflKxwRJSMeKKF2QT4fwpM',
  ),
  privateKey: j('-----BEGIN ', 'PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END ', 'PRIVATE KEY-----'),
};

describe('redactSecrets', () => {
  it.each(Object.entries(FAKE))('redacts a %s', (_label, secret) => {
    const out = redactSecrets(`before ${secret} after`);
    expect(out).not.toContain(secret);
    expect(out).toMatch(/^before <redacted:[a-z-]+> after$/);
  });

  it('keeps the key name of an assignment and of a bearer header', () => {
    expect(redactSecrets(`API_KEY=${j('abcd', 'efgh', '1234')}`)).toBe(
      'API_KEY=<redacted:assignment>',
    );
    expect(redactSecrets(`"password": "${j('hunter2', 'hunter2')}"`)).toBe(
      '"password": "<redacted:assignment>"',
    );
    expect(redactSecrets(`Authorization: Bearer ${j('abcdef', 'ghijkl', 'mnopqr')}`)).toBe(
      'Authorization: Bearer <redacted:bearer>',
    );
  });

  it('redacts credentials inside a URL', () => {
    expect(redactSecrets(`postgres://admin:${j('s3cr', 'etpw')}@db.local/app`)).toBe(
      'postgres://admin:<redacted:url-credentials>@db.local/app',
    );
  });

  it('leaves ordinary text, ids and token counts alone', () => {
    const text =
      'input_tokens: 51620, toolu_01YMBxTJDNn3qo25HDxuruTq, max_tokens=4096, author: Ada';
    expect(redactSecrets(text)).toBe(text);
  });

  it('is idempotent', () => {
    const once = redactSecrets(`token=${j('abcdef', '123456')} ${FAKE.anthropic}`);
    expect(redactSecrets(once)).toBe(once);
    expect(findSecrets(once)).toEqual([]);
  });

  it('finds secrets without changing the text', () => {
    expect(findSecrets(`x ${FAKE.github} y`).map((f) => f.label)).toContain('github-token');
  });
});
