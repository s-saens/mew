export type AgentExecutionOptions = { build: boolean; deploy: boolean }

export function isAgentExecutionOptions(value: unknown): value is AgentExecutionOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const options = value as Record<string, unknown>
  return Object.keys(options).length === 2 && typeof options.build === 'boolean' && typeof options.deploy === 'boolean'
}

export function agentExecutionOptionsText(options: AgentExecutionOptions): string {
  return [
    'Execution choices for this request:',
    options.build
      ? "Build is on. Run the project build after implementation changes before reporting completion, following the generated build verification details when available and the project's documented commands and requirements. If no build system exists, report verification as not applicable."
      : 'Build is off. Mew adds no build requirement for this request. Mandatory project build requirements still apply.',
    options.deploy
      ? "Deployment is on. The user requests deployment of the completed changes using the project's documented workflow when allowed by project instructions and existing permissions. This choice does not override explicit user or project prohibitions, or authorize otherwise prohibited launcher or server lifecycle operations."
      : 'Deployment is off. Do not deploy changes or perform deployment-related launcher or server lifecycle operations for this request.',
    'Preserve handwritten guidance. Explicit user instructions, project execution restrictions, and applicable tests, type checks, lint, and documentation checks remain in effect.',
  ].join('\n')
}
