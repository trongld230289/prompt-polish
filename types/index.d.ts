export type Polish =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'filled' }
  | { kind: 'proposed'; text: string }
  | { kind: 'error'; message: string }

/** Keepwarm in this session: off, asking how many pings, or on with `sent` of `total` pings done and the next at `nextAt`. */
export type Warm =
  | { kind: 'off' }
  | { kind: 'asking' }
  | { kind: 'on'; total: number; sent: number; nextAt: number }

declare module 'claude-code' {
  interface PluginState {
    'promptdeck': { polish: Polish; warm: Warm }
  }
}
