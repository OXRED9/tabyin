import type { Dictionary } from './dictionary'
import type { ApiError, Meta, UiLang } from './types'

export interface ErrorCopy {
  message: string
  hint: string | null
}

/**
 * The backend's hints were written for the tabbed input ("paste it in the «Text» tab"). There is
 * one composer now, so a hint that still names a tab is replaced by the same advice in the UI's
 * own words. The message itself is always the backend's.
 */
function composerHint(code: string, hint: string | null | undefined, t: Dictionary): string | null {
  if (!hint) return null
  if (!/تبويب|\btab\b/i.test(hint)) return hint
  switch (code) {
    case 'article_fetch_failed':
      return t.errors.hintPasteArticle
    case 'no_speech':
      return t.errors.hintPasteTranscript
    default:
      return t.errors.hintUploadOrPaste
  }
}

/**
 * The words shown for an error. The backend's own `message_*` / `hint_*` win; codes raised by the
 * client (validation before the request, network failures) are worded from the dictionary, in
 * whatever language the UI is in right now.
 */
export function errorCopy(
  error: ApiError,
  ctx: { t: Dictionary; lang: UiLang; limits: Meta['limits'] },
): ErrorCopy {
  const { t, lang, limits } = ctx
  const message = lang === 'ar' ? error.message_ar || '' : error.message_en || ''
  const hint = composerHint(error.code, lang === 'ar' ? error.hint_ar : error.hint_en, t)
  if (message && error.code !== 'internal') return { message, hint }
  if (error.message_ar && error.message_en && error.code === 'internal') {
    return { message, hint: hint ?? t.errors.internal.hint }
  }

  switch (error.code) {
    case 'empty_input':
      return t.errors.empty
    case 'invalid_url':
      return t.errors.invalidUrl
    case 'input_too_long':
      return t.errors.tooLong(limits.max_text_chars)
    case 'file_too_large':
      return t.errors.fileTooLarge(limits.max_upload_mb)
    case 'unsupported_file':
      return t.errors.unsupportedFile
    case 'network':
      return t.errors.network
    case 'stream_interrupted':
      return t.errors.interrupted
    default:
      // A backend error in the other language is still better than a generic line.
      if (error.message_ar || error.message_en) {
        return {
          message: error.message_ar || error.message_en,
          hint: composerHint(error.code, error.hint_ar ?? error.hint_en, t),
        }
      }
      return t.errors.internal
  }
}

/** What the user can do next, by error code. */
export type ErrorRemedy = 'upload' | 'paste-transcript' | 'paste-article' | 'retry'

export function errorRemedies(code: string): ErrorRemedy[] {
  switch (code) {
    case 'video_download_failed':
    case 'video_too_long':
    case 'transcription_unavailable':
      return ['upload', 'paste-transcript']
    case 'no_speech':
    case 'file_too_large':
    case 'unsupported_file':
      return ['paste-transcript']
    case 'article_fetch_failed':
      return ['paste-article']
    case 'network':
    case 'stream_interrupted':
    case 'internal':
      return ['retry']
    default:
      return []
  }
}

export const localError = (code: ApiError['code']): ApiError => ({
  code,
  stage: null,
  fatal: true,
  message_ar: '',
  message_en: '',
})
