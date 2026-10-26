import { RE2JS, RE2JSSyntaxException } from 're2js'

export interface SearchPatternOptions {
  regex: boolean
  caseSensitive: boolean
}

const MAX_QUERY_LENGTH = 2_000
const MAX_PROGRAM_SIZE = 10_000

/** A required substring can narrow FTS candidates; the original pattern still verifies each file. */
export function requiredSearchLiteral(query: string, opts: SearchPatternOptions): string | null {
  if (opts.regex) return null
  let selected: string | null = null
  let selectedLength = 2
  let run = ''
  let runLength = 0
  const finishRun = () => {
    if (runLength > selectedLength) {
      selected = run
      selectedLength = runLength
    }
    run = ''
    runLength = 0
  }
  for (const character of query) {
    // SQLite and RE2 use different Unicode folding tables. Keep ASCII folding and
    // uncased text, but break at other cased characters rather than lose matches.
    const unsafeFold = !opts.caseSensitive && character.charCodeAt(0) > 0x7f
      && character.toLowerCase() !== character.toUpperCase()
    if (character === '*' || character === '?' || unsafeFold) finishRun()
    else { run += character; runLength++ }
  }
  finishRun()
  return selected
}

/** All server search patterns use a non-backtracking engine; unsupported syntax never falls back to RegExp. */
export function compileSearchPattern(query: string, opts: SearchPatternOptions): RE2JS {
  if (query.length > MAX_QUERY_LENGTH) throw new SyntaxError('검색어가 너무 깁니다')
  const source = opts.regex
    ? RE2JS.translateRegExp(query)
    : query.split(/(\*+|\?)/).map(token => /^\*+$/.test(token) ? '[^\\r\\n]*' : token === '?' ? '[^\\r\\n]' : RE2JS.quote(token)).join('')
  try {
    const pattern = RE2JS.compile(source, opts.caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE)
    if (pattern.programSize() > MAX_PROGRAM_SIZE) throw new SyntaxError('검색 정규식이 너무 복잡합니다')
    return pattern
  } catch (error) {
    if (error instanceof RE2JSSyntaxException) throw new SyntaxError('지원하지 않거나 잘못된 정규식입니다', { cause: error })
    throw error
  }
}

/** RE2JS advances empty matches by Unicode character; search and replacement omit those matches. */
export function* nonEmptySearchMatches(pattern: RE2JS, input: string): Generator<RegExpExecArray> {
  for (const match of pattern.matchAll(input)) {
    if (match[0].length) yield match as RegExpExecArray
  }
}
