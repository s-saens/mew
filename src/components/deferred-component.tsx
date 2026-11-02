import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { PanelLoading } from './startup-screen'

/** Keep a tool's download inside its own boundary so the workspace stays usable. */
export function deferredComponent<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>, fallback: ReactNode = <PanelLoading />, options: { suspend?: boolean; prepared?: () => ComponentType<Props> | undefined } = {}) {
  if (options.suspend === false) return function PreparedComponent(props: Props) {
    const [prepared, setPrepared] = useState<{ Component: ComponentType<Props> } | { error: unknown } | undefined>(() => {
      const Component = options.prepared?.()
      return Component ? { Component } : undefined
    })
    useEffect(() => {
      let active = true
      void load().then(module => { if (active) setPrepared(previous => previous && 'Component' in previous && previous.Component === module.default ? previous : { Component: module.default }) }, error => { if (active) setPrepared({ error }) })
      return () => { active = false }
    }, [])
    if (!prepared) return fallback
    if ('error' in prepared) throw prepared.error
    return <prepared.Component {...props} />
  }
  const Component = lazy(load)
  return function DeferredComponent(props: Props) {
    return <Suspense fallback={fallback}><Component {...props} /></Suspense>
  }
}
