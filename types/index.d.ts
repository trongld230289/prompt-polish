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

/**
 * The draft a press took out of the prompt box, for the button that puts it back: `why` `clear` (the Clear
 * button, "Undo") or `enhance` (the rewrite replaced it, "Original"); `text` `''` when there is nothing to put back.
 */
export type Cleared = { text: string; why: 'clear' | 'enhance' }

/** What the session just did, for Enhance: the person's last sent prompt and Claude's last answer, each cut. */
export type Recent = { prompt: string; answer: string }

declare module 'claude-code' {
  interface PluginState {
    'promptdeck': { polish: Polish; warm: Warm; cleared: Cleared; recent: Recent }
  }
}
