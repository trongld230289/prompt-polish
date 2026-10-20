import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register, Timer } from 'claude-code'

import type { Cleared, Polish, Recent, Warm } from '../types'

const polish = atom({ plugin: 'promptdeck', key: 'polish' } as const, { kind: 'idle' } as Polish)
const warm = atom({ plugin: 'promptdeck', key: 'warm' } as const, { kind: 'off' } as Warm)
// The draft a press took out of the box (Clear, or Enhance's rewrite over it), for the Undo / Original button.
const clearedDraft = atom({ plugin: 'promptdeck', key: 'cleared' } as const, { text: '', why: 'clear' } as Cleared)
// What just happened in the session, so Enhance can turn "fix it" into the concrete thing.
const recent = atom({ plugin: 'promptdeck', key: 'recent' } as const, { prompt: '', answer: '' } as Recent)

// The subscription prompt cache lives about an hour from its last use: a ping 50 minutes after the last turn reads
// it (cheap) and so keeps it, where the first prompt after a cold cache writes the whole conversation again.
const WARM_INTERVAL_MS = 50 * 60_000
const WARM_DEFAULT = 6
const WARM_MAX = 48
// vi-voice knows this mark and stays silent for the ping and its answer.
const PING ='[keepwarm] Cache keep-alive ping while I am away. Do nothing, use no tools, reply with just: ok'
const WARM_COUNT_KEY = 'warmCount'
// How long the "✓ enhanced" line stays.
const FILLED_MS = 5_000

const CONTEXT_FILES = ['CLAUDE.md', 'README.md', 'package.json']
const FILE_CAP = 4000
const SKILL_CAP = 200
// How many skills reach haiku: the ones whose name or description shares words with the draft, best first.
const SKILL_PICK = 25
// What of the session rides along: the person's last prompt, Claude's last answer, the git state.
const PROMPT_CAP = 600
const ANSWER_CAP = 1500
const GIT_LINES = 30
// glancedeck's wordmark colours: white text, the cyan ramp that rolls through "deck".
const WHITE = '#E6E8EE'
const RAMP = ['#5EE6E6', '#3BB0B3', '#167A80']
const WARM = '#F2A65A'
const ROSE = '#F26D7D'

const SYSTEM = `You rewrite a developer's draft prompt for Claude Code, an AI coding agent, so Claude does the right thing on the first try. Output ONLY the rewritten prompt, nothing before or after it.

Size it to the draft:
- No real request in the draft (a number, a stray word, a test): reply with ONE short question asking what they want. Nothing else.
- A small, clear task ("rename X to Y", "fix the typo in the README"): 1 to 3 sentences. No headings, no lists.
- A real feature, bug or refactor: at most 10 lines. The task in 1 or 2 sentences, then only the sections that add something, each a short headed list in the draft's language:
  "Ask me first": at most 2 questions, only where the draft is truly ambiguous.
  "Done when": at most 3 checks.
  "Use": skills from AVAILABLE SKILLS that genuinely fit, by exact name. Omit if none.
Never pad a section to fill it. Omit any section with nothing to say. Fewer words beat more.

Keep:
- The draft's language: Vietnamese stays Vietnamese, English stays English. File names, code and skill names as written.
- The person's intent and every concrete detail they gave. Add nothing they did not imply.
- Their voice: the person speaking to Claude ("Fix...", "Add..."), not a specification.

Use the context:
- SESSION says what Claude just did and which files are in play. Turn vague references ("that", "the bug", "it", "cái đó") into the concrete file, function or change they mean. If SESSION is empty, leave the reference as it is.
- PROJECT gives the stack, commands and conventions. Mention one only when it changes how the task should be done.

Examples:
Draft: fix it
Session: Claude just moved the Clear button into a Box with flexShrink 0 in hooks/register.tsx; the band still wraps when the error shows.
Rewrite: Fix the band in hooks/register.tsx so it stays on one line when the error text shows: the status Box should give way and truncate before the Clear button does. Run the plugin tests after.

Draft: thêm dark mode
Rewrite: Thêm dark mode cho app.
Hỏi trước: theo system setting hay có toggle riêng? Lưu lựa chọn ở đâu?
Xong khi: mọi màn hình đọc được ở cả 2 theme; toggle giữ trạng thái sau khi reload.`

type Skill = { name: string; description: string }

function setPolish($: EngineInterface, next: Polish): Promise<Polish> {
  return update($, polish, () => next)
}

async function listSkills($: EngineInterface): Promise<Skill[]> {
  try {
    const commands = await $.command.list()

    return commands
      .filter(c => c.source === 'plugin' || c.source === 'user')
      .filter(c => c.plugin !== 'promptdeck')
      .slice(0, SKILL_CAP)
      .map(c => ({ name: c.name, description: c.description.slice(0, 160) }))
  } catch {
    return []
  }
}

/** The words of a text worth matching on: letters and digits, lowercased, three characters or more. */
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3))
}

/** The skills nearest the draft: those sharing words with it first, by how many, then the list's own order. */
export function pickSkills(skills: Skill[], draft: string, limit = SKILL_PICK): Skill[] {
  const wanted = words(draft)
  const scored = skills.map((skill, i) => {
    const own = words(`${skill.name} ${skill.description}`)
    let score = 0
    for (const w of wanted) if (own.has(w)) score += 1
    return { skill, score, i }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)

  return scored.slice(0, limit).map(s => s.skill)
}

/** The branch and the changed files, as `git` says them; '' outside a repository or when git is not there. */
async function readGit($: EngineInterface): Promise<string> {
  try {
    const [branch, status] = await Promise.all([
      $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 5_000 }),
      $.process.run(['git', 'status', '--short'], { timeoutMs: 5_000 }),
    ])
    if (branch.exitCode !== 0 && status.exitCode !== 0) return ''
    const lines = status.stdout.trim().split('\n').filter(l => l !== '')
    const shown = lines.slice(0, GIT_LINES).join('\n') + (lines.length > GIT_LINES ? `\n[... ${lines.length - GIT_LINES} more]` : '')

    return `Branch: ${branch.stdout.trim() || '(none)'}\nChanged files:\n${shown || '(clean)'}`
  } catch {
    return ''
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
    await setPolish($, { kind: 'error', message: 'type a prompt first' })
    return
  }
  if ((await read($, polish)).kind === 'busy') {
    return
  }
  await setPolish($, { kind: 'busy' })

  try {
    const [skills, files, git, last] = await Promise.all([listSkills($), readProjectFiles($), readGit($), read($, recent)])
    const picked = pickSkills(skills, text)
    const skillLines = picked.length === 0
      ? '(none listed)'
      : picked.map(s => `- ${s.name}: ${s.description}`).join('\n')
    const session = [
      git,
      last.prompt ? `The person's last prompt:\n${last.prompt}` : '',
      last.answer ? `Claude's last answer (cut):\n${last.answer}` : '',
    ].filter(part => part !== '').join('\n\n')

    const result = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: `SESSION:\n${session || '(nothing yet)'}\n\nPROJECT:\n${files || '(none found)'}\n\nAVAILABLE SKILLS:\n${skillLines}\n\nDRAFT PROMPT:\n${text}`,
      maxTokens: 1024,
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
    if (filled.isFilled) {
      // The draft the rewrite replaced, one press away; and the "enhanced" line says its piece and goes.
      await update($, clearedDraft, () => ({ text, why: 'enhance' }))
      $.clock.after(FILLED_MS, () => void update($, polish, p => (p.kind === 'filled' ? { kind: 'idle' } : p)))
    }
  } catch (error) {
    const message = `Enhance failed: ${error instanceof Error ? error.message : String(error)}`
    await setPolish($, { kind: 'error', message })
  }
}

// ---------------------------------------------------------------- keepwarm

// The module's own: a reload starts them over, and session.start sets them again from the warm atom.
let pingTimer: Timer | null = null
let minuteTimer: Timer | null = null

function setWarm($: EngineInterface, next: Warm): Promise<Warm> {
  return update($, warm, () => next)
}

/** How many pings the person asked for last time, on any session. */
async function lastCount($: EngineInterface): Promise<number> {
  let n = NaN
  try {
    n = Number(await $.store.get(WARM_COUNT_KEY))
  } catch {
    // no store here: the default
  }

  return Number.isInteger(n) && n >= 1 && n <= WARM_MAX ? n : WARM_DEFAULT
}

/** The ask's text as a ping count, or null when it is not a whole number from 1 to WARM_MAX. */
function parseCount(text: string): number | null {
  const n = Number(text.trim())
  return Number.isInteger(n) && n >= 1 && n <= WARM_MAX ? n : null
}

function stopTimers() {
  pingTimer?.cancel()
  pingTimer = null
  minuteTimer?.cancel()
  minuteTimer = null
}

async function stopWarm($: EngineInterface, why?: string) {
  stopTimers()
  await setWarm($, { kind: 'off' })
  if (why) $.ui.toast(`promptdeck: keepwarm off: ${why}.`)
}

/** Sets the ping timer for `nextAt`, and a minute tick so the band's countdown moves. */
async function arm($: EngineInterface, w: Extract<Warm, { kind: 'on' }>) {
  stopTimers()
  const now = await $.clock.now()
  pingTimer = $.clock.after(Math.max(1000, w.nextAt - now), () => void ping($))
  minuteTimer = $.clock.every(60_000, () => void update($, warm, x => (x.kind === 'on' ? { ...x } : x)))
}

/**
 * The first ping goes at once: the last turn may have ended long ago, and a ping that waits a full interval
 * from the press could land after the cache has gone. The ones after it are timed from each turn's end.
 */
async function startWarm($: EngineInterface, total: number) {
  await $.store.set(WARM_COUNT_KEY, total)
  await setWarm($, { kind: 'on', total, sent: 0, nextAt: await $.clock.now() })
  await ping($)
}

/** True when the 5-hour window is spent and has not reset: a ping would be refused anyway. */
async function isOutOfUsage($: EngineInterface): Promise<boolean> {
  const u = await $.session.usage().catch(() => null)
  const w = u?.rateLimits.find(l => l.kind === 'five_hour')
  if (!w || w.percentUsed < 100) return false
  const resetsAt = w.resetsAt ? Date.parse(w.resetsAt) : NaN

  return !Number.isFinite(resetsAt) || (await $.clock.now()) < resetsAt
}

async function ping($: EngineInterface) {
  const w = await read($, warm)
  if (w.kind !== 'on') return
  if (await isOutOfUsage($)) {
    await stopWarm($, 'the 5-hour usage limit is reached')
    return
  }
  const sent = w.sent + 1
  // The next ping is timed from this ping's turn end (turn.complete); until then, a fallback a full interval away.
  const later: Warm = { ...w, sent, nextAt: (await $.clock.now()) + WARM_INTERVAL_MS }
  await setWarm($, later)
  if (sent >= w.total) stopTimers()
  else await arm($, later)
  // A plugin's prompt waits for the session to be idle; not seen by this plugin's own prompt.submit hook.
  await $.prompt.submit({ text: PING, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a prompt with skills, questions to ask first, acceptance criteria and project context',
      argumentHint: '[prompt]',
    })
    // A hot reload drops the module's timers; a keepwarm still on picks its schedule up again.
    const w = await read($, warm)
    if (w.kind === 'on') await arm($, w)

    return next(e)
  })

  // The person is back: whatever they send ends keepwarm. This plugin's own ping never reaches its own hook.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') {
      if ((await read($, warm)).kind === 'on') await stopWarm($)
      // A sent prompt is the newest context for the next Enhance, and nothing of it is left to put back.
      await update($, recent, r => ({ ...r, prompt: e.text.slice(0, PROMPT_CAP) }))
      await update($, clearedDraft, () => ({ text: '', why: 'clear' }))
    }

    return next(e)
  })

  // The cache lives from the last use: time the next ping from the end of the last turn, ping or not.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // The main loop's answer is what "it" and "that" in the next draft refer to.
    // A keepwarm ping's "ok" is not context; anything longer is.
    if (!e.agentId && typeof e.answer === 'string' && e.answer.trim().length > 4) {
      await update($, recent, r => ({ ...r, answer: e.answer.slice(0, ANSWER_CAP) }))
    }
    const w = await read($, warm)
    if (!e.agentId && w.kind === 'on') {
      if (w.sent >= w.total) {
        await stopWarm($, `${w.total} ping${w.total === 1 ? '' : 's'} sent`)
      } else {
        const later: Warm = { ...w, nextAt: (await $.clock.now()) + WARM_INTERVAL_MS }
        await setWarm($, later)
        await arm($, later)
      }
    }

    return done
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const draft = e.args.trim() !== '' ? e.args : (await $.prompt.read()).text
    void enhance($, draft)

    return { text: 'promptdeck: enhancing with haiku; the result lands in the prompt box.' }
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
    // Clear empties the box and keeps the draft; Undo puts that draft back (the engine's ctrl+_ undo is not
    // reachable from a mod, so the band keeps its own one step).
    const cleared = await read($, clearedDraft)
    const onClear = async () => {
      const { text } = await $.prompt.read()
      if (text === '') return
      const { isFilled } = await $.prompt.fill({ text: '', mode: 'replace' })
      if (isFilled) await update($, clearedDraft, () => ({ text, why: 'clear' }))
    }
    const onUndo = async () => {
      if (cleared.text === '') return
      const { isFilled } = await $.prompt.fill({ text: cleared.text, mode: 'replace' })
      if (isFilled) await update($, clearedDraft, () => ({ text: '', why: 'clear' }))
    }
    const onUse = async () => {
      if (state.kind !== 'proposed') return
      await setPolish($, { kind: 'idle' })
      await $.prompt.submit({ text: state.text, asUser: true })
    }

    const w = await read($, warm)
    const now = w.kind === 'on' ? await $.clock.now() : 0
    const count = w.kind === 'asking' ? await lastCount($) : WARM_DEFAULT
    const onAsk = async () => ('Input' in els ? setWarm($, { kind: 'asking' }) : startWarm($, await lastCount($)))
    const onCount = (text: string) => {
      const n = parseCount(text)
      if (n === null) {
        $.ui.toast(`promptdeck: type a whole number of pings from 1 to ${WARM_MAX}.`)
        return
      }
      void startWarm($, n)
    }
    const keepwarm =
      w.kind === 'asking' && 'Input' in els ? (
        <Box key="warm-ask">
          <els.Input
            key="warm-count"
            label="pings, one per 50 min: "
            value={String(count)}
            submitLabel="start"
            autoFocus
            onSubmit={onCount}
          />
          <Text dimColor>  ·  </Text>
          <Button key="warm-cancel" plain dimColor hotkey="c" onPress={() => setWarm($, { kind: 'off' })}>Cancel</Button>
        </Box>
      ) : w.kind === 'on' ? (
        <Button key="keepwarm" plain onPress={() => stopWarm($)}>
          <Text color={WARM} bold>☼ Warm</Text>
          <Text color={WARM}>{` ${w.sent}/${w.total}`}</Text>
          <Text dimColor>
            {w.sent >= w.total ? ' · last ping' : ` · ping in ${Math.max(1, Math.ceil((w.nextAt - now) / 60_000))}m`}
          </Text>
        </Button>
      ) : (
        <Button key="keepwarm" plain onPress={onAsk}>
          <Text color={WHITE} bold>☼ Keep</Text>
          <Text color={WARM} bold>warm</Text>
        </Button>
      )

    return (
      <Box flexDirection="column">
        <Box>
          {keepwarm}
          <Text>   </Text>
          {/* Only the terminal: Claude Desktop's Client shell does not start for it, and says so in a band. */}
          {e.surface === 'terminal' && 'Client' in els ? (
            <els.Client key="enhance-label" module="./label.tsx" props={{ isBusy, isQuiet: state.kind !== 'idle', text: WHITE, ramp: RAMP }} />
          ) : (
            <Button key="enhance" plain onPress={isBusy ? () => {} : onEnhance}>
              <Text color={WHITE} bold>En</Text>
              <Text color={RAMP[0]} bold>{isBusy ? 'hancing' : 'hance'}</Text>
            </Button>
          )}
          {/* The status takes the room between the buttons and gives way first: one line, cut at its end, never wrapped. */}
          <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={3}>
            {state.kind === 'busy' && <Text dimColor italic wrap="truncate-end">rewriting with haiku…</Text>}
            {state.kind === 'filled' && <Text color="green" wrap="truncate-end">✓ enhanced, edit it then press Enter</Text>}
            {state.kind === 'error' && <Text color="red" wrap="truncate-end">✗ {state.message}</Text>}
            {state.kind === 'error' && <Text dimColor> · </Text>}
            {state.kind === 'error' && <Button key="dismiss" plain dimColor hotkey="d" onPress={onDismiss}>Dismiss</Button>}
          </Box>
          {/* Clear and Undo keep their place at the band's right edge. */}
          <Box flexShrink={0} marginLeft={3}>
            <Button key="clear" plain onPress={onClear}>
              <Text color={ROSE} bold hover={{ scope: 'clear', underline: true }}>×</Text>
              <Text color={WHITE} bold hover={{ scope: 'clear', underline: true }}> Clear</Text>
            </Button>
            {cleared.text !== '' && <Text>   </Text>}
            {cleared.text !== '' && (
              <Button key="undo" plain onPress={onUndo}>
                <Text color={WARM} bold hover={{ scope: 'undo', underline: true }}>«</Text>
                <Text color={WHITE} bold hover={{ scope: 'undo', underline: true }}>{cleared.why === 'enhance' ? ' Original' : ' Undo'}</Text>
              </Button>
            )}
            <Text> </Text>
          </Box>
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
