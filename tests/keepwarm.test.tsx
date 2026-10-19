import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { bodyRows: 20, offset: 0, contentRows: 0 },
    view: {},
  },
} as const

const MIN = 60_000
const START = Date.UTC(2026, 9, 19, 9, 0, 0)

/** A session with a clock, an in-memory store, and the prompts and toasts the mod sends. */
function world(on: On, percentUsed = 40) {
  const clock = mock.clock(on, { now: START })
  const submitted: string[] = []
  const toasts: string[] = []
  const store = new Map<string, unknown>()
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt: new Date(START + 120 * MIN).toISOString() }],
    } as never,
  }))
  on('turn.complete', () => ({ text: '' }))
  on('command.register', () => ({ value: undefined }) as never)
  return { clock, submitted, toasts, store }
}

const turnEnd = ($: Engine) =>
  $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as never)

test('Keepwarm asks how many pings, prefilled with 6, then pings 50 minutes after each turn and stops after the count', async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'keepwarm' })
  expect((await ui.find({ key: 'warm-count' }))?.props.value).toBe('6')
  await ui.input({ key: 'warm-count', text: '2', kind: 'submit' })
  expect(w.store.get('warmCount')).toBe(2)
  expect(await ui.find({ type: 'Text', text: / 0\/2/ })).toBeDefined()

  await w.clock.advance(49 * MIN)
  expect(w.submitted).toEqual([])
  await w.clock.advance(1 * MIN)
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toMatch(/^\[keepwarm\]/)

  // The ping's turn ends 1 minute later: the next is 50 minutes from then, not from the ping.
  await w.clock.advance(1 * MIN)
  await turnEnd($)
  await w.clock.advance(49 * MIN)
  expect(w.submitted.length).toBe(1)
  await w.clock.advance(1 * MIN)
  expect(w.submitted.length).toBe(2)

  // The last ping's turn ends: keepwarm turns itself off and says so.
  await turnEnd($)
  expect(w.toasts.some(t => /keepwarm off: 2 pings sent/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /Keep/ })).toBeDefined()
  await w.clock.advance(120 * MIN)
  expect(w.submitted.length).toBe(2)
  await ui.unmount()
})

test('a prompt the person types ends keepwarm', async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'keepwarm' })
  await ui.input({ key: 'warm-count', text: '6', kind: 'submit' })
  await $.prompt.submit({ text: 'tiếp tục nhé', origin: { kind: 'composer' } } as never)
  await w.clock.advance(60 * MIN)
  expect(w.submitted.filter(t => t.startsWith('[keepwarm]'))).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Keep/ })).toBeDefined()
  await ui.unmount()
})

test('a spent 5-hour window stops keepwarm instead of pinging', async ($, on) => {
  const w = world(on, 100)
  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'keepwarm' })
  await ui.input({ key: 'warm-count', text: '3', kind: 'submit' })
  await w.clock.advance(50 * MIN)
  expect(w.submitted).toEqual([])
  expect(w.toasts.some(t => /usage limit/.test(t))).toBe(true)
  await ui.unmount()
})

test('a count that is not a whole number from 1 to 48 is refused', async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'keepwarm' })
  await ui.input({ key: 'warm-count', text: 'abc', kind: 'submit' })
  expect(w.toasts.some(t => /whole number/.test(t))).toBe(true)
  expect(await ui.find({ key: 'warm-count' })).toBeDefined()
  await ui.press({ key: 'warm-cancel' })
  expect(await ui.find({ key: 'warm-count' })).toBeUndefined()
  await ui.unmount()
})
