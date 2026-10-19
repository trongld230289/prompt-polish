export type Polish =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'filled' }
  | { kind: 'proposed'; text: string }
  | { kind: 'error'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'promptdeck': { polish: Polish }
  }
}
