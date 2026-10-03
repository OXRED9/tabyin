import { ChevronDown, Undo2, UserRoundCheck } from 'lucide-react'
import { useId, useState } from 'react'

import { StateWord } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'
import { STATES_FOR_SUMMARY, allowedReviewerStates } from '@/lib/states'
import { readStored, writeStored } from '@/lib/storage'
import type { Card, EvidenceState, ReviewerOverride } from '@/lib/types'

const REVIEWER_KEY = 'tabayyun.reviewer'

/**
 * Reviewer mode: a human changes the state of a note, with a remark and a name. The change is
 * kept beside the card as a `reviewer_override`; the rule-made state is never overwritten.
 */
export function ReviewerPanel({
  card,
  override,
  onSave,
  onRemove,
}: {
  card: Card
  override: ReviewerOverride | undefined
  onSave: (override: ReviewerOverride) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const ids = useId()
  const { states: allowed, reason } = allowedReviewerStates(card)
  const [state, setState] = useState<EvidenceState>(override?.state ?? card.state)
  const [note, setNote] = useState(override?.note ?? '')
  const [name, setName] = useState(() => override?.reviewer ?? readStored<string>(REVIEWER_KEY, ''))
  const [nudge, setNudge] = useState(false)

  const reasonText =
    reason === 'levelD' ? t.reviewer.levelD : reason === 'levelC' ? t.reviewer.levelC : reason === 'needsSource' ? t.reviewer.needsSource : null

  const save = () => {
    const trimmedNote = note.trim()
    const unchanged = state === (override?.state ?? card.state) && trimmedNote === (override?.note ?? '')
    if ((state === card.state && !trimmedNote) || unchanged) {
      setNudge(true)
      return
    }
    setNudge(false)
    writeStored(REVIEWER_KEY, name.trim())
    onSave({
      card_id: card.id,
      original_state: card.state,
      state,
      note: trimmedNote,
      reviewer: name.trim(),
      at: new Date().toISOString(),
    })
  }

  return (
    <section aria-label={t.reviewer.title} className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <UserRoundCheck aria-hidden="true" className="size-4 text-quiet" />
        {t.reviewer.title}
      </h4>

      {reason === 'levelD' ? (
        <p className="text-sm">{t.reviewer.levelD}</p>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-state`} className="text-quiet">
              {t.reviewer.state}
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id={`${ids}-state`} type="button" variant="outline" size="touch" className="w-full justify-between px-3">
                  <StateWord state={state} full />
                  <ChevronDown aria-hidden="true" className="text-quiet" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuRadioGroup
                  value={state}
                  onValueChange={(value) => {
                    setState(value as EvidenceState)
                    setNudge(false)
                  }}
                >
                  {STATES_FOR_SUMMARY.map((option) => (
                    <DropdownMenuRadioItem
                      key={option}
                      value={option}
                      disabled={!allowed.includes(option) && option !== card.state}
                    >
                      <StateWord state={option} full />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-note`} className="text-quiet">
              {t.reviewer.note}
            </Label>
            <Input
              id={`${ids}-note`}
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                setNudge(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  save()
                }
              }}
              placeholder={t.reviewer.notePlaceholder}
              maxLength={500}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-name`} className="text-quiet">
              {t.reviewer.name}
            </Label>
            <Input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.reviewer.namePlaceholder}
              autoComplete="name"
              maxLength={80}
            />
          </div>
          {reasonText ? <p className="text-sm text-quiet">{reasonText}</p> : null}
          {nudge ? (
            <p role="status" className="text-sm font-medium text-contra-ink">
              {t.reviewer.nothingToSave}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="touch" onClick={save}>
              {t.reviewer.save}
            </Button>
            {override ? (
              <Button type="button" variant="outline" size="touch" onClick={onRemove}>
                <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />
                {t.reviewer.remove}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
