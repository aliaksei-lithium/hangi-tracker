import { describe, expect, it } from 'vitest';
import { constantTimeEqual, hashPassword, signSession, verifySession } from '../worker/crypto';

describe('hashPassword', () => {
  // Expected values come from scripts/add_user.py, so the script and the Worker agree.
  it('matches the Python script with the default 100 000 iterations', async () => {
    expect(await hashPassword('correct horse', '00112233445566778899aabbccddeeff')).toBe(
      '349385d8369097aac69c91b9cf79c08cc236bd0eea62faca19643b117ca1f56e',
    );
  });

  it('handles non-ASCII passwords like the Python script', async () => {
    expect(await hashPassword('pässwörd', 'ffeeddccbbaa99887766554433221100', 1000)).toBe(
      'bc1861868899ba5cecb0bbdb2f9d453ebaf37712d8c6498b0818ed66a13ecf5c',
    );
  });
});

describe('constantTimeEqual', () => {
  it('compares strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('session token', () => {
  const secret = 'test-secret';

  it('round-trips a valid token', async () => {
    const token = await signSession(7, 2000, secret);
    expect(await verifySession(token, secret, 1000)).toBe(7);
  });

  it('rejects an expired token', async () => {
    const token = await signSession(7, 2000, secret);
    expect(await verifySession(token, secret, 2000)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession(7, 2000, 'other');
    expect(await verifySession(token, secret, 1000)).toBeNull();
  });

  it('rejects a token with a changed user id', async () => {
    const [, exp, sig] = (await signSession(7, 2000, secret)).split('.');
    expect(await verifySession(`8.${exp}.${sig}`, secret, 1000)).toBeNull();
  });

  it('rejects garbage', async () => {
    for (const t of ['', 'a.b.c', '1.2', '1.2.!!!', '1.2.3.4']) {
      expect(await verifySession(t, secret, 0)).toBeNull();
    }
  });
});
