/**
 * Day 8: CLI dispatch handler
 *
 * main 프로세스가 `cli:dispatch` 로 보낸 사용자 인자를 받아서
 * 적절한 store 액션 + router 이동으로 변환.
 *
 * 4 가지 케이스:
 *   1. 인자 파싱 에러 → 토스트
 *   2. files: 두 파일 로드 → /diff
 *   3. git-working w/ relpath: HEAD + WORKING 로드 → /diff
 *      git-working w/o relpath: / 에서 Git 모달 자동 오픈
 *   4. git-commits / git-branches: 두 ref 로드 → /diff
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { parseCliArgs } from '../../cli/parse'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import { useGitStore } from '../stores/git'

export function useCliDispatcher() {
  const router = useRouter()
  const comparison = useComparisonStore()
  const toast = useToastStore()
  const git = useGitStore()

  let cleanup: (() => void) | null = null

  onMounted(() => {
    cleanup = window.textdiff.onCliDispatch(async (data) => {
      await dispatch(data.argv, data.cwd)
    })
  })

  onBeforeUnmount(() => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  })

  async function dispatch(argv: string[], cwd: string) {
    const parsed = parseCliArgs(argv)

    if (parsed.errors.length > 0) {
      toast.error('CLI 인자 오류', parsed.errors.join('\n'))
      // 일반 FilePicker 로
      if (router.currentRoute.value.path !== '/') router.push('/')
      return
    }

    if (!parsed.payload) {
      // 그냥 launch — 이미 FilePicker
      return
    }

    switch (parsed.payload.kind) {
      case 'files': {
        const { fileA, fileB } = parsed.payload
        comparison.resetForNewComparison()
        comparison.clearSlot(0)
        comparison.clearSlot(1)
        await comparison.loadFile(0, fileA)
        await comparison.loadFile(1, fileB)
        const sa = comparison.slots[0]
        const sb = comparison.slots[1]
        if (sa.status === 'ready' && sb.status === 'ready') {
          comparison.setEntrySource('cli')
          router.push('/diff')
        } else {
          const msg = sa.error ?? sb.error ?? '파일 로드 실패'
          toast.error('CLI 파일 로드 실패', msg)
          if (router.currentRoute.value.path !== '/') router.push('/')
        }
        return
      }

      case 'git-working': {
        const repoPath = parsed.payload.repoPath ?? cwd
        const repoRoot = await window.textdiff.gitFindRepoRoot(repoPath)
        if (!repoRoot) {
          toast.error('Git repo 아님', `${repoPath} 는 Git 저장소가 아닙니다.`)
          if (router.currentRoute.value.path !== '/') router.push('/')
          return
        }
        git.setLastRepoPath(repoRoot)

        if (parsed.payload.relpath) {
          // 직접 비교
          comparison.resetForNewComparison()
          comparison.clearSlot(0)
          comparison.clearSlot(1)
          await comparison.loadFromGit(0, repoRoot, 'HEAD', parsed.payload.relpath, 'HEAD')
          await comparison.loadFromGit(
            1,
            repoRoot,
            'WORKING',
            parsed.payload.relpath,
            '작업 디렉토리',
          )
          const sa = comparison.slots[0]
          const sb = comparison.slots[1]
          if (sa.status === 'ready' && sb.status === 'ready') {
            router.push('/diff')
          } else {
            toast.error('Git 비교 로드 실패', sa.error ?? sb.error ?? '알 수 없음')
          }
        } else {
          // 모달 자동 오픈 신호
          git.pendingOpenModal = 'working'
          if (router.currentRoute.value.path !== '/') router.push('/')
        }
        return
      }

      case 'git-commits':
      case 'git-branches': {
        const { refA, refB, relpath } = parsed.payload
        const repoPath = parsed.payload.repoPath ?? cwd
        const repoRoot = await window.textdiff.gitFindRepoRoot(repoPath)
        if (!repoRoot) {
          toast.error('Git repo 아님', `${repoPath} 는 Git 저장소가 아닙니다.`)
          if (router.currentRoute.value.path !== '/') router.push('/')
          return
        }
        git.setLastRepoPath(repoRoot)
        comparison.resetForNewComparison()
        comparison.clearSlot(0)
        comparison.clearSlot(1)
        const shortA = refA.length > 12 ? refA.substring(0, 7) : refA
        const shortB = refB.length > 12 ? refB.substring(0, 7) : refB
        await comparison.loadFromGit(0, repoRoot, refA, relpath, shortA)
        await comparison.loadFromGit(1, repoRoot, refB, relpath, shortB)
        const sa = comparison.slots[0]
        const sb = comparison.slots[1]
        if (sa.status === 'ready' && sb.status === 'ready') {
          comparison.setEntrySource('cli')
          router.push('/diff')
        } else {
          toast.error('Git 비교 로드 실패', sa.error ?? sb.error ?? '알 수 없음')
        }
        return
      }
    }
  }

  return { dispatch }
}
