export function splitCodexModelId(modelId: string): { model: string; effort: string | null } {
  const match = /^(.*)\[([^\]]+)\]$/.exec(modelId)
  return match ? { model: match[1], effort: match[2] } : { model: modelId, effort: null }
}

export type ModelOption = { modelId: string; name: string }
export const MODEL_EFFORT_CONFIG_ID = 'mew:model-effort'

export function hasModelEffort(runtime: string) {
  return runtime === 'codex' || runtime === 'antigravity'
}

/** Antigravity IDs are opaque; only advertised effort labels define groups. */
export function splitModelVariant(runtime: string, modelId: string, models: ModelOption[] = []): { model: string; effort: string | null } {
  if (runtime === 'codex') return splitCodexModelId(modelId)
  const item = runtime === 'antigravity' ? models.find(item => item.modelId === modelId) : undefined
  const match = item && /^(.*) \((minimal|low|medium|high|xhigh)\)$/i.exec(item.name)
  return match ? { model: match[1], effort: match[2].toLowerCase() } : { model: modelId, effort: null }
}

export function modelVariantId(runtime: string, models: ModelOption[], model: string, effort: string) {
  return models.find(item => {
    const variant = splitModelVariant(runtime, item.modelId, models)
    return variant.model === model && variant.effort === effort
  })?.modelId
}

/** ACP keeps exact model/effort IDs for execution; the panel selects each axis separately. */
export function panelModelState<T extends { currentModelId: string; availableModels: ModelOption[] }>(runtime: string, models: T | null) {
  if (!hasModelEffort(runtime) || !models) return models
  const availableModels = new Map<string, ModelOption>()
  for (const item of models.availableModels) {
    const { model, effort } = splitModelVariant(runtime, item.modelId, models.availableModels)
    const suffix = ` (${effort})`
    const name = effort && item.name.toLowerCase().endsWith(suffix) ? item.name.slice(0, -suffix.length) : item.name
    if (!availableModels.has(model)) availableModels.set(model, { modelId: model, name })
  }
  return { currentModelId: splitModelVariant(runtime, models.currentModelId, models.availableModels).model, availableModels: [...availableModels.values()] }
}
