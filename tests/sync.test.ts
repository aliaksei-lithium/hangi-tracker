import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, generatePlan } from '../src/lib/domain/plan';
import type { SyncMeta } from '../src/lib/store/db';
import { toDoc, type DocContent } from '../src/lib/store/doc';

// The server is mocked; Sync only talks to it through these two functions.
const server = { rev: 0, doc: null as unknown };
vi.mock('../src/lib/api', async (orig) => ({
  ...(await orig<typeof import('../src/lib/api')>()),
  getData: vi.fn(async () => ({ rev: server.rev, doc: server.doc, updatedAt: null })),
  putData: vi.fn(async (baseRev: number, doc: unknown) => {
    if (baseRev !== server.rev) return { ok: false, rev: server.rev };
    server.rev += 1;
    server.doc = doc;
    return { ok: true, rev: server.rev };
  }),
}));

// Sync listens for "online"; tests run without a browser.
(globalThis as unknown as { window: unknown }).window = { addEventListener() {}, removeEventListener() {} };
const { Sync } = await import('../src/lib/store/sync');

const settings = defaultSettings();
const content = (planId: string): DocContent => ({ ...generatePlan(settings, '2026-10-13', planId), settings, hangSessions: [] });

class FakeStore {
  meta: SyncMeta = { rev: 0, dirty: false, syncedAt: null };
  data: DocContent | null = null;
  onChange = () => {};
  async getMeta() {
    return this.meta;
  }
  async setMeta(m: SyncMeta) {
    this.meta = m;
  }
  async snapshot() {
    if (!this.data) throw new Error('empty');
    return this.data;
  }
  async replaceAll(c: DocContent, fromServer: { rev: number } | null) {
    this.data = c;
    this.meta = fromServer ? { rev: fromServer.rev, dirty: false, syncedAt: 'now' } : { ...this.meta, dirty: true };
  }
}

function setup(store: FakeStore) {
  const events = { status: vi.fn(), replaced: vi.fn(), unauthorized: vi.fn() };
  const sync = new Sync(store as never, events);
  const last = () => events.status.mock.calls.at(-1)?.[0];
  return { sync, events, last };
}

beforeEach(() => {
  server.rev = 0;
  server.doc = null;
});

describe('Sync', () => {
  it('a new device takes the server data on pull', async () => {
    server.rev = 3;
    server.doc = toDoc(content('server'));
    const store = new FakeStore();
    const { sync, events } = setup(store);
    await sync.pull();
    expect(store.data?.plan.id).toBe('server');
    expect(store.meta).toMatchObject({ rev: 3, dirty: false });
    expect(events.replaced).toHaveBeenCalled();
  });

  it('pushes local data when the server has none', async () => {
    const store = new FakeStore();
    store.data = content('local');
    store.meta.dirty = true;
    const { sync, last } = setup(store);
    await sync.pull();
    expect(server.rev).toBe(1);
    expect((server.doc as { plan: { id: string } }).plan.id).toBe('local');
    expect(store.meta).toMatchObject({ rev: 1, dirty: false });
    expect(last()).toBe('idle');
  });

  it('reports a conflict when both sides changed, and replaces nothing', async () => {
    server.rev = 5;
    server.doc = toDoc(content('server'));
    const store = new FakeStore();
    store.data = content('local');
    store.meta = { rev: 4, dirty: true, syncedAt: null };
    const { sync, last } = setup(store);
    await sync.pull();
    expect(last()).toBe('conflict');
    expect(store.data.plan.id).toBe('local');
    expect(server.rev).toBe(5);
  });

  it('keeps this device on request by overwriting the server', async () => {
    server.rev = 5;
    server.doc = toDoc(content('server'));
    const store = new FakeStore();
    store.data = content('local');
    store.meta = { rev: 4, dirty: true, syncedAt: null };
    const { sync } = setup(store);
    await sync.useLocal();
    expect(server.rev).toBe(6);
    expect((server.doc as { plan: { id: string } }).plan.id).toBe('local');
  });

  it('starts again from rev 0 when the server copy is gone', async () => {
    const store = new FakeStore();
    store.data = content('local');
    store.meta = { rev: 7, dirty: false, syncedAt: null };
    const { sync, last } = setup(store);
    await sync.pull();
    expect(server.rev).toBe(1);
    expect(last()).toBe('idle');
  });

  it('keeps a change made during a push marked as unsent', async () => {
    const store = new FakeStore();
    store.data = content('local');
    store.meta.dirty = true;
    const { sync } = setup(store);
    const { putData } = await import('../src/lib/api');
    vi.mocked(putData).mockImplementationOnce(async (baseRev, doc) => {
      store.onChange(); // a local change while the request is in flight
      server.rev = baseRev + 1;
      server.doc = doc;
      return { ok: true, rev: server.rev };
    });
    await sync.flush();
    expect(store.meta.dirty).toBe(true);
    sync.stop();
  });
});
