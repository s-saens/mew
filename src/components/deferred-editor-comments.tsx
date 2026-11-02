import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { useOverlayDismiss } from '@mew/ui'

type Comments = typeof import('./Comments')
let prepared: Comments | undefined
let pending: Promise<Comments> | undefined

function useComments() {
  const [state, setState] = useState<{ module: Comments } | { error: unknown } | null>(() => prepared ? { module: prepared } : null)
  useEffect(() => {
    if (prepared) return
    let active = true
    pending ??= import('./Comments').then(module => { prepared = module; return module }, error => { pending = undefined; throw error })
    void pending.then(module => { if (active) setState({ module }) }, error => { if (active) setState({ error }) })
    return () => { active = false }
  }, [])
  if (state && 'error' in state) throw state.error
  return state && 'module' in state ? state.module : prepared
}

function PreparingPopover({ onClose, outsideIgnore, anchorRef }: Pick<ComponentProps<Comments['CommentPopover']>, 'onClose' | 'outsideIgnore' | 'anchorRef'>) {
  const ref = useRef<HTMLSpanElement>(null)
  // Retain the overlay history guard across annotation → comment download handoffs.
  useOverlayDismiss(onClose, { outside: () => ref.current, outsideIgnore: outsideIgnore ?? (() => anchorRef?.current ?? null) })
  return <span ref={ref} hidden aria-hidden="true" />
}

export function CommentComposer(props: ComponentProps<Comments['CommentComposer']>) {
  const module = useComments()
  return module ? <module.CommentComposer {...props} /> : null
}

export function CommentListPopover(props: ComponentProps<Comments['CommentListPopover']>) {
  const module = useComments()
  return module ? <module.CommentListPopover {...props} /> : <PreparingPopover onClose={props.onClose} outsideIgnore={props.outsideIgnore} anchorRef={props.anchorRef} />
}

export function CommentPopover(props: ComponentProps<Comments['CommentPopover']>) {
  const module = useComments()
  return module ? <module.CommentPopover {...props} /> : <PreparingPopover onClose={props.onClose} outsideIgnore={props.outsideIgnore} anchorRef={props.anchorRef} />
}

export function CommentThreadView(props: ComponentProps<Comments['CommentThreadView']>) {
  const module = useComments()
  return module ? <module.CommentThreadView {...props} /> : null
}
