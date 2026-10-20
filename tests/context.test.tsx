import { expect, mock, test } from 'claude-code/testing'

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

test('Enhance hands haiku the session: git state, the last prompt, the last answer', async ($, on) => {
  mock.clock(on, { now: 0 })
  let asked: string | undefined
  let box = 'fix it'

  on('prompt.read', () => ({ value: { text: box, cursor: 0 } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('process.run', (_, e) => {
    const argv = e.argv as readonly string[]
    const stdout = argv[1] === 'branch' ? 'feat/band\n' : ' M hooks/register.tsx\n?? tests/context.test.tsx\n'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never }
  })
  on('model.complete', (_, e) => {
    asked = e.prompt
    return { value: { isAnswered: true, text: 'Fix the band in hooks/register.tsx so the error row does not wrap.', usage: USAGE } as const }
  })
  on('prompt.fill', (_, e) => {
    box = e.text
    return { isFilled: true }
  })

  // A prompt the person sent, and the answer Claude gave it.
  await $.prompt.submit({ text: 'cái band bị bể', origin: { kind: 'composer' } } as never)
  await $.turn.complete({ reason: 'answer', answer: 'I moved the Clear button into a Box with flexShrink 0 in hooks/register.tsx.', durationMs: 1, isAborted: false, turnId: 't1' } as never)

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.post({ press: 'enhance' })

  expect(asked).toContain('Branch: feat/band')
  expect(asked).toContain('M hooks/register.tsx')
  expect(asked).toContain('cái band bị bể')
  expect(asked).toContain('I moved the Clear button')
  expect(asked).toContain('DRAFT PROMPT:\nfix it')
  await ui.unmount()
})

test('after Enhance the Original button puts the draft back', async ($, on) => {
  mock.clock(on, { now: 0 })
  let box = 'thêm nút dark mode'
  const fills: string[] = []

  on('prompt.read', () => ({ value: { text: box, cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Thêm dark mode cho app.', usage: USAGE } as const }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    box = e.text
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.post({ press: 'enhance' })
  expect(fills).toEqual(['Thêm dark mode cho app.'])
  expect(await ui.find({ type: 'Text', text: /Original/ })).toBeDefined()

  await ui.press({ key: 'undo' })
  expect(fills).toEqual(['Thêm dark mode cho app.', 'thêm nút dark mode'])
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('a sent prompt leaves nothing to put back', async ($, on) => {
  on('prompt.read', () => ({ value: { text: 'draft', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeDefined()
  await $.prompt.submit({ text: 'something else', origin: { kind: 'composer' } } as never)
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('only the skills nearest the draft reach haiku, nearest first', async ($, on) => {
  mock.clock(on, { now: 0 })
  let asked: string | undefined
  const skills = Array.from({ length: 40 }, (_, i) => ({
    name: `skill-${i}`,
    description: i === 37 ? 'Deploy the service to Azure with Terraform' : `Helper number ${i} for something else`,
    source: 'plugin',
    plugin: 'other',
  }))

  on('prompt.read', () => ({ value: { text: 'deploy to azure', cursor: 0 } }))
  on('command.list', () => ({ value: skills as never }))
  on('model.complete', (_, e) => {
    asked = e.prompt
    return { value: { isAnswered: true, text: 'Deploy to Azure.', usage: USAGE } as const }
  })
  on('prompt.fill', () => ({ isFilled: true }))

  const ui = await $.ui.mount({ plugin: 'promptdeck', surface: 'terminal', ...BAND })
  await ui.post({ press: 'enhance' })

  const listed = (asked ?? '').split('AVAILABLE SKILLS:')[1]?.split('DRAFT PROMPT:')[0] ?? ''
  const names = [...listed.matchAll(/- (skill-\d+):/g)].map(m => m[1])
  expect(names[0]).toBe('skill-37')
  expect(names.length).toBe(25)
  await ui.unmount()
})
