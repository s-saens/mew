import artwork from '../utils/file-icon-artwork.json'

const fileIconArtwork: Readonly<Record<string, string>> = artwork

const urls = new Map<string, string>()
function iconUrl(id: string): string {
  let url = urls.get(id)
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(fileIconArtwork[id])}`
    urls.set(id, url)
  }
  return url
}

export default function FileTypeIconImage({ icon, lightIcon, size }: { icon: string; lightIcon: string; size: number }) {
  const image = (id: string, className?: string) => <img data-file-icon={id} src={iconUrl(id)} alt="" draggable={false} width={size} height={size} className={className} />
  return lightIcon === icon ? image(icon) : <>{image(lightIcon, 'dark:hidden')}{image(icon, 'hidden dark:block')}</>
}
