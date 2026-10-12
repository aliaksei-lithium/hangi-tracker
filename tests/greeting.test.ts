import { describe, expect, it } from 'vitest';
import { greeting } from '../src/lib/greeting';

const at = (h: number, m = 0) => new Date(2026, 9, 13, h, m);

describe('greeting', () => {
  it('uses the local time of day', () => {
    expect(greeting('Aliaksei', at(5))).toBe('Good morning, Aliaksei');
    expect(greeting('Aliaksei', at(11, 59))).toBe('Good morning, Aliaksei');
    expect(greeting('Aliaksei', at(12))).toBe('Good afternoon, Aliaksei');
    expect(greeting('Aliaksei', at(17, 59))).toBe('Good afternoon, Aliaksei');
    expect(greeting('Aliaksei', at(18))).toBe('Good evening, Aliaksei');
    expect(greeting('Aliaksei', at(0, 30))).toBe('Good evening, Aliaksei');
    expect(greeting('Aliaksei', at(4, 59))).toBe('Good evening, Aliaksei');
  });
});
