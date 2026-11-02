/** Share completed samples and in-flight work across resource-monitor clients. */
export function resourceSampleCache<T>(
  collect: () => Promise<T>,
  maxAge: number | ((value: T) => number),
  now = () => performance.now(),
): () => Promise<T> {
  let cached: { value: T; expires: number } | undefined
  let pending: Promise<T> | undefined
  return () => {
    if (pending) return pending
    if (cached && now() < cached.expires) return Promise.resolve(cached.value)
    pending = collect().then(value => {
      cached = { value, expires: now() + (typeof maxAge === 'number' ? maxAge : maxAge(value)) }
      return value
    }).finally(() => { pending = undefined })
    return pending
  }
}
