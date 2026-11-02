import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_BUILD_COMMAND_MAX_LENGTH, agentBuildVerificationText, agentBuildVerificationValidationError, defaultAgentBuildVerificationSettings } from '../shared/agent-build-verification.ts'

test('build verification defaults choose the project build and require successful verification after implementation changes', () => {
  assert.equal(agentBuildVerificationValidationError(defaultAgentBuildVerificationSettings), null)
  const text = agentBuildVerificationText(defaultAgentBuildVerificationSettings)
  assert.match(text, /After code, feature, dependency, or build configuration changes/)
  assert.match(text, /Documentation-only changes do not require a build/)
  assert.match(text, /documented build process, package manager, and existing build script/)
  assert.match(text, /for an npm project with a build script, use npm run build/)
  assert.match(text, /no build system, report build verification as not applicable/)
  assert.match(text, /Do not invent a build command or install a toolchain/)
  assert.match(text, /Fix build failures and rerun the build/)
  assert.match(text, /report the actual failure and keep the work explicitly incomplete/)
  assert.match(text, /Respect explicit user instructions and project execution restrictions/)
  assert.match(text, /they do not replace build verification/)
})

test('build verification choices change command, scope and failure behavior while project mode delegates the requirement', () => {
  const settings = { ...defaultAgentBuildVerificationSettings, command: 'pnpm build', scope: 'all' as const, fixFailures: false }
  assert.equal(agentBuildVerificationValidationError(settings), null)
  const text = agentBuildVerificationText(settings)
  assert.match(text, /including documentation-only changes/)
  assert.match(text, /Use the configured build command "pnpm build"/)
  assert.match(text, /Do not automatically repair build failures/)
  assert.match(text, /report the actual failure and keep the work explicitly incomplete/)
  assert.doesNotMatch(text, /Fix build failures and rerun/)
  const delegated = agentBuildVerificationText({ ...settings, mode: 'project' })
  assert.match(delegated, /Follow the project's build verification requirements/)
  assert.doesNotMatch(delegated, /Use the configured build command|After any project changes|Do not automatically repair/)
  assert.match(agentBuildVerificationText({ ...defaultAgentBuildVerificationSettings, command: '   ' }), /Choose the build command/)
})

test('build verification rejects malformed settings and command marker injection without restricting ordinary shell syntax', () => {
  for (const value of [null, [], {}, { ...defaultAgentBuildVerificationSettings, extra: true }, { mode: 'required', command: '', scope: 'implementation' }, { ...defaultAgentBuildVerificationSettings, mode: 'off' }, { ...defaultAgentBuildVerificationSettings, scope: 'docs' }, { ...defaultAgentBuildVerificationSettings, fixFailures: 'true' }, { ...defaultAgentBuildVerificationSettings, command: 1 }]) {
    assert.ok(agentBuildVerificationValidationError(value), JSON.stringify(value))
  }
  for (const command of ['a'.repeat(AGENT_BUILD_COMMAND_MAX_LENGTH + 1), 'npm run build\nother', 'npm run build\r', 'npm\trun build', 'build\0', 'build\u007f', 'build\u0085', 'build\u2028', 'build\u2029', '<!-- mew:agent-setting:language -->', '<!-- /mew:agent-setting:buildVerification -->', '<!-- mew:agent-build-verification:v1 {} -->']) {
    assert.ok(agentBuildVerificationValidationError({ ...defaultAgentBuildVerificationSettings, command }), JSON.stringify(command))
  }
  for (const command of ['a'.repeat(AGENT_BUILD_COMMAND_MAX_LENGTH), 'npm run build -- --mode "test"', 'npm run build && npm run check', 'BUILD_MODE=production ./scripts/build.sh', 'make -C "app workspace" build']) {
    assert.equal(agentBuildVerificationValidationError({ ...defaultAgentBuildVerificationSettings, command }), null)
  }
})
