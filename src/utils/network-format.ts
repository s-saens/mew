export function formatNetworkBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0), unit = 0
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++ }
  return `${unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
