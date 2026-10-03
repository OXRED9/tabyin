/**
 * What the user has put in the composer: one field that takes a text or a link, and at most one
 * attached file. `linkAs` is set only when the user corrects how a link was recognised.
 */
export interface InputDraft {
  text: string
  file: File | null
  linkAs: 'article_url' | 'video_url' | null
}

export const emptyDraft: InputDraft = { text: '', file: null, linkAs: null }
