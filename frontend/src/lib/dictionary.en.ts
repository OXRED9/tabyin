/**
 * The English UI copy. It must satisfy the shape of the Arabic dictionary, so a missing translation
 * is a type error. It is its own module so that only the language in use is loaded. No Quran
 * verse, hadith or scholar's quote may ever appear here.
 */
import type { Dictionary } from './dictionary.ar'
import type { EvidenceState } from './types'

const enCount = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const EN_NUMBER = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const enWord = (n: number) => (n >= 1 && n <= 10 ? EN_NUMBER[n] : n.toLocaleString('en-US'))
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const EN_STATE_FORMS: Record<EvidenceState, { one: string; many: string }> = {
  supported: { one: 'has a reference', many: 'have a reference' },
  supported_with_note: { one: 'has a reference with a note', many: 'have a reference with a note' },
  needs_review: { one: 'needs review', many: 'need review' },
  not_found: { one: 'has no reference', many: 'have no reference' },
  contradicted: { one: 'differs from the source', many: 'differ from the source' },
}

export const en: Dictionary = {
  appName: 'Tabayyun',
  headline: 'Verify before you believe or share',
  transparency:
    'Tabayyun is an AI-assisted tool. It does not replace consulting qualified scholars.',
  skipToContent: 'Skip to content',
  close: 'Close',
  undo: 'Undo',
  opensInNewTab: 'Opens in a new tab',

  header: {
    language: 'Interface language',
    arabic: 'عربي',
    english: 'English',
    darkOn: 'Switch to dark mode',
    darkOff: 'Switch to light mode',
    export: 'Export report',
    exportShort: 'Export',
    history: 'What you verified recently',
    home: 'Tabayyun: home',
  },

  input: {
    tabsLabel: 'Input type',
    tabs: {
      text: 'Text',
      article_url: 'Article link',
      video_url: 'Video link',
      file: 'Upload file',
    },
    label: 'Check the verses and hadith quoted in any text',
    placeholder: 'Paste a text, or a link to a clip or an article, or attach an audio file…',
    placeholderImage: 'Paste a text, or a link to a clip or an article, or attach a WhatsApp screenshot…',
    attach: 'Attach',
    attachLink: 'Link',
    attachImage: 'Picture',
    attachFile: 'File',
    attachAudio: 'Audio',
    link: {
      youtube: 'YouTube clip',
      tiktok: 'TikTok clip',
      video: 'Clip link',
      article: 'Article link',
    },
    linkPromise: {
      video: 'it will be transcribed, then verified',
      article: 'its text will be read, then verified',
    },
    linkRemove: 'Remove the link',
    asVideo: 'This is a clip',
    asArticle: 'This is an article',
    fileMedia: 'it will be transcribed, then verified',
    imageReading: 'Reading the picture…',
    imageRead: 'This is what we read from the picture — edit it if needed, then verify',
    imageUnread: (n: number) =>
      n === 1
        ? 'One word could not be read — correct it before verifying'
        : `${capital(enWord(n))} words could not be read — correct them before verifying`,
    imageUncertain: 'The reading is uncertain: compare the text with the picture before verifying.',
    imageRemoved: (n: number) => `Removed from the picture (${n})`,
    imageRemove: 'Remove the picture',
    imageFailed: 'The picture was not read',
    fileLimit: (mb: number) => `Up to ${mb} MB. The file is not stored on the server`,
    fileRemove: 'Remove file',
    dropHere: 'Drop the file here',
    fileSize: (size: string, unit: 'kb' | 'mb') => `${size} ${unit === 'kb' ? 'KB' : 'MB'}`,
    clear: 'Clear field',
    paste: 'Paste',
    chars: (n: number, max: number) => `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
    verify: 'Verify',
    verifying: 'Verifying…',
    cancel: 'Cancel',
    examples: 'Try:',
    recent: (n: number) => `What you verified recently (${n})`,
  },

  pwa: {
    install: 'Install Tabayyun on your device to share to it directly from any app',
    installButton: 'Install',
    dismiss: 'Dismiss',
    ios: 'To install Tabayyun: Safari’s share button, then “Add to Home Screen”. Sharing into it is not available on iOS; paste the text or the link.',
    shareUnavailable: 'What you shared could not be received. Paste it here instead.',
  },

  stages: {
    ingest: 'Getting the text',
    extract: 'Extracting claims',
    match: 'Matching against sources',
    rules: 'Determining the evidence state',
    report: 'Verification report',
  },

  stagesShort: {
    ingest: 'Text',
    extract: 'Extraction',
    match: 'Matching',
    rules: 'Verdict',
    report: 'Report',
  },

  progress: {
    label: 'Verification progress',
    sentence: (stage: string) => `Verifying — ${stage.charAt(0).toLowerCase()}${stage.slice(1)}`,
    stageOf: (n: number) => `Stage ${n} of 5`,
    eta: (s: number) => `About ${s}s left`,
    etaSoon: 'Almost done…',
    matched: (done: number, total: number) => `${done} of ${total}`,
    stageDone: 'done',
    stageActive: 'in progress',
    stagePending: 'not started',
    cancelled: 'Verification cancelled',
  },

  states: {
    supported: 'Has a reference in an approved source',
    supported_with_note: 'Has a reference, with a note',
    needs_review: 'Needs further verification',
    not_found: 'No reliable source found',
    contradicted: 'Contradicts the source',
  },

  statesShort: {
    supported: 'has a reference',
    supported_with_note: 'has a reference, with a note',
    needs_review: 'needs review',
    not_found: 'no reference found',
    contradicted: 'differs from the source',
  },

  stateWords: {
    supported: 'Has a reference',
    supported_with_note: 'Has a reference, with a note',
    needs_review: 'Needs review',
    not_found: 'No reference found',
    contradicted: 'Differs from the source',
  },

  legend: {
    link: 'What do these states mean?',
    title: 'What do these states mean?',
    description: 'A state says what was found about the source of a text. It is not a ruling on acting on it.',
    states: {
      supported:
        'The text was found in an approved source, word for word, and the grading shown is copied from that source. It is not a ruling by Tabayyun that acting on it is correct.',
      supported_with_note:
        'The text was found in an approved source, and the wording in circulation differs slightly from it or is only part of it. It does not endorse the circulating wording: quote the source’s.',
      needs_review:
        'The sources neither confirm it nor rule it out: the wording is far from the source, the source grades the narration as weak or gives no grading, or the matter is disputed or personal. It does not mean it is wrong; refer it to scholars.',
      not_found:
        'The text was not found in the approved sources Tabayyun searches. It does not mean it is fabricated; it may be in another source, so do not pass it on until its source is known.',
      contradicted:
        'The text departs from the source: a verse with altered wording, a saying attributed to someone else, or a narration the source grades as not attributable to the Prophet ﷺ. The grading is the source’s; it is not a judgment by Tabayyun on whoever passed it on.',
    },
    notDone:
      'Tabayyun issues no fatwa, prefers no opinion among scholars and rules on no personal case; it shows what the sources say as it is.',
  },

  alternatives: {
    title: 'Reliably reported on the same subject',
    hint: 'Accepted narrations retrieved from HadeethEnc; not a corrected version of the text',
  },

  feedback: {
    action: 'Report an error',
    missedAction: 'Did Tabayyun miss a citation? Report an error',
    title: 'Report an error in this verdict',
    titleMissed: 'Report a citation Tabayyun missed',
    privacy: 'Nothing is sent to Tabayyun’s server: you send this message yourself, by the means you choose.',
    report: 'The report',
    what: 'What is wrong?',
    whatPlaceholder: 'Say what you think is wrong, and what is right if you know it',
    mail: 'Send by email',
    whatsapp: 'Send by WhatsApp',
    copy: 'Copy the report',
    copied: 'Report copied ✓',
    share: 'Share',
    subject: 'Error report on a verdict — Tabayyun',
    subjectMissed: 'Report of a missed citation — Tabayyun',
    lineQuoted: 'Text',
    lineState: 'State',
    lineRule: 'Rule',
    lineReference: 'Reference',
    lineChecked: 'What was checked',
    lineData: 'Data version',
    lineAddress: 'Address',
    lineWhat: 'Error',
  },

  actions: {
    adopt: 'Cite it with its reference',
    correct_wording: 'Correct the wording',
    refer_to_scholars: 'Refer to scholars',
    remove_or_request_source: 'Remove or request a source',
    remove_and_warn: 'Remove and warn',
  },

  actionSentences: {
    adopt: 'Suggested action: cite it with its reference.',
    correct_wording: 'Suggested action: correct the wording to match the source.',
    refer_to_scholars: 'Suggested action: refer the matter to scholars.',
    remove_or_request_source: 'Suggested action: remove it, or ask for its source.',
    remove_and_warn: 'Suggested action: remove it and warn that it contradicts the source.',
  },

  claimTypes: {
    ayah: 'Verse',
    hadith: 'Hadith',
    ruling: 'Ruling',
    attributed_quote: 'Attributed saying',
    fact: 'Fact',
    request: 'Evidence request',
  },

  levels: {
    A: 'Stable, foundational',
    B: 'Explanation and argumentation',
    C: 'Disputed or highly sensitive',
    D: 'Fatwa or personal case',
  },

  certainty: {
    definitive: 'Definitive',
    ijtihadi: 'Ijtihadi (interpretive)',
    not_applicable: 'Not applicable',
  },

  matchKinds: {
    exact: 'Exact match',
    near: 'Near match',
    partial: 'Partial quote',
    paraphrase: 'Paraphrase',
    topic: 'Topic match',
    referenced: 'Evidence referred to',
    none: 'No match',
  },

  report: {
    title: 'Verification report',
    citations: (n: number) => (n === 0 ? 'No citations' : enCount(n, 'citation', 'citations')),
    summaryLabel: 'Report summary',
    summary: {
      total: (n: number) =>
        n === 0 ? 'No citations' : `${capital(enWord(n))} ${n === 1 ? 'citation' : 'citations'}`,
      clause: (state: EvidenceState, n: number) =>
        `${enWord(n)} ${n === 1 ? EN_STATE_FORMS[state].one : EN_STATE_FORMS[state].many}`,
      uniform: (state: EvidenceState, n: number) =>
        n === 1
          ? `: ${EN_STATE_FORMS[state].one}`
          : `: ${n === 2 ? 'both' : 'all'} ${EN_STATE_FORMS[state].many}`,
      colon: ': ',
      comma: ', ',
      and: 'and ',
      showAll: 'Show all notes',
      filterHint: (clause: string) => `Show notes: ${clause}`,
    },
    sortLabel: 'Note order',
    sortByState: 'Most important first',
    sortByOrder: 'In text order',
    pendingCount: (n: number) => `${n} in progress`,
    lexicalTitle: 'Reduced coverage',
    lexicalBody:
      'The language model is unavailable, so only verbatim verses and hadith were checked. Rulings and paraphrased narrations may be missed.',
    dorarUnavailable: 'Scholars’ gradings from Dorar.net are unavailable right now.',
    backupModelBody:
      'The main language model is unavailable right now, so a backup model handled this request. It may miss some citations; the verdicts themselves still come from the rules and the sources.',
    noClaimsTitle: 'We found no religious citation to verify in this content',
    noClaimsHint: 'Try a text that contains a verse, a hadith or an attributed saying.',
    finishTitle: 'Verification complete',
    finishBody: (seconds: string) => `Took ${seconds}s`,
    finished: (seconds: string | null) =>
      seconds ? `Verification complete in ${seconds}s.` : 'Verification complete.',
    sources: 'Sources used',
    another: 'Verify another text',
    restored: 'Report saved in this browser.',
    shareSummary: 'Summary card',
  },

  notes: {
    title: 'Notes',
    open: 'Open the note',
    pendingWord: 'In progress',
    noneForFilter: 'No notes in this state.',
    sourceWords: 'The source’s words',
    quotedWords: 'As quoted',
    without: 'A citation with no place in the text',
    quote: (text: string) => `“${text}”`,
    jump: (n: number) => `Notes (${n})`,
  },

  card: {
    quoted: 'As quoted',
    inText: 'In the text',
    inSource: 'In the source',
    referencedSource: 'The evidence referred to, in the sources',
    referencedShort: 'Evidence referred to',
    gradedAs: (wordings: string[]) => `graded in the sources: ${wordings.map((w) => `«${w}»`).join(', ')}`,
    referencedCaveat: 'Showing this text is neither a preference nor a ruling by Tabayyun.',
    reference: 'Reference',
    grade: 'Grading',
    grades: 'Hadith grading',
    gradeUnavailable: 'Grading not available from the source',
    gradesCount: (n: number) => (n === 1 ? '1 grading in the source' : `${n} gradings in the sources`),
    gradesMany: 'Several gradings exist. All are shown as they appear in their sources, with no preference.',
    gradeVerbatim: 'Copied verbatim from the source',
    scholar: 'Scholar',
    book: 'Book',
    narrator: 'Narrator',
    gradeSource: 'Grading source',
    attribution: 'Attribution (takhrij)',
    sourceText: 'Source text',
    source: 'Source',
    openSource: 'Open source',
    level: 'Level',
    certainty: 'Certainty',
    action: 'Suggested action',
    occurredAt: (time: string) => `Mentioned at ${time}`,
    minute: (time: string) => `At ${time}`,
    openVideoAt: (time: string) => `Open the video at ${time} in a new tab`,
    position: 'Position',
    attributedTo: 'Attributed in the content to',
    note: 'Verification note',
    explanation: 'Publisher’s commentary',
    explanationHint: 'Copied from the source as is, not written by Tabayyun',
    aiExplanation: 'AI-written explanation',
    aiExplanationHint: 'Not a source or a ruling. It may be wrong.',
    otherSources: (n: number) => `Other sources (${n})`,
    technical: 'Technical details',
    rule: 'Rule applied',
    similarity: 'Similarity',
    matchKind: 'Match type',
    translation: 'Translation',
    warnings: 'Warnings',
    details: 'Details',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    locate: 'Show in text',
    showMore: 'Show full text',
    showLess: 'Show less',
    pending: 'Checking this citation…',
    abstention: 'We issue no verdict without a source, and generate no substitute.',
    referral: 'Refer to scholars',
    personalCase: 'This is a personal case that requires a fatwa from a qualified body',
    disagreement: 'A disputed matter: Tabayyun shows what the sources say as is, with no preference.',
    claimN: (n: number) => `Citation ${n}`,
    levelSentence: (level: string, name: string, certainty: string) =>
      `Level ${level}, ${name.charAt(0).toLowerCase()}${name.slice(1)}. Certainty: ${certainty.charAt(0).toLowerCase()}${certainty.slice(1)}.`,
    attributedSentence: (who: string) => `Attributed in the content to: ${who}.`,
    gradeBy: (parts: string[]) => parts.join(', '),
  },

  copy: {
    ayah: 'Copy the verse',
    hadith: 'Copy the hadith text',
    source: 'Copy source text',
    hint: 'Copies the source wording with its reference, not the text as quoted',
    done: 'Copied ✓',
    failed: 'Could not copy. Select the text and copy it manually.',
    report: 'Copy report as text',
    reportHint: 'Markdown, ready to paste into a message or a document',
    reportDone: 'Report copied as text ✓',
  },

  share: {
    button: 'Share verification card',
    short: 'Share card',
    description: 'An image or a text that sums up the verdict and its source, with no date and nothing about you.',
    shareAs: 'Share as',
    asImage: 'Image',
    asText: 'Text',
    textPreview: 'The text that will be sent',
    copyText: 'Copy text',
    textCopied: 'Text copied ✓',
    size: 'Size',
    portrait: 'Portrait',
    square: 'Square',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    preview: 'Card preview',
    send: 'Share',
    download: 'Save image',
    copyImage: 'Copy image',
    preparing: 'Preparing the image…',
    shared: 'Shared ✓',
    downloaded: 'Image saved ✓',
    copied: 'Image copied ✓',
    copyFailed: 'This browser cannot copy images. Save the image instead.',
    targets: 'Share to an app',
    apps: { whatsapp: 'WhatsApp', x: 'X', telegram: 'Telegram', instagram: 'Instagram' },
    hintImageSheet: 'The app buttons open the share sheet with the image; choose the app there.',
    hintImageSave: 'This browser cannot hand the image to an app, so it is saved for you to attach there.',
    hintText: 'WhatsApp, X and Telegram open with this text; for Instagram it is copied for you to paste.',
    attachIn: (app: string) => `Image saved. Attach it in ${app}.`,
    pasteIn: (app: string) => `Text copied. Paste it in ${app}.`,
    moreCitations: (n: number) => `and ${enWord(n)} more ${n === 1 ? 'citation' : 'citations'}`,
    failed: 'The card could not be prepared. Try again.',
    cardLabel: 'Verification card',
    summaryLabel: 'Verification summary',
    circulating: 'The text in circulation',
    referral: 'Tabayyun issues no fatwa and prefers no opinion; this matter is for qualified scholars.',
    verseInMushaf: 'The verse is longer than this card can hold; it is read in full in its place in the Mushaf.',
    footer: 'Check it yourself on Tabayyun',
    alt: (state: string) => `Verification card: ${state}`,
    altSummary: 'Verification summary card',
  },

  explain: {
    title: 'Why this verdict?',
    rule: 'Rule applied',
    ruleId: 'Rule id',
    similarity: 'Similarity',
    threshold: 'Threshold',
    meets: 'meets the threshold',
    below: 'below the threshold',
    similarityOf: (value: string) => `Similarity ${value}`,
    thresholdOf: (value: string) => `threshold ${value}`,
    noSimilarity: 'No wording similarity was computed for this citation.',
    candidates: 'Candidates retrieved from the sources',
    noCandidates: 'No candidate was retrieved from the sources.',
    rank: 'Rank',
    source: 'Source',
    reference: 'Reference',
    grade: 'Grading',
    chosen: 'Used',
    chosenHint: 'The candidate the card is built on',
    notChosen: 'not used',
    byTopic: 'by topic',
    noGrade: 'none in source',
    open: 'Open',
    level: 'Content level',
    levelByRule: 'Set by a rule',
    levelByModel: 'The classifier’s reason, not a religious ruling',
    timing: 'Timing',
    matchMs: (duration: string) => `Matching this citation: ${duration}`,
    seconds: (value: string) => `${value}s`,
    millis: (value: string) => `${value} ms`,
    total: 'Total',
    dataVersion: 'Data version',
    limits: 'Limits of this verdict',
  },

  diff: {
    title: 'Word comparison',
    exact: 'The wording matches the source',
    legend: 'Legend',
    changed: 'different wording',
    extra: 'not in the source',
    missing: 'in the source, not quoted',
    partial: 'The coloured words are the ones the text quoted.',
  },

  referral: {
    title: 'Refer to scholars',
    description: 'Tabayyun issues no fatwa and prefers no opinion. You can consult these bodies:',
    empty: 'The referral links could not be loaded right now.',
    searchNote:
      'Search links on the approved scholars’ sites; Tabayyun fetches nothing from them and prefers none; the results are those sites’ own.',
    searchFor: (words: string, site: string) => `Search ${site} for “${words}”`,
  },

  question: {
    word: 'A question',
    referred: 'referred to the scholars',
    clause: (n: number) => `${enWord(n)} ${n === 1 ? 'question' : 'questions'} referred to the scholars`,
    only: (n: number) =>
      `${capital(enWord(n))} ${n === 1 ? 'question' : 'questions'}: Tabayyun verifies what is quoted; it does not answer what is asked.`,
    legend:
      'A question put to Tabayyun. Tabayyun verifies what is quoted and does not answer what is asked: it sends you, by search links, to the approved scholars’ sites, and fetches no answer from them. It is not a ruling on the matter.',
  },

  transcript: {
    titleMedia: 'Transcript',
    titleText: 'Original text',
    show: 'Show original text',
    duration: 'Duration',
    origin: {
      captions: 'From the video’s captions',
      'cloud-stt': 'Cloud speech-to-text',
      'local-stt': 'Local speech-to-text',
    },
    jumpToCard: (n: number, state: string) => `Citation ${n}: ${state}. Go to its card`,
    passage: (text: string, state: string) => `${text} — ${state}. Open the note`,
    pendingState: 'in progress',
    openSource: 'Open the original source',
    empty: 'No text to show.',
    durationOf: (clock: string) => `Duration ${clock}`,
  },

  exportMenu: {
    json: 'JSON file',
    jsonHint: 'The whole report as data',
    html: 'Printable page or PDF',
    htmlHint: 'A readable report with full attribution',
    doneJson: 'JSON file downloaded',
    doneHtml: 'Printable page opened in a new tab',
    downloadedHtml: 'Report page downloaded',
    fallback: 'The server could not be reached, so the page was built in the browser.',
    print: 'Print',
    generatedAt: 'Report date',
    inputSource: 'Content checked',
  },

  history: {
    title: 'What you verified recently',
    empty: 'No history yet.',
    localOnly: 'Kept in this browser only. Nothing is sent to a server.',
    clear: 'Clear history',
    cleared: 'History cleared',
    open: 'Open report',
    untitled: 'Untitled verification',
  },

  errors: {
    retry: 'Try again',
    uploadInstead: 'Upload the file',
    pasteInstead: 'Paste the transcript',
    pasteText: 'Paste the article text',
    dismiss: 'Dismiss message',
    empty: { message: 'There is nothing to verify', hint: 'Paste a text or a link, or attach a file, then press “Verify”.' },
    invalidUrl: { message: 'This does not look like a valid link', hint: 'A link starts with https:// — copy it in full from the address bar.' },
    tooLong: (max: number) => ({
      message: `The text is longer than the limit (${max.toLocaleString('en-US')} characters)`,
      hint: 'Split the text and verify each part separately.',
    }),
    imageTooLarge: (mb: number) => ({
      message: `The picture is larger than ${mb} MB`,
      hint: 'Crop it to the part that has the text, or make it smaller, then attach it again.',
    }),
    fileTooLarge: (mb: number) => ({
      message: `The file is larger than ${mb} MB`,
      hint: 'Trim the clip to the part you need, or paste its transcript as text.',
    }),
    unsupportedFile: {
      message: 'This file type is not supported',
      hint: 'Upload an audio or video file such as mp3, m4a, wav, mp4 or webm.',
    },
    network: { message: 'Could not reach the server', hint: 'Check your connection, then try again.' },
    interrupted: {
      message: 'The connection dropped before the report was complete',
      hint: 'Try again. The notes that arrived are shown below.',
    },
    internal: { message: 'Something unexpected went wrong', hint: 'Try again in a moment.' },
  },
}
