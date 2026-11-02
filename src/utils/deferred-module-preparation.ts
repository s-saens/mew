/** Share public module code across mounts without owning component lifetimes. */
export function createDeferredModulePreparation<Module>(delay: number) {
  let code: Promise<Module> | undefined
  let startPending: (() => void) | undefined
  let urgent = false

  function prepare(load: () => Promise<Module>): Promise<Module> {
    return code ??= new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const start = () => {
        if (startPending !== start) return
        startPending = undefined
        clearTimeout(timer)
        void load().then(resolve, reject)
      }
      startPending = start
      if (urgent) start()
      else timer = setTimeout(start, delay)
    })
  }

  function promote() {
    urgent = true
    startPending?.()
  }

  return { prepare, promote }
}
