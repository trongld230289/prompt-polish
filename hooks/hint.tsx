// The hover hint under the buttons: it types itself out, one character every TYPE_MS, a cursor at its end while it
// goes. The band mounts it while Enhance is under the pointer and drops it after, so each hover types afresh.
import type { ClientModule } from 'claude-code'

type Props = { text: string; color: string; cursor: string }
type State = { typed: number; stop?: () => void }

const TYPE_MS = 18

const Hint: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state ?? { typed: 0 }
  if (surface.state === undefined) {
    surface.setState(ref)
    ref.stop = surface.every(TYPE_MS, () => {
      ref.typed += 1
      if (ref.typed >= props.text.length) ref.stop?.()
      surface.setState(ref)
    })
  }

  return (
    <Text wrap="truncate">
      <Text color={props.color}>{props.text.slice(0, ref.typed)}</Text>
      {ref.typed < props.text.length && <Text color={props.cursor}>▌</Text>}
    </Text>
  )
}

export default Hint
