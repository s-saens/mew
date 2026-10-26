import { useCallback, useMemo, useState } from 'react'
import { splitModelVariant, hasModelEffort, modelVariantId, MODEL_EFFORT_CONFIG_ID } from '../../shared/codex-models'
import type { ModelState, ModeState, ThinkingState } from '../utils/agentFold'

type Pending = { modelId?: string; thinkingId?: string; modeId?: string }

function resolveModel(runtime: string, models: ModelState, modelId: string, effort?: string) {
  if (!hasModelEffort(runtime) || models.availableModels.some(model => model.modelId === modelId)) return modelId
  const variants = models.availableModels.filter(model => splitModelVariant(runtime, model.modelId, models?.availableModels).model === modelId)
  return (variants.find(model => splitModelVariant(runtime, model.modelId, models?.availableModels).effort === effort)
    ?? variants.find(model => splitModelVariant(runtime, model.modelId, models?.availableModels).effort === 'medium')
    ?? variants[0])?.modelId ?? modelId
}

/** Keep selection feedback independent of ACP latency; server events still own confirmed state. */
export function useAgentControlSelection(runtime: string, confirmedModels: ModelState | null, confirmedModes: ModeState | null, confirmedThinking: ThinkingState | null) {
  const [pending, setPending] = useState<Pending>({})
  const models = useMemo(() => confirmedModels && pending.modelId !== undefined
    ? { ...confirmedModels, currentModelId: pending.modelId } : confirmedModels, [confirmedModels, pending.modelId])
  const modes = useMemo(() => confirmedModes && pending.modeId !== undefined
    ? { ...confirmedModes, currentModeId: pending.modeId } : confirmedModes, [confirmedModes, pending.modeId])
  const thinking = useMemo(() => {
    if (runtime === 'antigravity' && models) {
      const selected = splitModelVariant(runtime, models.currentModelId, models.availableModels)
      if (!selected.effort) return null
      const efforts = [...new Set(models.availableModels.flatMap(item => {
        const variant = splitModelVariant(runtime, item.modelId, models.availableModels)
        return variant.model === selected.model && variant.effort ? [variant.effort] : []
      }))]
      return { configId: MODEL_EFFORT_CONFIG_ID, currentValue: selected.effort,
        options: efforts.map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })) }
    }
    if (!confirmedThinking || (pending.thinkingId === undefined && pending.modelId === undefined)) return confirmedThinking
    let options = confirmedThinking.options
    if (hasModelEffort(runtime) && models) {
      const selectedModel = splitModelVariant(runtime, models.currentModelId, models?.availableModels).model
      const efforts = [...new Set(models.availableModels.flatMap(item => {
        const { model, effort } = splitModelVariant(runtime, item.modelId, models?.availableModels)
        return model === selectedModel && effort ? [effort] : []
      }))]
      if (efforts.length) options = efforts.map(id => confirmedThinking.options.find(option => option.id === id) ?? { id, name: id.charAt(0).toUpperCase() + id.slice(1) })
    }
    return { ...confirmedThinking, currentValue: pending.thinkingId ?? confirmedThinking.currentValue, options }
  }, [confirmedThinking, models, pending.modelId, pending.thinkingId, runtime])
  const selectModel = (modelId: string) => {
    if (!models) return modelId
    const exact = resolveModel(runtime, models, modelId, thinking?.currentValue)
    const effort = hasModelEffort(runtime) ? splitModelVariant(runtime, exact, models?.availableModels).effort : null
    setPending(current => ({ ...current, modelId: exact, ...(effort ? { thinkingId: effort } : {}) }))
    return exact
  }
  const selectThinking = (value: string) => {
    const modelId = models && hasModelEffort(runtime) ? modelVariantId(runtime, models.availableModels, splitModelVariant(runtime, models.currentModelId, models.availableModels).model, value) : undefined
    setPending(current => ({ ...current, thinkingId: value,
      ...(modelId && models?.availableModels.some(model => model.modelId === modelId) ? { modelId } : {}) }))
  }
  const selectMode = (modeId: string) => setPending(current => ({ ...current, modeId }))
  const acknowledge = useCallback((key: keyof Pending, value: string | undefined, available?: string[]) => {
    setPending(current => {
      const selected = current[key]
      if (selected === undefined || selected !== value && (!available || available.includes(selected))) return current
      return { ...current, [key]: undefined,
        ...(key === 'modelId' && selected !== value ? { thinkingId: undefined } : {}) }
    })
  }, [])
  const reset = useCallback(() => setPending(current => Object.values(current).some(value => value !== undefined) ? {} : current), [])
  return { models, modes, thinking, selectModel, selectThinking, selectMode, acknowledge, reset }
}
