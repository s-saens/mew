import type { CodeSplittingOptions } from 'rolldown'

export const startupCodeSplitting: CodeSplittingOptions = {
  groups: [
    // main starts asynchronously without blocking evaluation of shared startup exports.
    { name: 'startup', tags: ['$initial'], priority: 10 },
    { name: 'authentication', test: /[/\\]src[/\\]AppBootstrap\.tsx$/, priority: 5 },
    // Native authentication and background recovery must not acquire the workspace through tiny shared helpers.
    { name: 'runtime-primitives', test: /[/\\]src[/\\]utils[/\\](?:uuid|recovery-policy)\.ts$/, priority: 5, entriesAware: true },
    { name: 'deferred-primitives', test: /[/\\](?:packages[/\\]ui[/\\]src[/\\]keepFocusOnPress\.ts|node_modules[/\\]lib0[/\\]eventloop\.js)$/, priority: 5, entriesAware: true },
    { name: 'workspace', test: /[/\\]src[/\\]App\.tsx$/, priority: 4, includeDependenciesRecursively: true, entriesAware: true, entriesAwareMergeThreshold: 14 * 1024 },
  ],
}
