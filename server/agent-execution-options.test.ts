import test from 'node:test'
import assert from 'node:assert/strict'
import { agentExecutionOptionsText, isAgentExecutionOptions } from '../shared/agent-execution-options.ts'

test('execution choices require exactly two boolean options', () => {
  for (const value of [undefined, null, [], {}, { build: true }, { build: 'true', deploy: false }, { build: true, deploy: 1 }, { build: true, deploy: false, command: 'deploy' }]) {
    assert.equal(isAgentExecutionOptions(value), false, JSON.stringify(value))
  }
  for (const build of [true, false]) for (const deploy of [true, false]) assert.equal(isAgentExecutionOptions({ build, deploy }), true)
})

test('execution choices retain project requirements and deployment prohibitions', () => {
  const off = agentExecutionOptionsText({ build: false, deploy: false })
  assert.match(off, /Mandatory project build requirements still apply/)
  assert.match(off, /Do not deploy changes/)
  const on = agentExecutionOptionsText({ build: true, deploy: true })
  assert.match(on, /Run the project build after implementation changes/)
  assert.match(on, /The user requests deployment of the completed changes using the project's documented workflow/)
  assert.doesNotMatch(on, /only when authorized by the user/)
  assert.match(on, /does not override explicit user or project prohibitions/)
  assert.match(on, /applicable tests, type checks, lint, and documentation checks remain in effect/)
})
