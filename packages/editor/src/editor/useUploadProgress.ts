import { useCallback, useMemo, useRef, useState } from 'react'
import type { EditorApi } from '../types'

interface Upload { id: number; name: string; percent: number }

/** Tracks each upload until its response settles, including simultaneous uploads. */
export function useUploadProgress(api: EditorApi) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const nextId = useRef(0)
  const upload = useCallback<EditorApi['uploadAsset']>(async (file, onProgress) => {
    const id = ++nextId.current
    setUploads(current => [...current, { id, name: file.name, percent: 0 }])
    try {
      return await api.uploadAsset(file, percent => {
        if (!Number.isFinite(percent)) return
        const value = Math.max(0, Math.min(100, Math.floor(percent)))
        setUploads(current => current.map(item => item.id === id ? { ...item, percent: value } : item))
        onProgress?.(value)
      })
    } finally {
      setUploads(current => current.filter(item => item.id !== id))
    }
  }, [api])
  const trackedApi = useMemo(() => ({ ...api, uploadAsset: upload }), [api, upload])
  return { uploads, trackedApi }
}
