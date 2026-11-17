import { GitConnectionError } from './git-connections.ts'

export function remoteGitFailure(error: unknown): GitConnectionError {
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
  if (/refusing to allow an OAuth App/i.test(stderr) && /workflow/i.test(stderr) && /scope/i.test(stderr)) {
    return new GitConnectionError('GitHub 워크플로 권한이 없어 push가 거부되었습니다. GitHub 연결을 해제하고 다시 로그인해 워크플로 권한을 승인하세요.', 409, 'git-workflow-scope-required')
  }
  return new GitConnectionError('Git 원격 작업에 실패했습니다. 저장소 권한·SSO 승인·브랜치 상태와 연결을 확인하세요.', 409, 'git-remote-failed')
}
