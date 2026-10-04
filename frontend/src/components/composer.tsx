import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  ClipboardPaste,
  FileAudio,
  Image as ImageIcon,
  Link2,
  Newspaper,
  Paperclip,
  Play,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode, RefObject } from 'react'

import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import type { ImageReading } from '@/hooks/use-image-reader'
import type { InputDraft } from '@/lib/draft'
import { UNREAD_MARK, countUnread, isImageFile } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { detectLink } from '@/lib/link'
import type { Meta, MetaExample } from '@/lib/types'
import { cn } from '@/lib/utils'

export type AttachKind = 'file' | 'audio' | 'image'

/** The direction of the first strong character; none yet → the interface's own direction. */
function textDirection(text: string): 'rtl' | 'ltr' | undefined {
  const strong = text.match(/[A-Za-zÀ-ɏ֐-ࣿיִ-﷿ﹰ-ﻼ]/)
  if (!strong) return undefined
  return /[֐-ࣿיִ-﷿ﹰ-ﻼ]/.test(strong[0]) ? 'rtl' : 'ltr'
}

/**
 * What each attach action lets the picker offer. «صورة» asks for `image/*` and nothing else, with
 * no `capture`: that is what makes a phone offer its gallery and its camera. (A list of MIME
 * types and extensions makes Android open the Files app instead of the photo picker.) When image
 * input is on, «ملف» takes pictures too, and the chosen file is routed by its type.
 */
function acceptFor(kind: AttachKind, imageInput: boolean): string {
  if (kind === 'image') return 'image/*'
  if (kind === 'audio') return 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac'
  return imageInput
    ? 'image/*,audio/*,video/*'
    : 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.mp4,.mov,.mkv,.webm'
}

interface ComposerProps {
  draft: InputDraft
  onChange: (patch: Partial<InputDraft>) => void
  onSubmit: () => void
  limits: Meta['limits']
  /** `meta.features.image`: pictures can be read (`POST /api/ocr`). Off → no «صورة» action. */
  imageInput: boolean
  /** A one-line remark above the field (what was shared to the app could not be received). */
  notice?: string | null
  /** The picture being read, or read, if there is one. */
  image: ImageReading | null
  onImage: (file: File) => void
  /** Text taken from the clipboard by the «لصق» button: placed in the field and, unless very short, verified. */
  onPasteText: (text: string) => void
  onImageRemove: () => void
  examples: MetaExample[]
  onExample: (example: MetaExample) => void
  hasError: boolean
  errorId: string
  error: ReactNode
  fieldRef: RefObject<HTMLTextAreaElement | null>
  /** Lets an error's "upload the file" remedy open the picker. */
  pickerRef: RefObject<((kind: AttachKind) => void) | null>
}

/**
 * The blank page. One field takes whatever the user has: a text, a link (recognised as it is
 * typed and confirmed by a tag), a clip attached with one of the labelled actions under it, or a
 * picture. A picture is never verified directly: it is read first, its text is put in the field
 * for the user to check and correct, and what is verified is that text.
 *
 * It is a form with a label and a button that says what it does, not a chat box.
 */
export function Composer({
  draft,
  onChange,
  onSubmit,
  limits,
  imageInput,
  notice,
  image,
  onImage,
  onPasteText,
  onImageRemove,
  examples,
  onExample,
  hasError,
  errorId,
  error,
  fieldRef,
  pickerRef,
}: ComposerProps) {
  const { t, lang, dir } = useI18n()
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const [noPreview, setNoPreview] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollbar, setScrollbar] = useState(0)
  const fileInput = useRef<HTMLInputElement | null>(null)
  // «لصق» exists only where the page may read the clipboard: a secure context with the API.
  // (Plain http on a LAN address has neither, and a button that does nothing is worse than none.)
  const [canPaste] = useState(() => window.isSecureContext && typeof navigator.clipboard?.readText === 'function')

  const file = draft.file
  const link = file ? null : detectLink(draft.text)
  const linkKind = link ? (draft.linkAs ?? link.kind) : null
  const overLimit = !link && draft.text.length > limits.max_text_chars
  const nearLimit = !link && draft.text.length > limits.max_text_chars * 0.8
  const reading = image?.status === 'reading'
  const read = image?.status === 'read' ? image.result : null
  const unread = read ? countUnread(draft.text) : 0
  const fieldDir = textDirection(draft.text) ?? dir
  // Amiri is for a text under examination. An address is not that: it is set in the tool's own
  // face, on the same lines.
  const fieldFace = link ? 'font-sans text-base leading-10' : 'page-text'

  /** A picture goes to the reader; anything else is a clip to transcribe. */
  const take = (chosen: File) => {
    if (imageInput && isImageFile(chosen)) {
      onImage(chosen)
      return
    }
    if (image) onImageRemove()
    onChange({ file: chosen })
  }

  const openPicker = (kind: AttachKind) => {
    const input = fileInput.current
    if (!input) return
    input.accept = acceptFor(kind, imageInput)
    input.click()
  }
  useEffect(() => {
    pickerRef.current = openPicker
    return () => {
      pickerRef.current = null
    }
  })

  // A picture pasted anywhere on the first screen (Ctrl/⌘+V, or a phone's paste) is read too.
  useEffect(() => {
    if (!imageInput) return
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []).find(isImageFile)
      if (!pasted) return
      event.preventDefault()
      onImage(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [imageInput, onImage])

  // The marks on unread words are drawn over the field, so they must wrap and scroll as it does.
  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field || unread === 0) return
    setScrollbar(Math.max(0, field.offsetWidth - field.clientWidth - 2))
    setScrollTop(field.scrollTop)
  }, [draft.text, fieldRef, unread])

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

  /**
   * The «لصق» button. The clipboard's picture goes to the reader, which stops to ask as always;
   * its text goes into the field and is verified at once (`onPasteText`). Typing, and a paste
   * from the keyboard, never start anything.
   */
  const pasteClipboard = async () => {
    try {
      if (typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const type = imageInput ? item.types.find((candidate) => candidate.startsWith('image/')) : undefined
          if (type) {
            const blob = await item.getType(type)
            onImage(new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type }))
            return
          }
        }
        for (const item of items) {
          if (!item.types.includes('text/plain')) continue
          const text = await (await item.getType('text/plain')).text()
          if (text.trim()) onPasteText(text)
          break
        }
      } else {
        const text = await navigator.clipboard.readText()
        if (text.trim()) onPasteText(text)
      }
    } catch {
      /* Reading was refused or the clipboard is empty: the keyboard's paste still works. */
    }
    fieldRef.current?.focus()
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) take(dropped)
  }

  const linkName = link
    ? linkKind === 'article_url'
      ? t.input.link.article
      : link.platform === 'youtube' || link.platform === 'tiktok'
        ? t.input.link[link.platform]
        : t.input.link.video
    : null
  // After a failed attempt on this link the tag says only what was recognised: it must not go
  // on promising. Any change to the field clears the error, and the promise comes back.
  const linkLabel =
    linkName && !hasError
      ? `${linkName} — ${linkKind === 'article_url' ? t.input.linkPromise.article : t.input.linkPromise.video}`
      : linkName
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
      <label htmlFor={`${id}-field`} className="sr-only">
        {t.input.label}
      </label>

      {/* The command surface: one panel that takes a text, a link, a picture, a clip. It lights
          while it has the focus or something is being dropped on it. */}
      <div
        data-testid="composer"
        className={cn(
          'panel relative p-2 transition-shadow duration-300 focus-within:shadow-glow',
          dragging && 'shadow-glow',
        )}
      >

      {/* What the reader is doing, said once for a screen reader as it changes. */}
      <p role="status" aria-live="polite" className="sr-only">
        {reading ? t.input.imageReading : read ? t.input.imageRead : ''}
      </p>

      {notice ? (
        <p role="status" className="flex items-start gap-2 px-2 pt-2 text-sm text-ink">
          <StateGlyph state="needs_review" className="mt-0.5 size-[18px]" />
          {notice}
        </p>
      ) : null}

      {image ? (
        <div data-testid="image-row" className="m-2 flex items-center gap-3 rounded-control border border-rule-strong p-2">
          {noPreview === image.preview ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sheet border">
              <ImageIcon aria-hidden="true" className="size-5 text-quiet" />
            </span>
          ) : (
            <img
              src={image.preview}
              alt=""
              onError={() => setNoPreview(image.preview)}
              className="size-10 shrink-0 rounded-sheet border object-cover"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-with-page" dir="auto">
              {image.file.name}
            </span>
            <span className="tabular block text-sm text-quiet">
              {reading
                ? t.input.imageReading
                : image.status === 'failed'
                  ? t.input.imageFailed
                  : (() => {
                      const { size, unit } = formatFileSize(image.file.size)
                      return t.input.fileSize(size, unit)
                    })()}
            </span>
          </span>
          <Button type="button" variant="ghost" size="icon-touch" aria-label={t.input.imageRemove} onClick={onImageRemove}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {read ? <p className="px-2 text-sm font-semibold text-ink">{t.input.imageRead}</p> : null}

      {file ? (
        <div className="m-2 flex items-center gap-3 rounded-control border border-rule-strong p-3">
          <FileAudio aria-hidden="true" className="size-5 shrink-0 text-quiet" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-with-page" dir="auto">
              {file.name}
            </span>
            <span className="tabular block text-sm text-quiet">
              {(() => {
                const { size, unit } = formatFileSize(file.size)
                return `${t.input.fileSize(size, unit)} — ${t.input.fileMedia}`
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
        <div className="relative" dir={fieldDir}>
          <textarea
            id={`${id}-field`}
            ref={fieldRef}
            dir={fieldDir}
            value={draft.text}
            onChange={(event) => onChange({ text: event.target.value, linkAs: null })}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            placeholder={imageInput ? t.input.placeholderImage : t.input.placeholder}
            aria-invalid={hasError || overLimit || undefined}
            aria-describedby={hasError ? errorId : undefined}
            aria-busy={reading || undefined}
            disabled={reading}
            rows={4}
            className={cn(
              // The panel around it carries the edge and the focus light; the field itself has none.
              'block max-h-[50vh] min-h-32 w-full resize-none rounded-control border border-transparent bg-transparent px-3 pt-2 pb-2 text-ink field-sizing-content placeholder:font-sans placeholder:text-base placeholder:leading-10 placeholder:text-quiet focus-visible:outline-none disabled:opacity-60 aria-invalid:border-contra',
              fieldFace,
              // Room at the end of the first line for × (or for «لصق» while the field is empty).
              draft.text ? 'pe-12' : canPaste && 'pe-24',
            )}
          />
          {/* A word the reader could not read is written «[?]». Each one is ringed, in place:
              this layer repeats the field's text invisibly and draws only the rings. */}
          {unread > 0 ? (
            <div
              aria-hidden="true"
              dir={fieldDir}
              className={cn(
                'pointer-events-none absolute inset-0 overflow-hidden border border-transparent px-3 pt-2 pb-2 pe-12 break-words whitespace-pre-wrap text-transparent',
                fieldFace,
              )}
              style={scrollbar ? { paddingInlineEnd: `calc(3rem + ${scrollbar}px)` } : undefined}
            >
              <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                {draft.text.split(UNREAD_MARK).map((part, i, all) => (
                  <Fragment key={i}>
                    {part}
                    {i < all.length - 1 ? (
                      <mark className="rounded-sheet bg-transparent text-transparent outline-[1.5px] outline-offset-2 outline-review">
                        {UNREAD_MARK}
                      </mark>
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
          {draft.text && !reading ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.input.clear}
              onClick={() => {
                onChange({ text: '', linkAs: null })
                if (image) onImageRemove()
                fieldRef.current?.focus()
              }}
              className="absolute end-2 top-2 text-quiet"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
          {!draft.text && !reading && canPaste ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="paste"
              onClick={() => void pasteClipboard()}
              className="absolute end-2 top-2 text-quiet"
            >
              <ClipboardPaste aria-hidden="true" />
              {t.input.paste}
            </Button>
          ) : null}
          {dragging ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-green">
              {t.input.dropHere}
            </p>
          ) : null}
        </div>
      )}

      {/* What the reader says about its own reading: unread words, an uncertain reading, and the
          noise it left out, word for word. */}
      {read && !file ? (
        <div className="space-y-2 px-2 pt-1 text-sm">
          {unread > 0 ? (
            <p data-testid="image-unread" className="flex items-start gap-2 font-semibold text-review-ink">
              <StateGlyph state="needs_review" className="mt-0.5 size-[18px]" />
              {t.input.imageUnread(unread)}
            </p>
          ) : null}
          {read.low_confidence ? (
            <p className="flex items-start gap-2 text-ink">
              <StateGlyph state="needs_review" className="mt-0.5 size-[18px]" />
              {t.input.imageUncertain}
            </p>
          ) : null}
          {read.removed.length > 0 ? (
            <details className="group">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-green [&::-webkit-details-marker]:hidden">
                {t.input.imageRemoved(read.removed.length)}
                <ChevronDown aria-hidden="true" className="size-4 text-quiet transition-transform duration-150 group-open:rotate-180" />
              </summary>
              <ul className="list-inside list-disc space-y-1 pb-1 text-ink">
                {read.removed.map((item, i) => (
                  <li key={i} dir="auto">
                    {item}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {link && linkLabel ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pt-1">
          <span
            data-testid="link-tag"
            className="inline-flex min-h-8 items-center gap-2 rounded-tag bg-accent ps-3 pe-1 text-sm text-ink"
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
        <p className={cn('tabular px-2 pt-1 text-sm text-quiet', overLimit && 'font-semibold text-contra-ink')} dir="ltr">
          {t.input.chars(draft.text.length, limits.max_text_chars)}
        </p>
      ) : null}

      {/* No `capture`: with it a phone would open the camera only, never the gallery. */}
      <input
        ref={fileInput}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) take(chosen)
          event.target.value = ''
        }}
      />
      {/* The foot of the panel: what can be attached, and the one action. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
      <div role="group" aria-label={t.input.attach} className="flex min-w-0 flex-1 flex-wrap gap-x-1">
        {attachments.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="touch"
            title={
              kind === 'link'
                ? undefined
                : kind === 'image'
                  ? t.input.fileLimit(limits.max_image_mb ?? 10)
                  : t.input.fileLimit(limits.max_upload_mb)
            }
            onClick={() => (kind === 'link' ? void attachLink() : openPicker(kind))}
            className="px-2.5"
          >
            <Icon aria-hidden="true" className="text-quiet" />
            {label}
          </Button>
        ))}
      </div>

      <Button type="submit" size="xl" data-testid="verify" disabled={reading} className="max-sm:w-full">
        <ArrowUp aria-hidden="true" />
        {t.input.verify}
      </Button>
      </div>
      </div>

      {error ? <div className="mt-4">{error}</div> : null}

      {/* The row keeps its height while /api/meta is on its way, so nothing below it moves. */}
      {/* The examples: one row that scrolls sideways under the thumb on a phone, wrapped above that. */}
      <div className="scroll-row -mx-4 mt-4 flex min-h-11 items-center gap-2 px-4 max-md:[&>*]:shrink-0 md:mx-0 md:mt-5 md:flex-wrap md:overflow-visible md:px-0">
        {examples.length > 0 ? <span className="text-sm text-quiet">{t.input.examples}</span> : null}
        {examples.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => onExample(example)}
            className="min-h-9 rounded-tag border border-rule-strong px-4 text-sm text-ink transition-colors duration-150 hover:bg-accent"
          >
            {lang === 'ar' ? example.label_ar : example.label_en}
          </button>
        ))}
      </div>


    </form>
  )
}
