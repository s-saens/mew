import test from 'node:test'
import assert from 'node:assert/strict'
import { agentExecutionOptionsText, isAgentExecutionOptions } from '../shared/agent-execution-options.ts'

test('execution choices require exactly two boolean options', () => {
  for (const value of [undefined, null, [], {}, { build: true }, { build: 'true', deploy: false }, { build: true, deploy: 1 }, { build: true, deploy: false, command: 'deploy' }]) {
    assert.equal(isAgentExecutionOptions(value), false, JSON.stringify(value))
  }
  for (const build of [true, false]) for (const deploy of [true, false]) assert.equal(isAgentExecutionOptions({ build, deploy }), true)
})

test('execution choices override saved build and deployment rules for this request', () => {
  const off = agentExecutionOptionsText({ build: false, deploy: false })
  assert.match(off, /Build is off\. Do not run the project build for this request/)
  assert.match(off, /Do not deploy changes/)
  const on = agentExecutionOptionsText({ build: true, deploy: true })
  assert.match(on, /Run the project build after implementation changes/)
  assert.match(on, /The user authorizes deployment of the completed changes using the project's documented workflow/)
  for (const text of [off, on]) {
    assert.match(text, /override older saved project or Mew guidance that requires or forbids builds or deployment/)
    assert.match(text, /Latest explicit user instructions take precedence/)
    assert.match(text, /applicable tests, type checks, lint, and documentation checks remain in effect/)
    assert.match(text, /Separate restrictions on the Mew launcher and server start, stop, or restart operations remain in effect/)
    assert.doesNotMatch(text, /Mandatory project build requirements still apply|does not override explicit user or project prohibitions/)
  }
  assert.match(on, /Verify the configured deployment target and available credentials/)
  assert.match(on, /do not ask again merely because older saved guidance forbids deployment/)
})
