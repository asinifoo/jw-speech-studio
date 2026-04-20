/**
 * Read an SSE stream from a fetch Response and call onEvent for each parsed event.
 */
export async function readSSEStream(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
  if (buffer.startsWith('data: ')) {
    try { onEvent(JSON.parse(buffer.slice(6))); } catch {}
  }
}
