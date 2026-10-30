export type FileIconArtworkProps = { icon: string; lightIcon: string; size: number }

export function createIconArtwork(artwork: Readonly<Record<string, string>>) {
  const urls = new Map<string, string>()
  function iconUrl(id: string): string {
    let url = urls.get(id)
    if (!url) {
      url = `data:image/svg+xml,${encodeURIComponent(artwork[id])}`
      urls.set(id, url)
    }
    return url
  }
  return function IconArtwork({ icon, lightIcon, size }: FileIconArtworkProps) {
    const image = (id: string, className?: string) => <img data-file-icon={id} src={iconUrl(id)} alt="" draggable={false} width={size} height={size} className={className} />
    return lightIcon === icon ? image(icon) : <>{image(lightIcon, 'dark:hidden')}{image(icon, 'hidden dark:block')}</>
  }
}
