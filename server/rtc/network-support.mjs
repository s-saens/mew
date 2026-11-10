import { accessSync, constants } from 'node:fs'

/** Desktop services often omit /sbin from PATH. Never select a user PATH tool. */
export function linuxNetworkTool(name, executable = file => { try { accessSync(file, constants.X_OK); return true } catch { return false } }) {
  if (!['ip', 'ufw', 'firewall-cmd'].includes(name)) throw new Error('Unsupported network tool')
  return ['/usr/sbin', '/sbin', '/usr/bin', '/bin'].map(root => `${root}/${name}`).find(executable)
}
