// Local working store in IndexedDB, one database per user, so two people on
// one phone never see each other's data. The server keeps a copy (see sync.ts).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toIsoDate } from '../domain/dates';
import { generatePlan, withDefaults } from '../domain/plan';
import type { HangSession, Plan, PlannedSession, Settings } from '../domain/types';
import { withSessionDefaults, type DocContent } from './doc';

/** Sync state: the server rev this device last saw, and whether it has unsent changes. */
export interface SyncMeta {
  rev: number;
  dirty: boolean;
  syncedAt: string | null;
}

interface HangiDB extends DBSchema {
  plan: { key: string; value: Plan };
  plannedSessions: { key: string; value: PlannedSession; indexes: { date: string } };
  hangSessions: { key: string; value: HangSession; indexes: { datetime: string } };
  settings: { key: string; value: Settings };
  meta: { key: string; value: SyncMeta };
}

const CURRENT = 'current';
const SYNC = 'sync';
const DATA_STORES = ['plan', 'plannedSessions', 'hangSessions', 'settings'] as const;

export type Snapshot = DocContent;

export class Store {
  /** Called after every local change, so sync can push. */
  onChange: () => void = () => {};

  private constructor(private db: IDBPDatabase<HangiDB>) {}

  static async open(userName: string): Promise<Store> {
    const db = await openDB<HangiDB>(`hangi-tracker:${userName}`, 1, {
      upgrade(db) {
        db.createObjectStore('plan');
        db.createObjectStore('plannedSessions', { keyPath: 'id' }).createIndex('date', 'date');
        db.createObjectStore('hangSessions', { keyPath: 'id' }).createIndex('datetime', 'datetime');
        db.createObjectStore('settings');
        db.createObjectStore('meta');
      },
    });
    return new Store(db);
  }

  /** Loads everything; on first use creates default settings and the plan. */
  async load(today: Date = new Date()): Promise<Snapshot> {
    const saved = await this.db.get('settings', CURRENT);
    const settings = withDefaults(saved);
    let changed = false;
    if (JSON.stringify(saved) !== JSON.stringify(settings)) {
      await this.db.put('settings', settings, CURRENT);
      changed = true;
    }
    let plan = await this.db.get('plan', CURRENT);
    let sessions: PlannedSession[];
    if (!plan) {
      const generated = generatePlan(settings, toIsoDate(today), crypto.randomUUID().slice(0, 8));
      plan = generated.plan;
      sessions = generated.sessions;
      const tx = this.db.transaction(['plan', 'plannedSessions'], 'readwrite');
      await Promise.all([
        tx.objectStore('plan').put(plan, CURRENT),
        ...sessions.map((s) => tx.objectStore('plannedSessions').put(s)),
        tx.done,
      ]);
      changed = true;
    } else {
      sessions = await this.db.getAll('plannedSessions');
    }
    const hangSessions = (await this.db.getAll('hangSessions')).map(withSessionDefaults);
    if (changed) await this.changed();
    return { settings, plan, sessions, hangSessions };
  }

  async saveSessions(sessions: PlannedSession[]): Promise<void> {
    const tx = this.db.transaction('plannedSessions', 'readwrite');
    await Promise.all([...sessions.map((s) => tx.store.put(s)), tx.done]);
    await this.changed();
  }

  /** Saves a logged session, and optionally planned sessions, in one transaction. */
  async saveHangSession(session: HangSession, planned: PlannedSession[] = []): Promise<void> {
    const tx = this.db.transaction(['hangSessions', 'plannedSessions'], 'readwrite');
    await Promise.all([
      tx.objectStore('hangSessions').put(session),
      ...planned.map((p) => tx.objectStore('plannedSessions').put(p)),
      tx.done,
    ]);
    await this.changed();
  }

  async deleteHangSession(id: string, planned: PlannedSession[] = []): Promise<void> {
    const tx = this.db.transaction(['hangSessions', 'plannedSessions'], 'readwrite');
    await Promise.all([
      tx.objectStore('hangSessions').delete(id),
      ...planned.map((p) => tx.objectStore('plannedSessions').put(p)),
      tx.done,
    ]);
    await this.changed();
  }

  async savePlan(plan: Plan): Promise<void> {
    await this.db.put('plan', plan, CURRENT);
    await this.changed();
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.put('settings', settings, CURRENT);
    await this.changed();
  }

  /** Replaces all data, for import and for server data. `fromServer` keeps the sync state clean. */
  async replaceAll(c: DocContent, fromServer: { rev: number } | null): Promise<void> {
    const tx = this.db.transaction([...DATA_STORES, 'meta'], 'readwrite');
    await Promise.all(DATA_STORES.map((s) => tx.objectStore(s).clear()));
    await Promise.all([
      tx.objectStore('settings').put(c.settings, CURRENT),
      tx.objectStore('plan').put(c.plan, CURRENT),
      ...c.sessions.map((s) => tx.objectStore('plannedSessions').put(s)),
      ...c.hangSessions.map((s) => tx.objectStore('hangSessions').put(s)),
    ]);
    const meta = (await tx.objectStore('meta').get(SYNC)) ?? emptyMeta();
    await tx.objectStore('meta').put(
      fromServer ? { rev: fromServer.rev, dirty: false, syncedAt: new Date().toISOString() } : { ...meta, dirty: true },
      SYNC,
    );
    await tx.done;
    if (!fromServer) this.onChange();
  }

  /** Deletes all data; the next load() creates a fresh plan. */
  async clearAll(): Promise<void> {
    const tx = this.db.transaction([...DATA_STORES], 'readwrite');
    await Promise.all([...DATA_STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
  }

  async getMeta(): Promise<SyncMeta> {
    return (await this.db.get('meta', SYNC)) ?? emptyMeta();
  }

  async setMeta(meta: SyncMeta): Promise<void> {
    await this.db.put('meta', meta, SYNC);
  }

  async snapshot(): Promise<Snapshot> {
    const [settings, plan, sessions, hangSessions] = await Promise.all([
      this.db.get('settings', CURRENT),
      this.db.get('plan', CURRENT),
      this.db.getAll('plannedSessions'),
      this.db.getAll('hangSessions'),
    ]);
    if (!settings || !plan) throw new Error('store is empty');
    return { settings, plan, sessions, hangSessions };
  }

  private async changed(): Promise<void> {
    const meta = await this.getMeta();
    if (!meta.dirty) await this.setMeta({ ...meta, dirty: true });
    this.onChange();
  }

  close(): void {
    this.db.close();
  }
}

function emptyMeta(): SyncMeta {
  return { rev: 0, dirty: false, syncedAt: null };
}
