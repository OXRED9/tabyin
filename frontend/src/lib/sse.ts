/**
 * Minimal Server-Sent Events parser for a `fetch` response body.
 *
 * The verify stream is a POST, which `EventSource` cannot do, so frames are parsed by hand:
 * `event: <name>\ndata: <json>\n\n`. Comment lines (`: keep-alive`) and unknown fields are ignored,
 * multi-line `data:` fields are joined with `\n`, and both `\n` and `\r\n` line endings work.
 */

export interface SseFrame {
  event: string
  data: string
}

export function createSseParser(onFrame: (frame: SseFrame) => void) {
  let buffer = ''
  let event = 'message'
  let data: string[] = []

  const dispatch = () => {
    if (data.length > 0) onFrame({ event, data: data.join('\n') })
    event = 'message'
    data = []
  }

  const handleLine = (line: string) => {
    if (line === '') return dispatch()
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        handleLine(line)
      }
    },
    /** Flush a trailing frame that was not terminated by a blank line. */
    end() {
      if (buffer.length > 0) {
        handleLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer)
        buffer = ''
      }
      dispatch()
    },
  }
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = createSseParser(onFrame)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.end()
  } finally {
    reader.releaseLock()
  }
}
