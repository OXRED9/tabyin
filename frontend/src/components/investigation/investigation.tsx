import {
  AudioLines,
  BookOpenText,
  Check,
  FileText,
  Library,
  Minus,
  MousePointerClick,
  Scale,
  ScrollText,
  Sparkles,
  TextSearch,
  TriangleAlert,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import { useCountUp } from '@/hooks/use-count-up'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useI18n } from '@/lib/i18n'
import { figuresText } from '@/lib/pipeline'
import type { Figure, LogLine, NodeId, NodeStatus, PipelineNode } from '@/lib/pipeline'
import { cn } from '@/lib/utils'

/*
 * The investigation, shown (docs/DESIGN.md §10): a live map of the pipeline. Nodes light on their
 * real events, counters run up to the real numbers, a pulse travels the links that lead to a
 * node while it works, and a log prints each step with its figures and its time. Everything here
 * is drawn from `lib/pipeline.ts`, which reads only what the server sent.
 *
 * At 1024px and up it is a map in four columns; below that, a vertical timeline. With reduced
 * motion nothing moves: the same nodes are a checklist that ticks. The map, the timeline and the
 * log each hold their full size from the first event, so nothing under them moves as they fill.
 */

const ICONS: Record<NodeId, typeof FileText> = {
  input: FileText,
  read: AudioLines,
  mushaf: BookOpenText,
  narrations: Library,
  model: Sparkles,
  gradings: ScrollText,
  pointer: MousePointerClick,
  rules: Scale,
  report: TextSearch,
}

/** A number runs up to its value; anything else is shown as it is. */
function Value({ value }: { value: number | string }) {
  return typeof value === 'number' ? <Counter value={value} /> : <>{value}</>
}
function Counter({ value }: { value: number }) {
  return <>{useCountUp(value).toLocaleString('en-US')}</>
}

function Figures({ figures, className }: { figures: Figure[]; className?: string }) {
  if (figures.length === 0) return null
  return (
    <span className={cn('tabular flex flex-wrap gap-x-3 text-sm', className)}>
      {figures.map((figure) => (
        <span key={figure.label} className="whitespace-nowrap">
          <span className="text-quiet">{figure.label} </span>
          <span className="font-semibold text-figure">
            <Value value={figure.value} />
          </span>
        </span>
      ))}
    </span>
  )
}

/** The node's state, said three ways: its edge (CSS), this mark, and a word for a screen reader. */
function StatusMark({ status }: { status: NodeStatus }) {
  const { t } = useI18n()
  return (
    <span className="flex size-5 shrink-0 items-center justify-center" data-mark={status}>
      {status === 'done' ? (
        <Check aria-hidden="true" className="size-4 text-green" />
      ) : status === 'active' ? (
        <span aria-hidden="true" className="size-2.5 animate-live rounded-tag bg-gold" />
      ) : status === 'skipped' ? (
        <Minus aria-hidden="true" className="size-4 text-quiet" />
      ) : status === 'warning' ? (
        <TriangleAlert aria-hidden="true" className="size-4 text-review" />
      ) : (
        <span aria-hidden="true" className="size-2 rounded-tag border border-rule-strong" />
      )}
      <span className="sr-only">{t.pipeline.status[status]}</span>
    </span>
  )
}

function Detail({ node }: { node: PipelineNode }) {
  return node.modelId ? (
    <bdi dir="ltr" title={node.detail} className="tabular block truncate text-sm text-ink">
      {node.detail}
    </bdi>
  ) : (
    <span title={node.detail} className="block truncate text-sm text-quiet">
      {node.detail}
    </span>
  )
}

// ── The map (1024px and up) ───────────────────────────────────────────────────────────────────

/** The four columns, in the order the work flows; a column's nodes are stacked. */
const COLUMNS: NodeId[][] = [
  ['input', 'read'],
  ['mushaf', 'narrations', 'model'],
  ['gradings', 'pointer'],
  ['rules', 'report'],
]
/**
 * The map's measures, in the units of its links' drawing (16 to the rem): nodes are 6.5rem tall
 * with 0.75rem between them, centred in a map three nodes high; a link's column is 3rem wide.
 * The drawing is laid out in these same units, so it scales with the text and never stretches.
 */
const NODE = 104
const GAP = 12
const MAP_HEIGHT = NODE * 3 + GAP * 2
const LINK_WIDTH = 48
const centres = (count: number) =>
  Array.from({ length: count }, (_, i) => MAP_HEIGHT / 2 + (i - (count - 1) / 2) * (NODE + GAP))
/** Links between neighbouring columns: from which nodes of the left one to which of the right. */
const LINKS: { from: NodeId[]; to: NodeId[] }[] = [
  { from: ['read'], to: ['mushaf', 'narrations', 'model'] },
  { from: ['mushaf', 'narrations', 'model'], to: ['gradings', 'pointer'] },
  { from: ['gradings', 'pointer'], to: ['rules'] },
]

function MapNode({ node }: { node: PipelineNode }) {
  const Icon = ICONS[node.id]
  return (
    <li data-node={node.id} data-status={node.status} className="node flex h-[6.5rem] min-w-0 flex-col justify-center gap-0.5 px-3">
      <span className="flex items-center gap-2">
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', node.status === 'waiting' || node.status === 'skipped' ? 'text-quiet' : 'text-green')} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{node.title}</span>
        <StatusMark status={node.status} />
      </span>
      <Detail node={node} />
      <Figures figures={node.figures} className="min-h-[1.4rem]" />
    </li>
  )
}

function Links({ group, nodes }: { group: (typeof LINKS)[number]; nodes: Map<NodeId, PipelineNode> }) {
  const left = COLUMNS.find((column) => column.includes(group.from[0]))!
  const right = COLUMNS.find((column) => column.includes(group.to[0]))!
  const y = (column: NodeId[], id: NodeId) => centres(column.length)[column.indexOf(id)]
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${LINK_WIDTH} ${MAP_HEIGHT}`}
      // The work flows with the reading direction: mirrored where the page reads right to left.
      className="h-full w-full rtl:-scale-x-100"
    >
      {group.from.flatMap((from) =>
        group.to.map((to) => {
          const source = nodes.get(from)!
          const target = nodes.get(to)!
          const d = `M0 ${y(left, from)} C ${LINK_WIDTH / 2} ${y(left, from)}, ${LINK_WIDTH / 2} ${y(right, to)}, ${LINK_WIDTH} ${y(right, to)}`
          // A link carries a pulse while the node it leads to works, and stays lit once both ends ran.
          const ran = (status: NodeStatus) => status === 'done' || status === 'warning'
          const lit = ran(source.status) && ran(target.status)
          const pulsing = target.status === 'active' && source.status !== 'waiting' && source.status !== 'skipped'
          return (
            <g key={`${from}-${to}`}>
              <path
                d={d}
                className="link"
                data-lit={lit || undefined}
                data-pulsing={pulsing || undefined}
                strokeDasharray={target.status === 'skipped' || source.status === 'skipped' ? '3 4' : undefined}
              />
              <path d={d} pathLength={1} className="link-pulse" data-on={pulsing || undefined} />
            </g>
          )
        }),
      )}
    </svg>
  )
}

/** The short vertical tie between two stacked nodes that follow one another. */
function Tie({ lit, pulsing }: { lit: boolean; pulsing: boolean }) {
  return (
    <li aria-hidden="true" className="flex h-3 justify-center">
      <span className={cn('w-px transition-colors duration-300', lit ? 'bg-green' : 'bg-rule', pulsing && 'animate-live bg-gold')} />
    </li>
  )
}

function PipelineMap({ nodes }: { nodes: PipelineNode[] }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <div data-testid="pipeline-map" className="grid h-[21rem] grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_3rem_minmax(0,1fr)_3rem_minmax(0,1fr)]">
      {COLUMNS.map((column, index) => {
        // The first and last columns are sequences (the input is read; the rules lead to the
        // report): their two nodes are tied by a short line instead of a gap.
        const sequence = index === 0 || index === COLUMNS.length - 1
        return [
          <ol key={column[0]} className={cn('flex min-w-0 flex-col justify-center', sequence ? '' : 'gap-3')}>
            {column.map((id, i) => {
              const node = byId.get(id)!
              const next = sequence && i === 0 ? byId.get(column[1])! : null
              return [
                <MapNode key={id} node={node} />,
                next ? (
                  <Tie
                    key={`${id}-tie`}
                    lit={next.status === 'done'}
                    pulsing={next.status === 'active'}
                  />
                ) : null,
              ]
            })}
          </ol>,
          index < LINKS.length ? <Links key={`links-${index}`} group={LINKS[index]} nodes={byId} /> : null,
        ]
      })}
    </div>
  )
}

// ── The timeline (below 1024px) ───────────────────────────────────────────────────────────────

/**
 * Each step is two lines of fixed height — its name, then what it is doing or the figures it
 * reported — so the timeline keeps its length from the first event to the last and nothing under
 * it moves while it fills.
 */
function Timeline({ nodes }: { nodes: PipelineNode[] }) {
  return (
    <ol data-testid="pipeline-timeline" className="relative">
      {nodes.map((node, i) => {
        const Icon = ICONS[node.id]
        const last = i === nodes.length - 1
        const next = nodes[i + 1]
        return (
          <li key={node.id} data-node={node.id} data-status={node.status} className={cn('relative flex gap-3', !last && 'pb-2')}>
            {/* The line down to the next step: lit when that step has run, pulsing while it works. */}
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute start-[0.9375rem] top-8 bottom-0 w-px',
                  next.status === 'done' || next.status === 'warning' ? 'bg-green' : 'bg-rule',
                  next.status === 'active' && 'animate-live bg-gold',
                )}
              />
            )}
            <span className="node mt-1 flex size-8 shrink-0 items-center justify-center" data-status={node.status}>
              <Icon aria-hidden="true" className={cn('size-4', node.status === 'waiting' || node.status === 'skipped' ? 'text-quiet' : 'text-green')} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex h-5 items-center gap-2">
                <span className={cn('min-w-0 truncate text-sm font-semibold', node.status === 'waiting' ? 'text-quiet' : 'text-ink')}>{node.title}</span>
                <StatusMark status={node.status} />
              </span>
              <span className="flex h-[22px] items-center gap-3 overflow-hidden whitespace-nowrap">
                {node.modelId || node.figures.length === 0 ? <Detail node={node} /> : null}
                <Figures figures={node.figures} className="flex-nowrap" />
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── The log ───────────────────────────────────────────────────────────────────────────────────

/**
 * How many lines a full run prints: the log holds that much room from the start. Where the
 * window is narrow a line with several figures takes two, and two of the six have several.
 */
const LOG_LINES = 6
const LOG_WRAPPED = 2

function Log({ lines }: { lines: LogLine[] }) {
  const { t } = useI18n()
  return (
    <ol
      aria-label={t.pipeline.log}
      data-testid="pipeline-log"
      style={{ '--log-lines': LOG_LINES, '--log-wrapped': LOG_WRAPPED } as CSSProperties}
      // Under the timeline on a phone, beside it on a tablet, under the map in two columns from 1024px.
      className="grid min-h-[calc((var(--log-lines)+var(--log-wrapped))*1.5rem+0.8125rem)] content-start gap-x-8 border-t pt-3 md:max-lg:min-h-0 md:max-lg:border-s md:max-lg:border-t-0 md:max-lg:ps-6 md:max-lg:pt-0 lg:min-h-[calc(var(--log-lines)/2*1.5rem+0.8125rem)] lg:grid-cols-2"
    >
      {lines.map((line) => {
        const said = line.figures.length > 0 ? figuresText(line.figures) : line.detail
        return (
          <li key={line.id} data-line={line.id} className="flex min-h-6 min-w-0 animate-rise items-start gap-2 text-sm leading-6 lg:h-6">
            <span className="flex h-6 shrink-0 items-center">
              <StatusMark status={line.status} />
            </span>
            <span className="shrink-0 font-semibold text-ink">{line.title}</span>
            <span title={said} className="tabular min-w-0 flex-1 text-quiet lg:truncate">
              {said}
            </span>
            {line.ms !== null ? <span className="tabular shrink-0 text-figure">{t.pipeline.ms(line.ms)}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function Investigation({
  nodes,
  log,
  head,
}: {
  nodes: PipelineNode[]
  log: LogLine[]
  /** What stands above the map: the progress line while it runs, a title when it is replayed. */
  head: ReactNode
}) {
  const { t } = useI18n()
  const wide = useMediaQuery('(min-width: 1024px)')
  return (
    <section aria-label={t.pipeline.title} data-testid="investigation" className="panel relative overflow-hidden">
      <div aria-hidden="true" className="field-points pointer-events-none absolute inset-0" />
      <div className="relative space-y-4 p-4 md:p-5">
        {head}
        <div className="space-y-4 md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:gap-6 md:max-lg:space-y-0">
          {wide ? <PipelineMap nodes={nodes} /> : <Timeline nodes={nodes} />}
          <Log lines={log} />
        </div>
      </div>
    </section>
  )
}
