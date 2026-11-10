'use client';

import Cookies from 'js-cookie';
import { tokenExpiry } from './session';

// This is an invalidation hint, not an authenticated identity. A missed browser
// event or a server-side revocation cannot be detected reliably by this store.
export type SessionSnapshot = Readonly<{
  generation: number;
  state: 'unknown' | 'unavailable' | 'plausible';
}>;

const serverSnapshot: SessionSnapshot = Object.freeze({ generation: 0, state: 'unknown' });
let snapshot = serverSnapshot;
let observedToken: string | undefined;
let observing = false;
let channel: BroadcastChannel | undefined;
const listeners = new Set<() => void>();
let notifying = false;
let notificationPending = false;

function notify() {
  notificationPending = true;
  if (notifying) return;
  notifying = true;
  try {
    while (notificationPending) {
      notificationPending = false;
      for (const listener of Array.from(listeners)) {
        if (!listeners.has(listener)) continue;
        try { listener(); } catch { /* Observers must not interrupt authentication. */ }
      }
    }
  } finally {
    notifying = false;
  }
}

function readCookie(): { token: string | undefined; state: SessionSnapshot['state'] } {
  try {
    const token = Cookies.get('token');
    return { token, state: tokenExpiry(token) ? 'plausible' : 'unavailable' };
  } catch {
    return { token: undefined, state: 'unknown' };
  }
}

function update(force: boolean) {
  const { token, state } = readCookie();
  if (force || token !== observedToken || state !== snapshot.state) {
    observedToken = token;
    snapshot = Object.freeze({ generation: snapshot.generation + 1, state });
    notify();
  }
  return snapshot;
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

export function getServerSessionSnapshot(): SessionSnapshot {
  return serverSnapshot;
}

// Reconcile before exposing retained private state. Equal cookies do not prove
// uninterrupted continuity, and "plausible" does not mean authenticated.
export function reconcileSession(): SessionSnapshot {
  // Without active observation, even an equal cookie may conceal a missed
  // change. Each boundary check must therefore invalidate conservatively.
  return update(!observing);
}

function onFocus() { reconcileSession(); }
function onPageShow(event: PageTransitionEvent) { update(event.persisted); }
function onVisibilityChange() {
  // A hidden or suspended document may have missed cross-tab messages.
  if (document.visibilityState === 'visible') update(true);
}
function onMessage(event: MessageEvent) {
  if (event.data?.type === 'invalidate') update(true);
}

function openChannel(): BroadcastChannel | undefined {
  try {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;
    return new window.BroadcastChannel('readstack-session');
  } catch { return; }
}

function startObserving() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  observing = true;
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);
  channel = openChannel();
  if (channel) channel.onmessage = onMessage;
  // Subscription may follow a period in which messages could not be received.
  update(true);
}

function stopObserving() {
  if (!observing) return;
  observing = false;
  window.removeEventListener('focus', onFocus);
  window.removeEventListener('pageshow', onPageShow);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  try { channel?.close(); } catch { /* Browser channel is best effort. */ }
  channel = undefined;
}

export function subscribeSession(listener: () => void): () => void {
  // A wrapper permits independent subscriptions even with the same callback.
  const subscription = () => listener();
  listeners.add(subscription);
  if (listeners.size === 1) startObserving();
  return () => {
    listeners.delete(subscription);
    if (listeners.size === 0) stopObserving();
  };
}

// Called only after an existing cookie helper has completed its mutation and
// version update. Subscribers must not synchronously mutate authentication.
export function notifySessionMutation() {
  update(true);
  let sender: BroadcastChannel | undefined;
  try {
    sender = channel || openChannel();
    sender?.postMessage({ type: 'invalidate' });
  } catch { /* Cross-tab notifications are best effort. */ }
  finally {
    if (sender && sender !== channel) {
      try { sender.close(); } catch { /* Best effort. */ }
    }
  }
}
