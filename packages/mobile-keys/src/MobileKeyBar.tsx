import { uiText } from '@mew/ui/i18n-core'
import { HoverTipLayer } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { getVirtualKeyboard, virtualKeyboardViewportBottom } from '@mew/ui/virtual-keyboard'
import { useEffect, useRef, type ReactNode } from 'react'
// 모바일 입력 영역의 보조키 바 (Termux의 extra keys 같은 역할).
// 키보드가 떠 있을 때만 쓰는 게 아니라 — 키보드를 내린 채 방향키로 스크롤하거나 Esc를 보내는 데도
// 쓰므로 — 띄울지 말지는 useMobileLayout(화면 폭)이 정한다.
// 이 컴포넌트는 Ctrl/Shift 토글 상태만 노출한다. 그 토글을 다음에 입력될 글자에 어떻게 결합할지는
// 호스트가 정한다 — 터미널은 onData를 가로채고, 에디터는 beforeinput을 가로채 단축키로 처리한다.
function KeyButton({ label, ariaLabel, active, onClick, stretch = false, floating = false, className = '', children }: { label: string; ariaLabel?: string; active?: boolean; onClick: () => void; stretch?: boolean; floating?: boolean; className?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // 포커스(=키보드)를 안 뺏기게 — 버튼 탭이 blur를 유발하면 안 됨
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      data-tip={ariaLabel ?? label}
      aria-pressed={active}
      className={`flex h-8 flex-1 items-center justify-center select-none leading-none font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${floating
        ? 'min-w-6 max-w-10 rounded-[10px] px-0.5 text-[11px] shadow-sm backdrop-blur-sm max-[360px]:text-[10px]'
        : `rounded max-[360px]:inset-ring max-[360px]:inset-ring-surface-deep ${stretch ? 'min-w-0 px-0.5 text-[10px]' : 'min-w-6 px-1 text-[11px] max-[360px]:text-[10px]'}`
      } ${active
        ? 'bg-accent text-ink-on-accent active:bg-accent-strong'
        : floating ? 'bg-surface-raised/75 text-ink hover:bg-surface-hover/90 active:bg-surface-hover' : 'bg-surface-raised text-ink-secondary hover:bg-surface-hover active:bg-surface-hover active:text-ink'
      } ${className}`}
    >
      {children ?? label}
    </button>
  )
}

function KeyIcon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

function KeySeparator() {
  return <div aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-edge max-[360px]:hidden" />
}

export function MobileKeyBar({
  ctrlActive,
  shiftActive,
  onToggleCtrl,
  onToggleShift,
  onEsc,
  onTab,
  onArrow,
  onComment,
  onCodeBlock,
  onTable,
  onUndo,
  onRedo,
  placement = 'fixed',
  stretch = false,
  extraKeys = [],
}: {
  ctrlActive: boolean
  shiftActive: boolean
  onToggleCtrl: () => void
  onToggleShift: () => void
  onEsc: () => void
  onTab: () => void
  onArrow: (dir: 'up' | 'down' | 'left' | 'right') => void
  /** 주면 댓글 아이콘이 뜬다 — 선택(없으면 커서) 자리에 댓글을 단다. 폰에는 Alt+Shift+C가 없다 */
  onComment?: () => void
  /** 주면 코드블럭 아이콘이 뜬다 — 커서 문단을 코드블럭으로 바꾸거나 되돌린다(toggle). md 핫뷰만 넘긴다 */
  onCodeBlock?: () => void
  /** 주면 표 아이콘이 뜬다 — 슬래시 메뉴 '표'와 같은 3×3 표를 삽입한다. md 핫뷰만 넘긴다 */
  onTable?: () => void
  /** 주면 되돌리기 아이콘이 뜬다 — Ctrl+Z와 같은 경로(커서 보존)로 되돌린다 */
  onUndo?: () => void
  /** 주면 다시 실행 아이콘이 뜬다 — Ctrl+Y와 같은 경로로 다시 실행한다 */
  onRedo?: () => void
  /** 터미널처럼 입력칸과 함께 레이아웃 공간을 차지해야 하면 flow를 쓴다. */
  placement?: 'fixed' | 'flow'
  /** 사용 가능한 너비를 한 줄의 키에 균등 배분한다. */
  stretch?: boolean
  extraKeys?: Array<{ label: string; ariaLabel?: string; onClick: () => void }>
}) {
  useUiLocale()
  const floating = placement === 'fixed'
  const arrows = <>
    <KeyButton stretch={stretch} floating={floating} className={floating ? 'col-start-1 row-start-2' : ''} label="←" onClick={() => onArrow('left')}><KeyIcon><path d="m12 5-7 7 7 7M5 12h14" /></KeyIcon></KeyButton>
    <KeyButton stretch={stretch} floating={floating} className={floating ? 'col-start-2 row-start-1' : ''} label="↑" onClick={() => onArrow('up')}><KeyIcon><path d="m5 12 7-7 7 7M12 5v14" /></KeyIcon></KeyButton>
    <KeyButton stretch={stretch} floating={floating} className={floating ? 'col-start-2 row-start-2' : ''} label="↓" onClick={() => onArrow('down')}><KeyIcon><path d="m5 12 7 7 7-7M12 5v14" /></KeyIcon></KeyButton>
    <KeyButton stretch={stretch} floating={floating} className={floating ? 'col-start-3 row-start-2' : ''} label="→" onClick={() => onArrow('right')}><KeyIcon><path d="m12 5 7 7-7 7M5 12h14" /></KeyIcon></KeyButton>
  </>
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (placement !== 'fixed') return
    const viewport = window.visualViewport
    const keyboard = getVirtualKeyboard()
    const bar = barRef.current
    const originalBottom = bar?.style.bottom ?? ''
    const update = () => {
      const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight), virtualKeyboardViewportBottom())
      if (bar) bar.style.bottom = `max(var(--mobile-dock-space, 0px), ${Math.max(0, window.innerHeight - bottom)}px)`
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    keyboard?.addEventListener('geometrychange', update)
    document.addEventListener('fullscreenchange', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      keyboard?.removeEventListener('geometrychange', update)
      document.removeEventListener('fullscreenchange', update)
      window.removeEventListener('resize', update)
      if (bar) bar.style.bottom = originalBottom
    }
  }, [placement])
  return (
    // z-20 — 전체 화면 오버레이(사이드바·채팅·에이전트·터미널)는 z-30이다. 같은 z-30으로 두면
    // DOM 순서상 에디터가 사이드바보다 뒤라 보조키가 사이드바 위에 떠 버린다
    <HoverTipLayer className="contents">
      <div ref={barRef} data-mobile-key-bar className={floating
        ? 'fixed inset-x-0 bottom-0 z-20 flex items-end gap-1.5 px-1.5 py-1.5 max-[360px]:gap-1 max-[360px]:px-1'
        : 'relative z-20 flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-edge bg-surface-deep px-1.5 py-1 max-[360px]:gap-0 max-[360px]:px-1'}>
        <div className={floating ? 'flex min-w-0 flex-1 items-center gap-0.5 min-[400px]:gap-1' : 'contents'}>
          <KeyButton stretch={stretch} floating={floating} label="Esc" onClick={onEsc} />
          <KeyButton stretch={stretch} floating={floating} label="Tab" onClick={onTab} />
          <KeyButton stretch={stretch} floating={floating} label="Ctrl" active={ctrlActive} onClick={onToggleCtrl} />
          <KeyButton stretch={stretch} floating={floating} label="Shift" active={shiftActive} onClick={onToggleShift} />
          {!floating && <>{!stretch && <KeySeparator />}{arrows}</>}
          {extraKeys.map(key => <KeyButton key={key.label} stretch={stretch} floating={floating} {...key} />)}
          {onComment && <>
            {!floating && <KeySeparator />}
            <KeyButton floating={floating} label={uiText("선택한 곳에 댓글")} onClick={onComment}>
              <KeyIcon><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 0 1 4 11.5a8.38 8.38 0 0 1 8.5-8.4 8.38 8.38 0 0 1 8.5 8.4z" /></KeyIcon>
            </KeyButton>
          </>}
          {!floating && (onCodeBlock || onTable) && <KeySeparator />}
          {onCodeBlock && <KeyButton floating={floating} label={uiText("코드블럭")} onClick={onCodeBlock}>
            <KeyIcon><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></KeyIcon>
          </KeyButton>}
          {onTable && <KeyButton floating={floating} label={uiText("표 삽입")} onClick={onTable}>
            <KeyIcon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12m6-12v12" /></KeyIcon>
          </KeyButton>}
          {!floating && (onUndo || onRedo) && <KeySeparator />}
          {onUndo && <KeyButton floating={floating} label={uiText("되돌리기")} onClick={onUndo}>
            <KeyIcon><path d="m9 14-5-5 5-5m11 16v-7a4 4 0 0 0-4-4H4" /></KeyIcon>
          </KeyButton>}
          {onRedo && <KeyButton floating={floating} label={uiText("다시 실행")} onClick={onRedo}>
            <KeyIcon><path d="m15 14 5-5-5-5M4 20v-7a4 4 0 0 1 4-4h12" /></KeyIcon>
          </KeyButton>}
        </div>
        {floating && <div className="grid shrink-0 grid-cols-[repeat(3,1.5rem)] grid-rows-2 gap-0.5 min-[361px]:grid-cols-[repeat(3,1.75rem)] min-[400px]:grid-cols-[repeat(3,2rem)]">{arrows}</div>}
      </div>
    </HoverTipLayer>
  )
}
