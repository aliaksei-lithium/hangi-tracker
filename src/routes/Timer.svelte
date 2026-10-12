<script module lang="ts">
  import type { HangSet } from '../lib/domain/types';

  export interface TimerOutcome {
    startedAt: number;
    durationSec: number;
    sets: HangSet[];
    plannedSets: number;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { player, vibrate } from '../lib/audio/player';
  import { keepScreenOn, releaseScreen } from '../lib/audio/wakeLock';
  import { formatDuration } from '../lib/domain/plan';
  import {
    addTime,
    buildSegments,
    canAddTime,
    elapsedMs,
    finish,
    formatClock,
    isPaused,
    pause,
    positionAt,
    resume,
    signals,
    skip,
    startTimer,
    workResults,
    type Segment,
    type TimerState,
  } from '../lib/domain/timer';
  import type { PlannedSession, Settings } from '../lib/domain/types';
  import { gripLabel, kg } from '../lib/format';

  let { session, settings, onDone }: { session: PlannedSession; settings: Settings; onDone: (o: TimerOutcome) => void } = $props();

  // Set results marked during rest. Without a mark, a set counts as completed
  // when the hang ran to the end.
  type Mark = { completed: boolean; failedAt: number };

  let timer = $state<TimerState>(untrack(() => startTimer(buildSegments($state.snapshot(session), settings), Date.now())));
  let now = $state(Date.now());
  let marks = $state<Record<number, Mark>>({});
  let confirming = $state(false);
  let screenOn = $state(false);
  let reported = false;

  const pos = $derived(positionAt(timer, now));
  const seg = $derived(pos.segment);
  const paused = $derived(isPaused(timer));
  const workTotal = $derived(timer.segments.filter((s) => s.phase === 'hang').length);
  const results = $derived(workResults(timer, now));
  const isCompleted = (r: { index: number; reached: boolean }) => (marks[r.index] ? marks[r.index].completed : r.reached);
  const doneCount = $derived(results.filter(isCompleted).length);
  // A dot per work set: filled once that set is completed.
  const dots = $derived(Array.from({ length: workTotal }, (_, i) => results.some((r) => r.index === i && isCompleted(r))));

  // ---- sound and the frame loop ----

  const allSignals = $derived(signals(timer.segments));

  function syncSound() {
    if (settings.timer.beeps && !isPaused(timer) && !positionAt(timer, Date.now()).done) {
      player.schedule(allSignals, elapsedMs(timer, Date.now()));
    } else {
      player.cancel();
    }
  }

  let lastElapsed = 0;
  let raf = 0;
  function frame() {
    now = Date.now();
    const elapsed = elapsedMs(timer, now);
    // Voice and vibration need the page to be visible; skip anything older than 1.5 s.
    for (const s of allSignals) {
      if (s.atMs <= lastElapsed || s.atMs > elapsed || elapsed - s.atMs > 1500) continue;
      if (s.kind === 'voice' && s.voice && settings.timer.voice) player.speak(s.voice);
      if (s.kind === 'go') vibrate(400);
      if (s.kind === 'stop') vibrate([150, 80, 150]);
      if (s.kind === 'warn') vibrate(80);
    }
    lastElapsed = elapsed;
    if (positionAt(timer, now).done && !reported) {
      reported = true;
      // Show "Done" briefly, then open the summary.
      setTimeout(report, timer.finishedAt ? 0 : 1500);
    }
    raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      // The audio clock may have stopped while hidden; map it to session time again.
      lastElapsed = elapsedMs(timer, Date.now());
      syncSound();
    }
  }

  onMount(() => {
    syncSound();
    if (settings.timer.wakeLock) void keepScreenOn().then((ok) => (screenOn = ok));
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    player.stop();
    releaseScreen();
  });

  // ---- controls ----

  function update(next: TimerState) {
    timer = next;
    now = Date.now();
    lastElapsed = elapsedMs(timer, now);
    syncSound();
  }

  const togglePause = () => update(paused ? resume(timer, Date.now()) : pause(timer, Date.now()));
  const plusTen = () => update(addTime(timer, Date.now()));
  const skipPhase = () => update(skip(timer, Date.now()));
  function finishNow() {
    confirming = false;
    update(finish(timer, Date.now()));
  }

  function report() {
    const final = $state.snapshot(timer);
    const end = final.finishedAt ?? Date.now();
    const sets: HangSet[] = workResults(final, end).map((r) => {
      const m = marks[r.index];
      const completed = m ? m.completed : r.reached;
      return { edgeMm: r.edgeMm, targetSec: r.targetSec, actualSec: completed ? r.heldSec : (m?.failedAt ?? r.heldSec), completed };
    });
    onDone({ startedAt: final.startedAt, durationSec: Math.round(elapsedMs(final, end) / 1000), sets, plannedSets: workTotal });
  }

  // ---- set result during rest ----

  /** The work set a rest belongs to, when its result can be marked. */
  const restOf = $derived(seg && seg.block === 'work' && seg.phase === 'rest' ? seg.index : null);
  const restResult = $derived(restOf === null ? undefined : results.find((r) => r.index === restOf));

  function markCompleted(i: number) {
    marks[i] = { completed: true, failedAt: marks[i]?.failedAt ?? 0 };
  }
  function markFailed(i: number, target: number, held: number) {
    marks[i] = { completed: false, failedAt: marks[i]?.failedAt || Math.max(1, Math.min(held, target - 1)) };
  }
  function shiftFailed(i: number, delta: number, target: number) {
    const m = marks[i];
    if (m) m.failedAt = Math.min(target, Math.max(0, m.failedAt + delta));
  }

  // ---- text ----

  const LABELS = { countdown: 'GET READY', warmup: 'WARM-UP', hang: 'HANG', rest: 'REST', prepare: 'NEXT SET' } as const;

  function setLine(s: Segment): string {
    return s.block === 'warmup' ? `Warm-up ${s.index + 1} of ${s.of}` : `Set ${s.index + 1} of ${s.of}`;
  }

  function nextLine(index: number): string {
    const after = timer.segments.slice(index + 1);
    // During rest the prepare phase is part of the rest; name the set after it.
    const n = timer.segments[index].phase === 'rest' ? after.find((s) => s.phase !== 'prepare') : after[0];
    if (!n) return 'Next: finish';
    if (n.phase === 'rest' || n.phase === 'prepare') {
      // Rest and prepare together are the rest the user cares about.
      let ms = 0;
      for (const s of after) {
        if (s.phase !== 'rest' && s.phase !== 'prepare') break;
        ms += s.durationMs;
      }
      return `Next: rest ${formatDuration(Math.round(ms / 1000))}`;
    }
    if (n.phase === 'warmup') return timer.segments[index].phase === 'rest' ? `Next: warm-up ${n.index + 1} of ${n.of}` : `Next: warm-up hang ${n.hangSec} s`;
    if (n.phase === 'hang') return timer.segments[index].phase === 'rest' ? `Next: set ${n.index + 1} · ${n.edgeMm} mm` : `Next: hang ${n.hangSec} s`;
    return '';
  }

  function targetLine(s: Segment): string {
    switch (s.phase) {
      case 'countdown':
        return 'Session starts';
      case 'warmup':
        return `${s.hangSec} s · ${gripLabel(s.grip).toLowerCase()} · easy`;
      case 'hang':
        return [`Target ${s.hangSec} s`, gripLabel(s.grip).toLowerCase(), ...(s.addedKg ? [kg(s.addedKg)] : [])].join(' · ');
      case 'rest': {
        const next = timer.segments.slice(pos.index + 1).find((x) => x.phase === 'hang' || x.phase === 'warmup');
        return next ? `Next hang: ${next.hangSec} s on ${next.edgeMm} mm` : '';
      }
      case 'prepare':
        return `Hands on the ${s.edgeMm} mm edge`;
    }
  }

  const theme = $derived(
    paused || pos.done ? 'dark' : seg?.phase === 'hang' || seg?.phase === 'warmup' ? 'hang' : seg?.phase === 'rest' ? 'rest' : 'ready',
  );
  const label = $derived(pos.done ? 'DONE' : paused ? 'PAUSED' : seg ? LABELS[seg.phase] : '');
  const digits = $derived(pos.done ? `${doneCount}/${workTotal}` : formatClock(pos.remainingMs));
  const progress = $derived(seg ? Math.min(100, (pos.elapsedMs / seg.durationMs) * 100) : 100);
</script>

<div class="timer {theme}">
  <div class="status">
    <span>{screenOn ? 'Screen stays on' : ''}</span>
  </div>

  <div class="setline display">
    <span>{pos.done ? 'Session done' : seg ? setLine(seg) : ''}</span>
    <span>{seg ? `${seg.edgeMm} mm` : ''}</span>
  </div>

  <div class="dots" aria-label="{doneCount} of {workTotal} sets done">
    {#each dots as filled, i (i)}
      <div class="dot" class:filled></div>
    {/each}
  </div>

  <div class="center">
    <div class="label display" aria-live="polite">{label}</div>
    <div class="digits display" class:long={digits.length > 2} role="timer">{digits}</div>
    <div class="target">
      {#if pos.done}
        {timer.finishedAt ? 'Saving…' : 'Opening summary…'}
      {:else if paused}
        Timer is on hold
      {:else if seg}
        {targetLine(seg)}
      {/if}
    </div>
    <div class="bar" aria-hidden="true"><div style="width: {progress}%"></div></div>
    <div class="next display">{!pos.done && seg ? nextLine(pos.index) : ''}</div>
  </div>

  {#if restResult && !paused}
    {@const m = marks[restResult.index]}
    {@const completed = m ? m.completed : restResult.reached}
    <div class="result">
      <div class="result-title">Set {restResult.index + 1} result</div>
      <div class="result-grid">
        <button class:sel={completed} aria-pressed={completed} onclick={() => markCompleted(restResult.index)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"></path></svg>
          Completed
        </button>
        {#if completed}
          <button aria-pressed="false" onclick={() => markFailed(restResult.index, restResult.targetSec, restResult.heldSec)}>Failed</button>
        {:else}
          <div class="failed sel">
            <button aria-label="One second less" onclick={() => shiftFailed(restResult.index, -1, restResult.targetSec)}>−</button>
            <span class="failed-text">Failed at {m?.failedAt ?? restResult.heldSec} s</span>
            <button aria-label="One second more" onclick={() => shiftFailed(restResult.index, 1, restResult.targetSec)}>+</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="controls">
    {#if pos.done}
      <button class="big" onclick={report}>Open summary</button>
    {:else}
      <button class="big" onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      <div class="row">
        <button disabled={!canAddTime(pos) || paused} onclick={plusTen}>+10 s</button>
        <button disabled={paused} onclick={skipPhase}>Skip</button>
        <button onclick={() => (confirming = true)}>Finish</button>
      </div>
    {/if}
  </div>

  {#if confirming}
    <div class="scrim" role="presentation">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <h2 id="finish-title" class="display">Finish session?</h2>
        <p>{doneCount} of {workTotal} sets are done. They will be saved and the summary opens next.</p>
        <button class="keep" onclick={() => (confirming = false)}>Keep going</button>
        <button class="stop" onclick={finishNow}>Finish now</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .timer {
    --bg: var(--timer-bg);
    --ink: var(--timer-text);
    flex: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--ink);
    padding: env(safe-area-inset-top) 20px max(28px, env(safe-area-inset-bottom));
  }
  .ready { --bg: var(--ph-ready); --ink: var(--on-ready); }
  .hang { --bg: var(--ph-hang); --ink: var(--on-hang); }
  .rest { --bg: var(--ph-rest); --ink: var(--on-rest); }
  .dark { --bg: var(--timer-bg); --ink: var(--timer-text); }

  .status { height: 40px; display: flex; align-items: center; justify-content: flex-end; font-size: 15px; font-weight: 600; opacity: 0.8; }
  .setline { display: flex; justify-content: space-between; align-items: baseline; font-size: 26px; letter-spacing: 0.01em; }
  .dots { display: flex; gap: 6px; padding-top: 10px; }
  .dot { flex: 1; height: 8px; border: 2px solid var(--ink); }
  .dot.filled { background: var(--ink); }
  .center { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 4px; }
  .label { font-weight: 700; font-size: var(--fs-phase); line-height: 1; letter-spacing: 0.06em; }
  .digits { font-weight: 700; font-size: 220px; line-height: 0.9; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .digits.long { font-size: 168px; }
  .target { font-size: 18px; font-weight: 600; opacity: 0.92; min-height: 1.45em; }
  .bar { width: 100%; height: 10px; border: 2px solid var(--ink); margin-top: 18px; display: flex; }
  .bar div { background: var(--ink); }
  .next { font-size: 28px; padding-top: 14px; min-height: 1.6em; }

  .result { display: flex; flex-direction: column; gap: 8px; padding-bottom: 14px; }
  .result-title { font-size: 14px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.9; }
  .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .result-grid > button, .failed { min-height: 64px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 2px solid var(--ink); background: transparent; color: var(--ink); font-weight: 600; font-size: 17px; }
  .result-grid .sel { background: var(--ink); color: var(--bg); font-weight: 700; }
  .failed { justify-content: space-between; padding: 0; }
  .failed-text { white-space: nowrap; font-size: 16px; }
  .failed button { width: 40px; height: 60px; flex: none; border: 0; background: transparent; color: inherit; font-size: 24px; }

  .controls { display: flex; flex-direction: column; gap: 8px; }
  .controls button { font-family: var(--font-display); font-weight: 600; color: var(--ink); background: transparent; border: 2px solid var(--ink); border-radius: var(--r-1); }
  .controls .big { height: 80px; background: var(--ink); color: var(--bg); font-weight: 700; font-size: 30px; letter-spacing: 0.04em; border: 0; }
  .row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .row button { height: var(--hit-timer); font-size: 24px; }
  .row button:disabled { opacity: 0.35; }

  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.72); display: flex; align-items: flex-end; justify-content: center; padding: 20px 20px max(28px, env(safe-area-inset-bottom)); z-index: 10; }
  .sheet { width: 100%; max-width: 520px; background: var(--timer-control); color: var(--timer-text); border: 1px solid rgba(255, 255, 255, 0.12); padding: 24px 20px 20px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-weight: 700; font-size: 34px; line-height: 1; }
  .sheet p { margin: 0; font-size: 17px; color: var(--timer-muted); }
  .sheet button { height: var(--hit-timer); font-family: var(--font-display); font-weight: 700; font-size: 28px; border-radius: var(--r-1); }
  .keep { margin-top: 8px; background: var(--timer-text); color: var(--timer-bg); border: 0; }
  .stop { background: transparent; border: 2px solid #f08a7e; color: #f08a7e; }

  @media (max-height: 700px) {
    .digits { font-size: 160px; }
    .digits.long { font-size: 128px; }
    .label { font-size: 44px; }
  }
</style>
