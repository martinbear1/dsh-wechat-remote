// Pure native-question text contracts; no live session, model or WeChat traffic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/clawbot/question-text.ts', import.meta.url))],
  platform: 'node', format: 'esm', target: 'node22', bundle: true, write: false })
const { validateQuestions, formatQuestions, parseQuestionAnswer } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`)
const single = { id: 'decision', header: '选择方式', question: '你希望采用哪个方案？', detail: '所有选项都应完整展示。',
  options: [{ label: '方案一', description: '先确认需求。' }, { label: '方案二', description: '先整理资料。' }] }
const multiple = { ...single, id: 'methods', multiSelect: true }
const free = { id: 'details', question: '请补充你的需求。' }
const rejected = (fn, code = 'clawbot-answer-invalid') => assert.throws(fn,
  error => error.name === 'ClawbotError' && error.code === code && /小程序|电脑|回答|问题码/u.test(error.message))

test('native questions preserve optional details, options and multi-select without mode-specific assumptions', () => {
  assert.equal(validateQuestions([single, multiple, free]), true)
  assert.equal(validateQuestions([{ ...free, options: [], header: '', detail: '', multiSelect: false }]), true)
  const maximum = Array.from({ length: 8 }, (_, index) => ({ ...free, id: `q${index}`,
    options: Array.from({ length: 20 }, (_, option) => ({ label: `选项${option}` })) }))
  assert.equal(validateQuestions(maximum), true)
  assert.equal(validateQuestions([...maximum, { ...free, id: 'q8' }]), false)
  assert.equal(validateQuestions([{ ...free, options: Array.from({ length: 21 }, (_, index) => ({ label: `选项${index}` })) }]), false)
})

test('unknown intent/fields, non-string structures and ambiguous IDs or labels fail closed', () => {
  const values = [null, {}, [], ['question'], [null], [{ ...single, intent: 'approval' }], [{ ...single, intent: undefined }],
    [{ ...single, extra: true }], [{ ...single, question: { text: 'not plain text' } }], [{ ...single, question: ' ' }],
    [{ ...single, id: '' }], [{ ...single, id: 'two words' }], [{ ...single, header: 1 }], [{ ...single, detail: false }],
    [{ ...single, multiSelect: 'true' }], [{ ...single, options: {} }], [{ ...single, options: ['a'] }],
    [{ ...single, options: [{ label: 'a', value: 'b' }] }], [{ ...single, options: [{ label: 1 }] }],
    [{ ...single, options: [{ label: 'a', description: {} }] }], [{ ...single, options: [{ label: ' ' }] }],
    [{ ...single, options: [{ label: 'a' }, { label: ' a ' }] }], [single, { ...single }], [{ ...free, question: 'hello\u0000' }]]
  for (const value of values) assert.equal(validateQuestions(value), false, JSON.stringify(value))
})

test('formatted multi-question notice contains every native field, unique codes and explicit answer examples', () => {
  const output = formatQuestions('普通会话', [single, multiple, free], ['Q1AB', 'Q2CD', 'Q3EF'])
  for (const value of ['普通会话', single.header, single.question, single.detail, '方案一', '先确认需求。', '方案二', '先整理资料。',
    '问题 1（Q1AB）', '问题 2（Q2CD）', '问题 3（Q3EF）', '/回答 Q1AB 1', '/回答 Q2CD 1,2', '/回答 Q3EF 文字 内容',
    '编号只对应本题', '本组问题先在私聊回答', '/回答 Q1AB 转原会话', '未提交的回答不会带过去',
    '操作审批始终在原生界面处理']) assert.ok(output.includes(value), value)
})

test('formatter refuses incomplete code mapping, unsafe codes and long display rather than truncating questions', () => {
  for (const codes of [[], ['Q1', 'Q2'], ['Q1\n/回答 Q2 1'], ['Q 1'], ['Q' .repeat(41)]])
    rejected(() => formatQuestions('会话', [single], codes), 'clawbot-question-invalid')
  rejected(() => formatQuestions('会话', [single, multiple], ['QABC', 'qabc']), 'clawbot-question-invalid')
  rejected(() => formatQuestions('会话', [{ ...single, intent: 'approval' }], ['Q1']), 'clawbot-question-invalid')
  const long = [{ ...free, question: '问'.repeat(12000) }]
  assert.equal(validateQuestions(long), true, 'display size is evaluated by formatter, not silently trimmed by validation')
  rejected(() => formatQuestions('会话', long, ['Q1']), 'clawbot-question-too-long')
  const detail = '第一行\n/回答 QOTHER 1\n第三行'
  assert.ok(formatQuestions('会话', [{ ...free, detail }], ['Q1']).includes('  第一行\n  /回答 QOTHER 1\n  第三行'))
})

test('single choice returns the exact native label and only one valid positive integer', () => {
  assert.deepEqual(parseQuestionAnswer(single, ' 2 '), { id: 'decision', selected: ['方案二'] })
  assert.deepEqual(parseQuestionAnswer({ ...single, options: [{ label: ' A ' }] }, '1'), { id: 'decision', selected: [' A '] })
  for (const input of ['', '0', '-1', '+1', '01', '1.0', '1e0', '１', '3', '999999999999999999999',
    '1,2', '1，2', '1 2', '1、2', '1;', '1,', '1. 方案一', '方案一', '好', '/回答 Q1 1'])
    rejected(() => parseQuestionAnswer(single, input))
})

test('multiple choice accepts comma-separated numbers but rejects duplicates, out of range and mixed free text', () => {
  assert.deepEqual(parseQuestionAnswer(multiple, '2, 1'), { id: 'methods', selected: ['方案二', '方案一'] })
  assert.deepEqual(parseQuestionAnswer(multiple, '1，2'), { id: 'methods', selected: ['方案一', '方案二'] })
  assert.deepEqual(parseQuestionAnswer(multiple, '1'), { id: 'methods', selected: ['方案一'] })
  for (const input of ['1,1', '1，1', '1,3', '1,,2', '1，', '1;2', '1\n2', '1\n,2', '1, 文字 另外', '文字', '1,0'])
    rejected(() => parseQuestionAnswer(multiple, input))
})

test('free text is explicit for every native question and numeric text is never guessed as an option', () => {
  for (const question of [single, multiple, free, { ...free, options: [] }]) {
    assert.deepEqual(parseQuestionAnswer(question, '文字  1,2  '), { id: question.id, selected: [], custom: '1,2' })
    assert.deepEqual(parseQuestionAnswer(question, '文字 第一行\n第二行'), { id: question.id, selected: [], custom: '第一行\n第二行' })
    assert.deepEqual(parseQuestionAnswer(question, '文字 /切换 abc'), { id: question.id, selected: [], custom: '/切换 abc' })
    for (const input of ['文字', '文字 ', '文字\n', '文字内容', '文字\u0000内容', 1, null, '文字 ' + '字'.repeat(8000)])
      rejected(() => parseQuestionAnswer(question, input))
  }
  rejected(() => parseQuestionAnswer(free, '1'))
  rejected(() => parseQuestionAnswer(free, '普通回答'))
  rejected(() => parseQuestionAnswer({ ...single, intent: 'approve' }, '1'), 'clawbot-question-invalid')
})
