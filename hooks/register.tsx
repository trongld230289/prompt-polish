import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register } from 'claude-code'

import type { Polish } from '../types'

const polish = atom({ plugin: 'prompt-polish', key: 'polish' } as const, { kind: 'idle' } as Polish)

const CONTEXT_FILES = ['CLAUDE.md', 'README.md', 'package.json']
const FILE_CAP = 4000
const SKILL_CAP = 200
// glancedeck's wordmark colours: white text, the cyan ramp that rolls through "deck".
const WHITE = '#E6E8EE'
const RAMP = ['#5EE6E6', '#3BB0B3', '#167A80']

const SYSTEM = `You rewrite a developer's draft prompt for Claude Code, an AI coding agent, into a clearer, more complete prompt. Output ONLY the rewritten prompt, nothing before or after it.

Rules:
- Write in the SAME language as the draft. A Vietnamese draft stays Vietnamese; an English draft stays English. Technical terms, file names and skill names stay as they are.
- Keep the person's intent and every concrete detail they gave. Do not invent requirements they did not imply.
- Write it as the person speaking to Claude ("I want...", "Use...").
- Structure it with these short sections, headed in the draft's language:
  1. The task: the request, restated clearly.
  2. Skills to use: only skills from the AVAILABLE SKILLS list that genuinely fit the task, by exact name, each with a few words on why. Omit the section if none fit.
  3. Ask me first: the key decisions Claude must ask about BEFORE starting the work (scope, approach, trade-offs, anything ambiguous). At most 5.
  4. Done when: acceptance criteria describing what the finished result looks like, as a checklist.
  5. Project context: only the facts from the PROJECT FILES that matter for this task (stack, commands, conventions). Omit it if nothing applies.
- Be concise. No preamble, no closing remarks, no code fences around the whole prompt.`

type Skill = { name: string; description: string }

function setPolish($: EngineInterface, next: Polish): Promise<Polish> {
  return update($, polish, () => next)
}

async function listSkills($: EngineInterface): Promise<Skill[]> {
  try {
    const commands = await $.command.list()

    return commands
      .filter(c => c.source === 'plugin' || c.source === 'user')
      .filter(c => c.plugin !== 'prompt-polish')
      .slice(0, SKILL_CAP)
      .map(c => ({ name: c.name, description: c.description.slice(0, 160) }))
  } catch {
    return []
  }
}

async function readProjectFiles($: EngineInterface): Promise<string> {
  const parts: string[] = []
  for (const file of CONTEXT_FILES) {
    try {
      const text = await $.fs.read(file)
      if (typeof text === 'string' && text.trim() !== '') {
        const cut = text.length > FILE_CAP ? `${text.slice(0, FILE_CAP)}\n[... cut]` : text
        parts.push(`--- ${file} ---\n${cut}`)
      }
    } catch {
      // absent or unreadable: no context from it
    }
  }

  return parts.join('\n\n')
}

function failure(result: Exclude<ModelCompleteResult, { isAnswered: true }>): string {
  if (result.reason === 'api-error') {
    return `Enhance failed: the model returned an API error (${result.status ?? 'no status'}${result.error ? `, ${result.error}` : ''}).`
  }
  if (result.reason === 'empty-reply') {
    return 'Enhance failed: the model returned an empty reply.'
  }

  return 'Enhance failed: the model call timed out or was cancelled.'
}

async function enhance($: EngineInterface, draft: string): Promise<void> {
  const text = draft.trim()
  if (text === '') {
    await setPolish($, { kind: 'error', message: 'Type a prompt first, then Enhance.' })
    return
  }
  if ((await read($, polish)).kind === 'busy') {
    return
  }
  await setPolish($, { kind: 'busy' })

  try {
    const [skills, files] = await Promise.all([listSkills($), readProjectFiles($)])
    const skillLines = skills.length === 0
      ? '(none listed)'
      : skills.map(s => `- ${s.name}: ${s.description}`).join('\n')

    const result = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: `AVAILABLE SKILLS:\n${skillLines}\n\nPROJECT FILES:\n${files || '(none found)'}\n\nDRAFT PROMPT:\n${text}`,
      maxTokens: 2048,
      timeoutMs: 90_000,
    })

    if (!result.isAnswered) {
      const message = failure(result)
      await setPolish($, { kind: 'error', message })
      return
    }

    const rewritten = result.text.trim()
    const filled = await $.prompt.fill({ text: rewritten, mode: 'replace' })
    await setPolish($, filled.isFilled ? { kind: 'filled' } : { kind: 'proposed', text: rewritten })
  } catch (error) {
    const message = `Enhance failed: ${error instanceof Error ? error.message : String(error)}`
    await setPolish($, { kind: 'error', message })
  }
}

async function sendDraft($: EngineInterface): Promise<void> {
  const { text } = await $.prompt.read()
  if (text.trim() === '') {
    $.ui.toast('Nothing to send: the prompt box is empty.')
    return
  }
  await $.prompt.fill({ text: '', mode: 'replace' })
  await setPolish($, { kind: 'idle' })
  await $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a prompt with skills, questions to ask first, acceptance criteria and project context',
      argumentHint: '[prompt]',
    })

    return next(e)
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const draft = e.args.trim() !== '' ? e.args : (await $.prompt.read()).text
    void enhance($, draft)

    return { text: 'prompt-polish: enhancing with haiku; the result lands in the prompt box.' }
  })

  // A click on the animated label: it posts, this presses Enhance.
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'enhance-label') return next(e)
    if ((await read($, polish)).kind !== 'busy') await enhance($, (await $.prompt.read()).text)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const state = await read($, polish)
    const isBusy = state.kind === 'busy'

    const onEnhance = async () => enhance($, (await $.prompt.read()).text)
    const onDismiss = () => setPolish($, { kind: 'idle' })
    const onUse = async () => {
      if (state.kind !== 'proposed') return
      await setPolish($, { kind: 'idle' })
      await $.prompt.submit({ text: state.text, asUser: true })
    }

    return (
      <Box flexDirection="column">
        <Box>
          {'Client' in els ? (
            <els.Client key="enhance-label" module="./label.tsx" props={{ isBusy, text: WHITE, ramp: RAMP }} />
          ) : (
            <Button key="enhance" plain onPress={isBusy ? () => {} : onEnhance}>
              <Text color={WHITE} bold>En</Text>
              <Text color={RAMP[0]} bold>{isBusy ? 'hancing' : 'hance'}</Text>
            </Button>
          )}
          <Text dimColor>  ·  </Text>
          <Button key="send" plain dimColor onPress={() => sendDraft($)}>► Send</Button>
          <Text>   </Text>
          {state.kind === 'busy' && <Text dimColor italic>rewriting with haiku…</Text>}
          {state.kind === 'filled' && <Text color="green">✓ enhanced, edit it then Enter or Send</Text>}
          {state.kind === 'error' && <Text color="red">✗ {state.message}</Text>}
          {state.kind === 'error' && <Text dimColor>  ·  </Text>}
          {state.kind === 'error' && <Button key="dismiss" plain dimColor hotkey="d" onPress={onDismiss}>Dismiss</Button>}
        </Box>
        {state.kind === 'proposed' && (
          <Box flexDirection="column">
            <Text dimColor>{state.text}</Text>
            <Box>
              <Button key="use" plain hotkey="u" onPress={onUse}><Text color="magenta" bold>Use this</Text></Button>
              <Text dimColor>  ·  </Text>
              <Button key="dismiss" plain dimColor hotkey="d" onPress={onDismiss}>Dismiss</Button>
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
