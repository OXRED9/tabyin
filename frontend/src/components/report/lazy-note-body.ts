import { lazyWithPreload } from '@/lib/lazy'

/** The body of an open note, fetched when a note is first opened, or just before one will be. */
const LazyNoteBody = lazyWithPreload(() => import('@/components/report/note-body'))

export default LazyNoteBody
