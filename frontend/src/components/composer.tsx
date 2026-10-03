import { AudioLines, FileAudio, Image as ImageIcon, Link2, Newspaper, Paperclip, Play, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent, ReactNode, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import type { InputDraft } from '@/lib/draft'
import { formatFileSize } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { detectLink } from '@/lib/link'
import type { Meta, MetaExample } from '@/lib/types'
import { cn } from '@/lib/utils'

export type AttachKind = 'file' | 'audio' | 'image'

/** The direction of the first strong character; none yet → the interface's own direction. */
function textDirection(text: string): 'rtl' | 'ltr' | undefined {
  const strong = text.match(/[A-Za-z\u00C0-\u024F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/)
  if (!strong) return undefined
  return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(strong[0]) ? 'rtl' : 'ltr'
}

const ACCEPT: Record<AttachKind, string> = {
  file: 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.mp4,.mov,.mkv,.webm',
  audio: 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac',
  image: 'image/png,image/jpeg,image/webp,image/heic,.png,.jpg,.jpeg,.webp,.heic',
}

interface ComposerProps {
  draft: InputDraft
  onChange: (patch: Partial<InputDraft>) => void
  onSubmit: () => void
  limits: Meta['limits']
  /** `meta.features.image`: the «صورة» action exists only when the backend offers image input. */
  imageInput: boolean
  examples: MetaExample[]
  onExample: (example: MetaExample) => void
  historyCount: number
  onOpenHistory: () => void
  hasError: boolean
  errorId: string
  error: ReactNode
  fieldRef: RefObject<HTMLTextAreaElement | null>
  /** Lets an error's "upload the file" remedy open the picker. */
  pickerRef: RefObject<((kind: AttachKind) => void) | null>
}

/**
 * The blank page. One field takes whatever the user has: a text, a link (recognised as it is
 * typed and confirmed by a tag), or a file attached with one of the labelled actions under it.
 * It is a form with a label and a button that says what it does, not a chat box.
 */
export function Composer({
  draft,
  onChange,
  onSubmit,
  limits,
  imageInput,
  examples,
  onExample,
  historyCount,
  onOpenHistory,
  hasError,
  errorId,
  error,
  fieldRef,
  pickerRef,
}: ComposerProps) {
  const { t, lang, dir } = useI18n()
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const file = draft.file
  const link = file ? null : detectLink(draft.text)
  const linkKind = link ? (draft.linkAs ?? link.kind) : null
  const overLimit = !link && draft.text.length > limits.max_text_chars
  const nearLimit = !link && draft.text.length > limits.max_text_chars * 0.8

  const openPicker = (kind: AttachKind) => {
    const input = fileInput.current
    if (!input) return
    input.accept = ACCEPT[kind]
    input.click()
  }
  useEffect(() => {
    pickerRef.current = openPicker
    return () => {
      pickerRef.current = null
    }
  })

  /** A link needs no upload: put the cursor in the field, and paste the clipboard's link if allowed. */
  const attachLink = async () => {
    if (file) onChange({ file: null })
    window.requestAnimationFrame(() => fieldRef.current?.focus())
    if (draft.text.trim()) return
    try {
      const clip = await navigator.clipboard?.readText?.()
      if (clip && detectLink(clip)) onChange({ text: clip.trim(), linkAs: null })
    } catch {
      /* Not allowed to read the clipboard: the cursor is in the field, the user pastes. */
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onChange({ file: dropped })
  }

  const isImage = !!file && /^image\//.test(file.type)
  const linkLabel = link
    ? linkKind === 'article_url'
      ? t.input.link.article
      : link.platform === 'youtube' || link.platform === 'tiktok'
        ? t.input.link[link.platform]
        : t.input.link.video
    : null
  const LinkIcon = linkKind === 'article_url' ? Newspaper : Play

  const attachments: { kind: 'link' | AttachKind; label: string; icon: typeof Link2 }[] = [
    { kind: 'link', label: t.input.attachLink, icon: Link2 },
    ...(imageInput ? [{ kind: 'image' as const, label: t.input.attachImage, icon: ImageIcon }] : []),
    { kind: 'file', label: t.input.attachFile, icon: Paperclip },
    { kind: 'audio', label: t.input.attachAudio, icon: AudioLines },
  ]

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <h1 className="naskh-display text-2xl text-balance text-ink md:text-3xl">{t.headline}</h1>

      <label htmlFor={`${id}-field`} className="mt-8 block text-base font-medium text-ink">
        {t.input.label}
      </label>

      {file ? (
        <div className="mt-3 flex items-center gap-3 rounded-control border border-rule-strong p-3">
          {isImage ? (
            <ImageIcon aria-hidden="true" className="size-5 shrink-0 text-quiet" />
          ) : (
            <FileAudio aria-hidden="true" className="size-5 shrink-0 text-quiet" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium" dir="auto">
              {file.name}
            </span>
            <span className="tabular block text-sm text-quiet">
              {(() => {
                const { size, unit } = formatFileSize(file.size)
                return `${t.input.fileSize(size, unit)} — ${isImage ? t.input.fileImage : t.input.fileMedia}`
              })()}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={t.input.fileRemove}
            onClick={() => {
              onChange({ file: null })
              window.requestAnimationFrame(() => fieldRef.current?.focus())
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        // The field's direction follows what is typed (a link reads left to right); the wrapper
        // takes the same direction, so the clear button always sits at the end of the text's line.
        <div className="relative mt-3" dir={textDirection(draft.text) ?? dir}>
          <textarea
            id={`${id}-field`}
            ref={fieldRef}
            dir={textDirection(draft.text) ?? dir}
            value={draft.text}
            onChange={(event) => onChange({ text: event.target.value, linkAs: null })}
            placeholder={imageInput ? t.input.placeholderImage : t.input.placeholder}
            aria-invalid={hasError || overLimit || undefined}
            aria-describedby={hasError ? errorId : undefined}
            rows={4}
            className={cn(
              'ruled page-text block max-h-[50vh] min-h-[calc(var(--line)*4+0.75rem)] w-full resize-none rounded-sheet border border-rule-strong bg-paper px-4 pt-1 pb-2 text-ink transition-colors duration-150 field-sizing-content placeholder:font-sans placeholder:text-base placeholder:leading-(--line) placeholder:text-quiet focus-visible:border-green aria-invalid:border-contra',
              draft.text && 'pe-12',
              dragging && 'border-green',
            )}
          />
          {draft.text ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.input.clear}
              onClick={() => {
                onChange({ text: '', linkAs: null })
                fieldRef.current?.focus()
              }}
              className="absolute end-2 top-2 text-quiet"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
          {dragging ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-sm font-medium text-green">
              {t.input.dropHere}
            </p>
          ) : null}
        </div>
      )}

      {link && linkLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            data-testid="link-tag"
            className="inline-flex min-h-8 items-center gap-2 rounded-tag bg-accent ps-3 pe-1 text-sm font-medium text-ink"
          >
            <LinkIcon aria-hidden="true" className="size-4 shrink-0 text-green" />
            {linkLabel}
            <button
              type="button"
              aria-label={t.input.linkRemove}
              onClick={() => {
                onChange({ text: '', linkAs: null })
                fieldRef.current?.focus()
              }}
              className="flex size-6 items-center justify-center rounded-tag text-quiet transition-colors duration-150 hover:bg-paper hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </span>
          {/* The host said nothing about what is behind the link, so the user can correct the guess. */}
          {link.certain ? null : (
            <Button
              type="button"
              variant="link"
              onClick={() => onChange({ linkAs: linkKind === 'article_url' ? 'video_url' : 'article_url' })}
            >
              {linkKind === 'article_url' ? t.input.asVideo : t.input.asArticle}
            </Button>
          )}
        </div>
      ) : null}

      {nearLimit ? (
        <p className={cn('tabular mt-2 text-sm text-quiet', overLimit && 'font-semibold text-contra-ink')} dir="ltr">
          {t.input.chars(draft.text.length, limits.max_text_chars)}
        </p>
      ) : null}

      {error ? <div className="mt-4">{error}</div> : null}

      <input
        ref={fileInput}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) onChange({ file: chosen })
          event.target.value = ''
        }}
      />
      <div role="group" aria-label={t.input.attach} className="mt-3 -ms-3 flex flex-wrap gap-x-1">
        {attachments.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="touch"
            title={kind === 'link' ? undefined : t.input.fileLimit(limits.max_upload_mb)}
            onClick={() => (kind === 'link' ? void attachLink() : openPicker(kind))}
            className="px-3"
          >
            <Icon aria-hidden="true" className="text-quiet" />
            {label}
          </Button>
        ))}
      </div>

      <Button type="submit" size="xl" data-testid="verify" className="mt-4 w-full">
        {t.input.verify}
      </Button>

      {/* The row keeps its height while /api/meta is on its way, so nothing below it moves. */}
      <div className="mt-6 flex min-h-9 flex-wrap items-center gap-2">
        {examples.length > 0 ? <span className="text-sm text-quiet">{t.input.examples}</span> : null}
        {examples.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => onExample(example)}
            className="min-h-9 rounded-tag border border-rule-strong px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-accent"
          >
            {lang === 'ar' ? example.label_ar : example.label_en}
          </button>
        ))}
      </div>

      {historyCount > 0 ? (
        <Button type="button" variant="link" onClick={onOpenHistory} className="mt-6">
          {t.input.recent(historyCount)}
        </Button>
      ) : null}
    </form>
  )
}
