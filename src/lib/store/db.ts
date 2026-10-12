// Local working store in IndexedDB, one database per user, so two people on
// one phone never see each other's data. Server sync comes in phase 4.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toIsoDate } from '../domain/dates';
import { defaultSettings, generatePlan } from '../domain/plan';
import type { HangSession, Plan, PlannedSession, Settings } from '../domain/types';

interface HangiDB extends DBSchema {
  plan: { key: string; value: Plan };
  plannedSessions: { key: string; value: PlannedSession; indexes: { date: string } };
  hangSessions: { key: string; value: HangSession; indexes: { datetime: string } };
  settings: { key: string; value: Settings };
  meta: { key: string; value: unknown };
}

const CURRENT = 'current';

export interface Snapshot {
  settings: Settings;
  plan: Plan;
  sessions: PlannedSession[];
  hangSessions: HangSession[];
}

export class Store {
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
    let settings = await this.db.get('settings', CURRENT);
    if (!settings) {
      settings = defaultSettings();
      await this.db.put('settings', settings, CURRENT);
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
    } else {
      sessions = await this.db.getAll('plannedSessions');
    }
    const hangSessions = await this.db.getAll('hangSessions');
    return { settings, plan, sessions, hangSessions };
  }

  async saveSessions(sessions: PlannedSession[]): Promise<void> {
    const tx = this.db.transaction('plannedSessions', 'readwrite');
    await Promise.all([...sessions.map((s) => tx.store.put(s)), tx.done]);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.put('settings', settings, CURRENT);
  }

  close(): void {
    this.db.close();
  }
}
