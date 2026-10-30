import { ArrowLeft, ArrowRight } from 'iconoir-react'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'
import './not-found-page.css'

export function NotFoundPage({ homeHref = '/' }: { homeHref?: string }) {
  useUiLocale()
  return <main className="mew-workspace mew-not-found" aria-labelledby="not-found-title">
    <a className="mew-not-found-brand" href={homeHref} aria-label={uiText('작업 공간으로 돌아가기')}>
      <span>mew</span><span>my easy workspace</span>
    </a>
    <section className="mew-not-found-content">
      <div className="mew-not-found-art" aria-hidden="true">
        <span>4</span>
        <svg className="mew-not-found-zero" viewBox="0 0 120 152" fill="none">
          <rect x="9" y="9" width="102" height="134" rx="51" stroke="currentColor" strokeWidth="13" />
          <path d="M36 91V66C36 47 60 47 60 66V86V66C60 47 84 47 84 66V91" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        </svg>
        <span>4</span>
      </div>
      <h1 id="not-found-title">{uiText('이 페이지는 잠시 길을 잃었어요.')}</h1>
      <p>{uiText('주소가 바뀌었거나, 더 이상 존재하지 않는 페이지입니다.')}</p>
      <a className="mew-not-found-home" href={homeHref}>
        {uiText('작업 공간으로 돌아가기')}<ArrowRight width={18} height={18} aria-hidden="true" />
      </a>
      <button className="mew-not-found-back" onClick={() => {
        if (window.history.length > 1) window.history.back()
        else window.location.assign(homeHref)
      }}><ArrowLeft width={16} height={16} aria-hidden="true" />{uiText('이전 페이지로')}</button>
    </section>
    <footer className="mew-not-found-footer"><span>404</span><span>mew · my easy workspace</span></footer>
  </main>
}
