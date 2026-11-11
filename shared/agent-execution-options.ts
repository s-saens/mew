export type AgentExecutionOptions = { build: boolean; deploy: boolean }

export function isAgentExecutionOptions(value: unknown): value is AgentExecutionOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const options = value as Record<string, unknown>
  return Object.keys(options).length === 2 && typeof options.build === 'boolean' && typeof options.deploy === 'boolean'
}

export function agentExecutionOptionsText(options: AgentExecutionOptions): string {
  return [
    'Execution choices for this request:',
    'These choices are explicit user instructions for this request and override older saved project or Mew guidance that requires or forbids builds or deployment. Latest explicit user instructions take precedence. Preserve saved guidance without rewriting it merely to apply these request choices.',
    options.build
      ? "Build is on. Run the project build after implementation changes before reporting completion, following the generated build verification details when available and the project's documented build command. This choice authorizes that build despite older saved build prohibitions. If no build system exists, report verification as not applicable."
      : 'Build is off. Do not run the project build for this request, including when older saved guidance requires one.',
    options.deploy
      ? "Deployment is on. The user authorizes deployment of the completed changes using the project's documented workflow. Verify the configured deployment target and available credentials, complete applicable verification, then deploy; do not ask again merely because older saved guidance forbids deployment. Report actual blockers and do not claim deployment succeeded without verifying its result."
      : 'Deployment is off. Do not deploy changes or perform deployment-related launcher or server lifecycle operations for this request.',
    'Other project requirements and applicable tests, type checks, lint, and documentation checks remain in effect. Separate restrictions on the Mew launcher and server start, stop, or restart operations remain in effect unless the user explicitly authorizes those operations.',
  ].join('\n')
}
