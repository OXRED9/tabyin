import { FileAudio, FileText, FileUp, Link2, LoaderCircle, Newspaper, Video, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, ReactNode, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { InputDraft } from '@/lib/draft'
import { formatFileSize } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { InputType, Meta } from '@/lib/types'
import { cn } from '@/lib/utils'

const TAB_ICONS: Record<InputType, typeof FileText> = {
  text: FileText,
  article_url: Newspaper,
  video_url: Video,
  file: FileUp,
}
const TAB_ORDER: InputType[] = ['text', 'article_url', 'video_url', 'file']

interface InputPanelProps {
  draft: InputDraft
  onChange: (patch: Partial<InputDraft>) => void
  onSubmit: () => void
  running: boolean
  /** Once a report is on screen the field shrinks, so the result is the focus. */
  compact: boolean
  limits: Meta['limits']
  hasError: boolean
  errorId: string
  error: ReactNode
  fieldRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>
}

export function VerifyButton({
  running,
  onClick,
  className,
}: {
  running: boolean
  onClick?: () => void
  className?: string
}) {
  const { t } = useI18n()
  return (
    <Button
      type={onClick ? 'button' : 'submit'}
      variant="gold"
      size="xl"
      onClick={onClick}
      disabled={running}
      aria-busy={running}
      data-testid="verify"
      className={cn('min-w-32 disabled:opacity-90', className)}
    >
      {running ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          {t.input.verifying}
        </>
      ) : (
        t.input.verify
      )}
    </Button>
  )
}

export function InputPanel({
  draft,
  onChange,
  onSubmit,
  running,
  compact,
  limits,
  hasError,
  errorId,
  error,
  fieldRef,
}: InputPanelProps) {
  const { t } = useI18n()
  const ids = useId()
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const submitOnShortcut = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) onChange({ file })
  }

  const describedBy = hasError ? errorId : undefined
  const urlClass = 'h-12 rounded-xl bg-background px-4 text-start font-mono text-sm md:text-sm'

  return (
    <Card className="p-4 sm:p-6">
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Tabs
        value={draft.tab}
        onValueChange={(value) => onChange({ tab: value as InputType })}
        className="gap-4"
      >
        <TabsList
          aria-label={t.input.tabsLabel}
          className="h-auto w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          {TAB_ORDER.map((tab) => {
            const Icon = TAB_ICONS[tab]
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                disabled={running}
                className="h-9 flex-none rounded-full border border-border bg-muted px-3 text-sm font-medium text-foreground/80 hover:border-primary/40 hover:bg-secondary data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none sm:px-4 dark:text-foreground/80 dark:data-active:border-primary dark:data-active:bg-primary dark:data-active:text-primary-foreground"
              >
                <Icon aria-hidden="true" className="hidden min-[400px]:block" />
                {t.input.tabs[tab]}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="text" className="space-y-3">
          <label htmlFor={`${ids}-text`} className="sr-only">
            {t.input.textLabel}
          </label>
          <div className="relative">
            <Textarea
              id={`${ids}-text`}
              ref={fieldRef as RefObject<HTMLTextAreaElement>}
              dir="auto"
              value={draft.text}
              onChange={(event) => onChange({ text: event.target.value })}
              onKeyDown={submitOnShortcut}
              placeholder={t.input.textPlaceholder}
              aria-invalid={hasError || undefined}
              aria-describedby={describedBy}
              disabled={running}
              rows={compact ? 2 : 6}
              className={cn(
                'resize-y rounded-xl bg-background p-4 pe-12 text-base leading-loose md:text-base',
                compact ? 'max-h-40 min-h-20' : 'max-h-[50vh] min-h-40',
              )}
            />
            {draft.text && !running ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.input.clear}
                onClick={() => {
                  onChange({ text: '' })
                  fieldRef.current?.focus()
                }}
                className="absolute end-2 top-2 text-muted-foreground"
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {error}
          <div className="flex items-center gap-4">
            <span
              className={cn(
                'tabular text-xs text-muted-foreground',
                draft.text.length > limits.max_text_chars && 'font-semibold text-destructive',
              )}
              dir="ltr"
            >
              {draft.text.length > 0 ? t.input.chars(draft.text.length, limits.max_text_chars) : ''}
            </span>
            <VerifyButton running={running} className="ms-auto hidden sm:inline-flex" />
          </div>
        </TabsContent>

        {(['article_url', 'video_url'] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-3">
            <label htmlFor={`${ids}-${tab}`} className="sr-only">
              {tab === 'article_url' ? t.input.articleLabel : t.input.videoLabel}
            </label>
            <div className="flex items-center gap-3">
              <div dir="ltr" className="relative min-w-0 flex-1">
                <Link2
                  aria-hidden="true"
                  className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id={`${ids}-${tab}`}
                  ref={draft.tab === tab ? (fieldRef as RefObject<HTMLInputElement>) : undefined}
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft[tab]}
                  onChange={(event) => onChange({ [tab]: event.target.value })}
                  placeholder={tab === 'article_url' ? t.input.articlePlaceholder : t.input.videoPlaceholder}
                  aria-invalid={hasError || undefined}
                  aria-describedby={describedBy}
                  disabled={running}
                  className={cn(urlClass, 'ps-12')}
                />
              </div>
              <VerifyButton running={running} className="hidden sm:inline-flex" />
            </div>
            {error}
          </TabsContent>
        ))}

        <TabsContent value="file" className="space-y-3">
          <input
            ref={fileInput}
            id={`${ids}-file`}
            type="file"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.mp4,.mov,.mkv,.webm"
            className="peer sr-only"
            disabled={running}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange({ file: event.target.files?.[0] ?? null })
              event.target.value = ''
            }}
          />
          {draft.file ? (
            <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <FileAudio aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" dir="auto">
                  {draft.file.name}
                </span>
                <span className="tabular block text-xs text-muted-foreground">
                  {(() => {
                    const { size, unit } = formatFileSize(draft.file.size)
                    return t.input.fileSize(size, unit)
                  })()}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={t.input.fileRemove}
                disabled={running}
                onClick={() => onChange({ file: null })}
              >
                <X aria-hidden="true" />
              </Button>
              <VerifyButton running={running} className="hidden sm:inline-flex" />
            </div>
          ) : (
            <label
              htmlFor={`${ids}-file`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-background px-4 text-center transition-colors hover:border-primary hover:bg-secondary/60 peer-focus-visible:border-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40',
                compact ? 'py-4' : 'py-8',
                dragging && 'border-primary bg-secondary',
                hasError && 'border-missing',
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <FileUp aria-hidden="true" className="size-5" />
              </span>
              <span className="text-sm font-medium">{t.input.fileDrop}</span>
              <span className="text-sm font-medium text-primary underline underline-offset-4">
                {t.input.fileBrowse}
              </span>
              <span className="text-xs text-muted-foreground">{t.input.fileLimit(limits.max_upload_mb)}</span>
            </label>
          )}
          {error}
          {!draft.file ? (
            <div className="hidden justify-end sm:flex">
              <VerifyButton running={running} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </form>
    </Card>
  )
}
