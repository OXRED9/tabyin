import { useCallback, useEffect, useReducer, useRef } from 'react'

import { ApiFailure, verifyStream } from '@/lib/api'
import type { HistoryEntry, SubmittedInput } from '@/lib/history'
import { stubFromCard } from '@/lib/report'
import type {
  ApiError,
  Card,
  ClaimStub,
  Segment,
  SourceInfo,
  StageEvent,
  StageId,
  StreamEvent,
  Summary,
  UiLang,
  VerifyInput,
} from '@/lib/types'

export type Phase = 'idle' | 'running' | 'done'

export interface VerifyState {
  phase: Phase
  /** Bumps on every run, so views can reset their own local state. */
  run: number
  input: SubmittedInput | null
  /** Latest event per stage. */
  stages: Partial<Record<StageId, StageEvent>>
  /** Highest stage index seen so far (0 before the first event). */
  highestStage: number
  eta: { seconds: number; at: number } | null
  source: SourceInfo | null
  segments: Segment[]
  /** One skeleton per claim, upserted by id: `claims` events are additive. */
  claims: ClaimStub[]
  cards: Record<string, Card>
  summary: Summary | null
  fatalError: ApiError | null
  /** Non-fatal `error` events: `no_claims`, `llm_unavailable`. */
  notices: ApiError[]
  startedAt: number | null
  generatedAt: string | null
  /** True when the report was reopened from local history rather than just produced. */
  restored: boolean
}

const initialState: VerifyState = {
  phase: 'idle',
  run: 0,
  input: null,
  stages: {},
  highestStage: 0,
  eta: null,
  source: null,
  segments: [],
  claims: [],
  cards: {},
  summary: null,
  fatalError: null,
  notices: [],
  startedAt: null,
  generatedAt: null,
  restored: false,
}

type Action =
  | { type: 'start'; input: SubmittedInput }
  | { type: 'event'; event: StreamEvent }
  | { type: 'closed' }
  | { type: 'failed'; error: ApiError }
  | { type: 'cancelled' }
  | { type: 'reset' }
  | { type: 'restore'; entry: HistoryEntry }
  | { type: 'clear-error' }
  | { type: 'local-error'; error: ApiError }

const interrupted: ApiError = {
  code: 'stream_interrupted',
  stage: null,
  fatal: true,
  message_ar: '',
  message_en: '',
}

function upsertClaims(current: ClaimStub[], incoming: ClaimStub[]): ClaimStub[] {
  const next = [...current]
  for (const claim of incoming) {
    const at = next.findIndex((c) => c.id === claim.id)
    if (at === -1) next.push(claim)
    else next[at] = claim
  }
  return next
}

function applyEvent(state: VerifyState, event: StreamEvent): VerifyState {
  switch (event.event) {
    case 'stage': {
      const data = event.data
      return {
        ...state,
        stages: { ...state.stages, [data.stage]: data },
        highestStage: Math.max(state.highestStage, data.index),
        eta:
          typeof data.eta_seconds === 'number'
            ? { seconds: data.eta_seconds, at: Date.now() }
            : state.eta,
      }
    }
    case 'source':
      return { ...state, source: event.data }
    case 'segments':
      return { ...state, segments: event.data.segments ?? [] }
    case 'claims':
      return { ...state, claims: upsertClaims(state.claims, event.data.claims ?? []) }
    case 'card': {
      const card = event.data
      // A card may arrive before its skeleton was announced: make sure it has a slot.
      const claims = state.claims.some((c) => c.id === card.id)
        ? state.claims
        : [...state.claims, stubFromCard(card)]
      return { ...state, claims, cards: { ...state.cards, [card.id]: card } }
    }
    case 'summary':
      return { ...state, summary: event.data }
    case 'error':
      return event.data.fatal
        ? { ...state, fatalError: event.data }
        : { ...state, notices: [...state.notices.filter((n) => n.code !== event.data.code), event.data] }
    case 'done':
      return state
    default:
      return state
  }
}

function reducer(state: VerifyState, action: Action): VerifyState {
  switch (action.type) {
    case 'start':
      return {
        ...initialState,
        phase: 'running',
        run: state.run + 1,
        input: action.input,
        startedAt: Date.now(),
      }
    case 'event':
      return state.phase === 'running' ? applyEvent(state, action.event) : state
    case 'closed': {
      if (state.phase !== 'running') return state
      if (state.fatalError) return { ...state, phase: 'idle', eta: null }
      if (state.summary) {
        return { ...state, phase: 'done', eta: null, generatedAt: new Date().toISOString() }
      }
      // The stream ended without a summary and without saying why.
      return { ...state, phase: 'idle', eta: null, fatalError: interrupted }
    }
    case 'failed':
      return { ...state, phase: 'idle', eta: null, fatalError: action.error }
    case 'cancelled':
      return { ...initialState, run: state.run + 1, input: state.input }
    case 'reset':
      return { ...initialState, run: state.run + 1 }
    case 'restore': {
      const { report, input } = action.entry
      return {
        ...initialState,
        phase: 'done',
        run: state.run + 1,
        input,
        highestStage: 5,
        source: report.source,
        segments: report.segments,
        claims: report.cards.map(stubFromCard),
        cards: Object.fromEntries(report.cards.map((card) => [card.id, card])),
        summary: report.summary,
        generatedAt: report.generated_at,
        restored: true,
      }
    }
    case 'clear-error':
      return state.fatalError ? { ...state, fatalError: null } : state
    case 'local-error':
      return { ...state, fatalError: action.error }
    default:
      return state
  }
}

function describeInput(input: VerifyInput): SubmittedInput {
  if (input.input_type === 'text') return { input_type: 'text', text: input.text }
  if (input.input_type === 'file') return { input_type: 'file', file_name: input.file.name }
  return { input_type: input.input_type, url: input.url }
}

export function useVerify(lang: UiLang) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback(
    async (input: VerifyInput) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      dispatch({ type: 'start', input: describeInput(input) })
      try {
        await verifyStream(
          input,
          lang,
          (event) => {
            if (!current.signal.aborted) dispatch({ type: 'event', event })
          },
          current.signal,
        )
        if (!current.signal.aborted) dispatch({ type: 'closed' })
      } catch (cause) {
        if (current.signal.aborted) return
        const error: ApiError =
          cause instanceof ApiFailure
            ? cause.error
            : { code: 'internal', stage: null, fatal: true, message_ar: '', message_en: '' }
        dispatch({ type: 'failed', error })
      }
    },
    [lang],
  )

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    dispatch({ type: 'cancelled' })
  }, [])

  const reset = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    dispatch({ type: 'reset' })
  }, [])

  const restore = useCallback((entry: HistoryEntry) => {
    controller.current?.abort()
    controller.current = null
    dispatch({ type: 'restore', entry })
  }, [])

  const clearError = useCallback(() => dispatch({ type: 'clear-error' }), [])
  const showError = useCallback((error: ApiError) => dispatch({ type: 'local-error', error }), [])

  return { state, start, cancel, reset, restore, clearError, showError }
}

/** Overall progress, 0–100, from the highest stage seen plus the matcher's done/total. */
export function progressPercent(state: VerifyState): number {
  if (state.phase === 'done') return 100
  if (state.highestStage === 0) return 4
  const stage = Object.values(state.stages).find((s) => s?.index === state.highestStage)
  let within = 0.35
  if (stage?.status === 'done') within = 1
  else if (stage?.total && stage.total > 0) within = Math.min(1, (stage.done ?? 0) / stage.total)
  return Math.round(Math.min(98, ((state.highestStage - 1 + within) / 5) * 100))
}
