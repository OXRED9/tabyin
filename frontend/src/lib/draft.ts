import type { InputType } from './types'

/** What the user has typed or chosen in the input area, one value per tab. */
export interface InputDraft {
  tab: InputType
  text: string
  article_url: string
  video_url: string
  file: File | null
}

export const emptyDraft: InputDraft = { tab: 'text', text: '', article_url: '', video_url: '', file: null }
