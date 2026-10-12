// Keeps the server snapshot in step with the local store.
//
// - On app open: pull. If the server is newer and this device has no unsent
//   changes, the server data replaces the local data. If both changed, the user decides.
// - After a local change: push 2 s after the last change (debounced).
// - A push names the server rev it is based on; 409 means another device wrote first.
//   Nothing is overwritten silently: the user chooses which copy to keep.
// - Offline: changes stay marked unsent and go out when the network is back.

import { getData, NetworkError, putData, UnauthorizedError } from '../api';
import { parseDoc, toDoc, type DocContent } from './doc';
import type { Store } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict' | 'error';

export interface SyncEvents {
  status: (s: SyncStatus) => void;
  /** Server data replaced the local data. */
  replaced: () => void;
  unauthorized: () => void;
}

const PUSH_DELAY_MS = 2000;

export class Sync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private changes = 0; // local changes since start; tells if a change happened during a push
  private pushing = false;
  private onOnline = () => void this.push();

  constructor(
    private store: Store,
    private events: SyncEvents,
  ) {
    store.onChange = () => {
      this.changes++;
      this.schedule();
    };
    window.addEventListener('online', this.onOnline);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    window.removeEventListener('online', this.onOnline);
    this.store.onChange = () => {};
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), PUSH_DELAY_MS);
  }

  /** Push now, for example right after a session is saved. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    return this.push();
  }

  /** Pull on open. Must run before the store creates a default plan on a new device. */
  async pull(): Promise<void> {
    this.events.status('syncing');
    try {
      const server = await getData();
      const meta = await this.store.getMeta();
      if (server.rev > meta.rev && server.doc) {
        if (!meta.dirty) {
          await this.store.replaceAll(parseDoc(server.doc), { rev: server.rev });
          this.events.replaced();
          this.events.status('idle');
        } else {
          this.events.status('conflict');
        }
        return;
      }
      if (meta.dirty || server.rev === 0) await this.push();
      else this.events.status('idle');
    } catch (e) {
      this.fail(e);
    }
  }

  private async push(): Promise<void> {
    if (this.pushing) return this.schedule();
    this.pushing = true;
    const seen = this.changes;
    try {
      const meta = await this.store.getMeta();
      const content = await this.store.snapshot().catch(() => null);
      if (!content) return;
      this.events.status('syncing');
      const res = await putData(meta.rev, toDoc(content));
      if (!res.ok) {
        this.events.status('conflict');
        return;
      }
      // A change made while the push was in flight stays unsent.
      await this.store.setMeta({ rev: res.rev, dirty: this.changes !== seen, syncedAt: new Date().toISOString() });
      this.events.status('idle');
      if (this.changes !== seen) this.schedule();
    } catch (e) {
      this.fail(e);
    } finally {
      this.pushing = false;
    }
  }

  /** Conflict resolution: take the server copy and drop local changes. */
  async useServer(): Promise<void> {
    const server = await getData();
    if (server.doc) await this.store.replaceAll(parseDoc(server.doc), { rev: server.rev });
    this.events.replaced();
    this.events.status('idle');
  }

  /** Conflict resolution: overwrite the server copy with this device's data. */
  async useLocal(): Promise<void> {
    const server = await getData();
    const meta = await this.store.getMeta();
    await this.store.setMeta({ ...meta, rev: server.rev, dirty: true });
    await this.push();
  }

  private fail(e: unknown): void {
    if (e instanceof UnauthorizedError) this.events.unauthorized();
    else if (e instanceof NetworkError) this.events.status('offline');
    else {
      console.error(e);
      this.events.status('error');
    }
  }
}

export type { DocContent };
