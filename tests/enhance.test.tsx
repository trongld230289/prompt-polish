import { expect, test } from 'claude-code/testing'

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

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }


test('Enhance rewrites the draft with haiku and fills the prompt box', async ($, on) => {
  let asked: { model: string; prompt: string } | undefined
  let filled: string | undefined

  on('prompt.read', () => ({ value: { text: 'thêm nút dark mode', cursor: 0 } }))
  on('model.complete', (_, e) => {
    asked = { model: e.model, prompt: e.prompt }
    return { value: { isAnswered: true, text: 'Nhiệm vụ: thêm nút dark mode', usage: USAGE } as const }
  })
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ plugin: 'prompt-polish', surface: 'terminal', ...BAND })
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left' })

  expect(asked?.model).toBe('haiku')
  expect(asked?.prompt).toContain('thêm nút dark mode')
  expect(filled).toBe('Nhiệm vụ: thêm nút dark mode')
  expect(await ui.find({ type: 'Text', text: /enhanced/ })).toBeDefined()
  await ui.unmount()
})

test('a failed model call shows a clear message', async ($, on) => {
  on('prompt.read', () => ({ value: { text: 'fix the bug', cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } as const }))

  const ui = await $.ui.mount({ plugin: 'prompt-polish', surface: 'terminal', ...BAND })
  await ui.post({ press: 'enhance' })

  expect((await ui.find({ type: 'Text', text: /failed/ }))?.text).toContain('529')
  await ui.unmount()
})

test('when the box cannot be filled, the band offers Use this', async ($, on) => {
  let submitted: string | undefined

  on('prompt.read', () => ({ value: { text: 'write tests', cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Write tests for X', usage: USAGE } as const }))
  on('prompt.fill', () => ({ isFilled: false, refusal: 'dialog' }))
  on('prompt.submit', (_, e) => {
    submitted = e.text
    return { text: e.text }
  })

  const ui = await $.ui.mount({ plugin: 'prompt-polish', surface: 'terminal', ...BAND })
  await ui.post({ press: 'enhance' })

  expect((await ui.find({ type: 'Text', text: /Write tests for X/ }))?.text).toContain('Write tests for X')
  await ui.press({ key: 'use' })
  expect(submitted).toBe('Write tests for X')
  await ui.unmount()
})

test('the Enhance label plays three breaths, then rests until the 30 s period comes round', async ($) => {
  const ui = await $.ui.mount({ plugin: 'prompt-polish', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'En', in: 'enhance-label' })).toBeDefined()
  await ui.advance(400)
  expect(await ui.find({ type: 'Text', text: '◊ ', in: 'enhance-label' })).toBeDefined()
  await ui.advance(5_000)
  expect(await ui.find({ type: 'Text', text: '♦ ', in: 'enhance-label' })).toBeDefined()
  await ui.advance(10_000)
  expect(await ui.find({ type: 'Text', text: '♦ ', in: 'enhance-label' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '◊ ', in: 'enhance-label' })).toBeUndefined()
  await ui.advance(15_000)
  expect(await ui.find({ type: 'Text', text: '◊ ', in: 'enhance-label' })).toBeDefined()
  await ui.unmount()
})

test('off the terminal the Enhance label is a plain Button, no Client', async ($) => {
  const ui = await $.ui.mount({ plugin: 'prompt-polish', surface: 'desktop', ...BAND })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeDefined()
  await ui.unmount()
})
