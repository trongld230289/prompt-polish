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

test('Clear empties the box and Undo puts the draft back', async ($, on) => {
  let box = 'một prompt dài đang gõ dở'
  const fills: string[] = []

  on('prompt.read', () => ({ value: { text: box, cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    box = e.text
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()

  await ui.press({ key: 'clear' })
  expect(fills).toEqual([''])
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeDefined()

  await ui.press({ key: 'undo' })
  expect(fills).toEqual(['', 'một prompt dài đang gõ dở'])
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('Clear on an empty box does nothing', async ($, on) => {
  const fills: string[] = []

  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'clear' })

  expect(fills).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})
