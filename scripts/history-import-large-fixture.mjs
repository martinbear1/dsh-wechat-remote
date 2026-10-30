// Generated, non-personal DeepSeek envelope. Never imports a real share or profile.
export function largeShareFixture(targetMiB = 13, rounds = 1386) {
  const messages = []
  for (let round = 1; round <= rounds; round++) {
    const id = round * 2 - 1
    messages.push({ message_id: id, parent_id: id === 1 ? null : id - 1, role: 'USER', model: 'deepseek-chat',
      fragments: [{ type: 'REQUEST', content: `合成提问 Q-${round}，中文、空格  和表情 🌊。` }] })
    messages.push({ message_id: id + 1, parent_id: id, role: 'ASSISTANT', model: 'deepseek-reasoner',
      fragments: [{ type: 'THINK', content: `合成公开思考 ${round}` }, { type: 'RESPONSE', content: `合成回答 A-${round}。` }] })
  }
  const value = { code: 0, data: { biz_code: 0, biz_data: { title: 'Synthetic long-share fixture', messages } } }
  const extra = Math.max(0, Math.floor((targetMiB * 1024 * 1024 - Buffer.byteLength(JSON.stringify(value))) / rounds / 3))
  for (const message of messages) if (message.role === 'ASSISTANT') message.fragments[1].content += '测'.repeat(extra)
  return Buffer.from(JSON.stringify(value))
}
/** Same-sized official-shaped published selection with omitted parents,
 * repeated roots and alternative answers. Bodies are entirely synthetic. */
export function fragmentedShareFixture(targetMiB = 13, rounds = 1386) {
  const value = JSON.parse(largeShareFixture(targetMiB, rounds).toString())
  const messages = value.data.biz_data.messages
  for (const [index, message] of messages.entries()) {
    if (index % 97 === 0) message.parent_id = 900000 + index
    else if (index % 113 === 0) message.parent_id = null
    else if (index > 2 && index % 79 === 0) message.parent_id = messages[index - 2].message_id
  }
  return Buffer.from(JSON.stringify(value))
}
