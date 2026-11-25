import { isGameId } from './games/catalog';
import type { GameId } from './games/types';

export type Route = { name: 'lobby' } | { name: 'play'; id: GameId };

export interface RouteState {
  fromLobby?: boolean;
}

/** Returns null for unknown paths so callers can redirect to the lobby. */
export function parseRoute(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html') return { name: 'lobby' };
  const m = /^\/play\/([a-z0-9-]+)$/.exec(path);
  if (m && isGameId(m[1])) return { name: 'play', id: m[1] };
  return null;
}

export function playPath(id: GameId): string {
  return `/play/${id}`;
}

export function currentState(): RouteState {
  return (history.state as RouteState | null) ?? {};
}

export function pushRoute(path: string, state: RouteState = {}) {
  history.pushState(state, '', path);
}

export function replaceRoute(path: string, state: RouteState = {}) {
  history.replaceState(state, '', path);
}
