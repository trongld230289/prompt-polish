// The Enhance label, glancedeck style: "En" in white, a cyan ramp rolling through "hance", the diamond breathing.
// Idle, it plays three breaths then rests, once every 30 s; enhancing, it plays without rest. Hovered, the word
// is underlined and the band is told, so it can say what a click does on the line below; a click presses it.
import type { ClientModule } from 'claude-code'

type Props = { isBusy: boolean; text: string; ramp: string[] }
type State = { ticks: number; isBusy: boolean; isHover: boolean }

const STEP_MS = 400
// All in Consolas: one cell each, nothing borrowed from a fallback font.
const BREATH = ['♦', '◊', '·', '◊']
// Three breaths, then still until the 30 s period comes round.
const PLAY = BREATH.length * 3
const PERIOD = 30_000 / STEP_MS

const Label: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state ?? { ticks: 0, isBusy: props.isBusy, isHover: false }
  // The clock below reads this, not the props it first saw.
  ref.isBusy = props.isBusy
  if (surface.state === undefined) {
    surface.setState(ref)
    surface.every(STEP_MS, () => {
      ref.ticks += 1
      // Resting, nothing changes on screen, so nothing is redrawn.
      if (ref.isBusy || ref.ticks % PERIOD <= PLAY) surface.setState(ref)
    })
    surface.onPointer(e => {
      if (e.type === 'up' && e.button === 'left') surface.post({ press: 'enhance' })
      // Under the pointer the word is underlined, and the band draws the hint on its status line.
      if (e.type === 'enter' && !ref.isHover) {
        ref.isHover = true
        surface.setState(ref)
        surface.post({ hover: true })
      }
      if (e.type === 'leave') {
        ref.isHover = false
        surface.setState(ref)
        surface.post({ hover: false })
      }
    })
  }
  const step = ref.ticks % PERIOD
  const isMoving = props.isBusy || step < PLAY
  const tick = isMoving ? (props.isBusy ? ref.ticks : step) : 0
  const lead = props.ramp[0] ?? props.text
  const n = Math.max(1, props.ramp.length)
  const hue = (i: number) => (isMoving ? (props.ramp[(((i - tick) % n) + n) % n] ?? lead) : lead)
  const word = props.isBusy ? 'Enhancing' : 'Enhance'

  return (
    <Text wrap="truncate">
      <Text color={lead}>{`${isMoving ? BREATH[tick % BREATH.length] : '♦'} `}</Text>
      <Text bold underline={ref.isHover} color={props.text}>
        En
      </Text>
      {[...word.slice(2)].map((ch, i) => (
        <Text key={String(i)} bold underline={ref.isHover} color={hue(i)}>
          {ch}
        </Text>
      ))}
    </Text>
  )
}

export default Label
