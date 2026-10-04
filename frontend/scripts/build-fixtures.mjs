#!/usr/bin/env node
/**
 * Builds `src/mocks/fixtures.json`, the data behind mock mode (`?mock=1` or `VITE_MOCK=1`).
 *
 * Project rule: no Quran verse, hadith or scholar's quote is ever typed by hand. Every religious
 * text in the fixtures is therefore read from the repository's source data and selected by
 * number or id only:
 *
 *   data/quran.json                      Tanzil Uthmani + simple-clean text
 *   data/hadeethenc.json                 HadeethEnc.com records, all fields verbatim
 *   data/raw/open-hadith-data/…          hadith books without gradings (optional, git-ignored)
 *
 * "As quoted" variants are derived mechanically from those records (diacritics stripped, a slice
 * of words, or two words swapped to simulate a speaker's slip), and the word-level diff is
 * computed here with the same shape the backend sends. Claims that are not religious texts (a
 * personal question, a request to fabricate) are plain strings; the two claims that would need an
 * invented saying use a bracketed description instead, exactly like the pitch deck does.
 *
 * Run: `npm run fixtures` (from frontend/).
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = path.resolve(import.meta.dirname, '../src/mocks/fixtures.json')

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

// ── Source data ───────────────────────────────────────────────────────────────────────────────
const quran = readJson('data/quran.json')
const hadeethenc = fs.existsSync(path.join(ROOT, 'data/hadeethenc.json'))
  ? readJson('data/hadeethenc.json')
  : null
if (!hadeethenc) {
  console.error('data/hadeethenc.json is missing: hadith cards cannot be built. Aborting.')
  process.exit(1)
}
const hadithById = new Map(hadeethenc.hadeeths.map((h) => [String(h.id), h]))

const TIRMIDHI_CSV = path.join(
  ROOT,
  'data/raw/open-hadith-data/Sunan_Al-Tirmidhi/sunan_al-tirmidhi_ahadith.utf8.csv',
)

// ── Selection, by number or id only ───────────────────────────────────────────────────────────
const PICK = {
  ayahExact: [2, 153],
  ayahForRuling: [2, 183],
  abstention: [16, 43],
  motto: [49, 6],
  hadithPartial: '4541', // HadeethEnc id
  hadithTwoGrades: ['4197', '6399'], // the same hadith carried twice by HadeethEnc with two gradings
  hadithMisattributed: '2752',
  bookHadith: 427, // Jami` al-Tirmidhi number in Open-Hadith-Data (no grading in that dataset)
}

// ── Text helpers ──────────────────────────────────────────────────────────────────────────────
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g
const stripTashkeel = (s) => s.replace(TASHKEEL, '')
const normalise = (s) =>
  stripTashkeel(s)
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي]/g, '')
const words = (s) => s.trim().split(/\s+/).filter(Boolean)
const trimPunct = (s) => s.replace(/^[\s«»"'“”،,.:؛!?؟()[\]﴿﴾-]+|[\s«»"'“”،,.:؛!?؟()[\]﴿﴾-]+$/g, '')

/** Word-level diff (LCS on normalised tokens) in the backend's DiffOp shape. */
function wordDiff(quotedText, sourceText) {
  const q = words(quotedText)
  const s = words(sourceText)
  const qn = q.map(normalise)
  const sn = s.map(normalise)
  const lcs = Array.from({ length: q.length + 1 }, () => new Array(s.length + 1).fill(0))
  for (let i = q.length - 1; i >= 0; i--) {
    for (let j = s.length - 1; j >= 0; j--) {
      lcs[i][j] = qn[i] && qn[i] === sn[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const raw = []
  let i = 0
  let j = 0
  while (i < q.length && j < s.length) {
    if (qn[i] && qn[i] === sn[j]) raw.push({ op: 'equal', quoted: q[i++], source: s[j++] })
    // A substitution that costs nothing in matched words reads better than a delete + insert pair.
    else if (lcs[i + 1][j + 1] === lcs[i][j]) raw.push({ op: 'replace', quoted: q[i++], source: s[j++] })
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) raw.push({ op: 'delete', quoted: q[i++], source: '' })
    else raw.push({ op: 'insert', quoted: '', source: s[j++] })
  }
  while (i < q.length) raw.push({ op: 'delete', quoted: q[i++], source: '' })
  while (j < s.length) raw.push({ op: 'insert', quoted: '', source: s[j++] })

  // Merge runs; a delete run touching an insert run is one replacement.
  const merged = []
  for (const step of raw) {
    const last = merged[merged.length - 1]
    const join = (a, b) => [a, b].filter(Boolean).join(' ')
    if (last && last.op === step.op) {
      last.quoted = join(last.quoted, step.quoted)
      last.source = join(last.source, step.source)
    } else if (last && ((last.op === 'delete' && step.op === 'insert') || (last.op === 'insert' && step.op === 'delete') || (last.op === 'replace' && step.op !== 'equal'))) {
      last.op = 'replace'
      last.quoted = join(last.quoted, step.quoted)
      last.source = join(last.source, step.source)
    } else {
      merged.push({ ...step })
    }
  }
  const matched = raw.filter((r) => r.op === 'equal').length
  return { ops: merged, similarity: Number((matched / Math.max(q.length, 1)).toFixed(2)) }
}

// ── Quran ─────────────────────────────────────────────────────────────────────────────────────
function ayah(surah, number) {
  const row = quran.ayahs.find((r) => r[0] === surah && r[1] === number)
  if (!row) throw new Error(`ayah ${surah}:${number} not found in data/quran.json`)
  const info = quran.surahs[surah - 1]
  return { surah, number, uthmani: row[2], simple: row[3], name_ar: info.name_ar, name_en: info.name_en }
}

const quranUrl = (a, lang) =>
  lang === 'ar'
    ? `https://quranenc.com/ar/browse/arabic_moyassar/${a.surah}/${a.number}`
    : `https://quranenc.com/en/browse/english_saheeh/${a.surah}/${a.number}`

function quranSource(a, lang) {
  return {
    kind: 'quran',
    source_name:
      lang === 'ar'
        ? 'المصحف الشريف — نص مصحف المدينة النبوية (Tanzil)'
        : 'The Mushaf — Madinah Mushaf text (Tanzil)',
    text: a.uthmani,
    ref: lang === 'ar' ? `سورة ${a.name_ar}، الآية ${a.number}` : `Surah ${a.name_en} ${a.surah}:${a.number}`,
    url: quranUrl(a, lang),
    attribution: null,
    explanation: null,
    // data/quran.json carries no translation, and one is never typed by hand.
    translation: null,
    // Short reference for copy_text; stripped before the fixture is written.
    quranRef: { ar: `${a.name_ar}: ${a.number}`, en: `${a.name_en} ${a.surah}:${a.number}` },
  }
}

// ── Hadith ────────────────────────────────────────────────────────────────────────────────────
function hadith(id) {
  const h = hadithById.get(String(id))
  if (!h) throw new Error(`hadith ${id} not found in data/hadeethenc.json`)
  return h
}

/** The Prophet's words as HadeethEnc marks them: the text between the first « and ». */
function matnOf(h) {
  const m = h.hadeeth.match(/«([^»]+)»/)
  if (!m) throw new Error(`hadith ${h.id} has no «…» span`)
  return m[1].trim()
}

const HADEETHENC_NAME = {
  ar: 'موسوعة الأحاديث النبوية (HadeethEnc.com)',
  en: 'Encyclopedia of Translated Prophetic Hadiths (HadeethEnc.com)',
}

function hadithSource(h, lang) {
  return {
    kind: 'hadith',
    source_name: HADEETHENC_NAME.ar,
    text: h.hadeeth,
    ref: h.attribution,
    url: h.url,
    attribution: h.attribution,
    explanation: h.explanation || null,
    translation:
      lang === 'en' && h.en?.hadeeth
        ? { lang: 'en', text: h.en.hadeeth, source_name: HADEETHENC_NAME.en, source_url: h.en.url }
        : null,
  }
}

/** F2 «الثابت في الباب»: an accepted narration offered beside a hadith with no reference. */
const alternativeOf = (h) => ({
  text: h.hadeeth,
  ref: h.attribution,
  source_name: HADEETHENC_NAME.ar,
  source_url: h.url,
  grade_text: h.grade,
  grade_source_name: HADEETHENC_NAME.ar,
  grade_source_url: h.url,
})

const hadithGrade = (h) => ({
  text: h.grade,
  scholar: null,
  book: null,
  source_name: HADEETHENC_NAME.ar,
  source_url: h.url,
})

function bookHadith(number) {
  if (!fs.existsSync(TIRMIDHI_CSV)) return null
  for (const line of fs.readFileSync(TIRMIDHI_CSV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^"?(\d+)"?\s*,\s*"?([\s\S]*?)"?\s*$/)
    if (m && Number(m[1]) === number) return { number, text: m[2].trim() }
  }
  return null
}

// ── Retrieval for the explainability panel (F5) ───────────────────────────────────────────────
// The candidates shown under "لماذا هذا الحكم؟" are really retrieved here, from the same data
// files, and really scored: a local alignment of the quoted words against each text (a match
// scores +1, a mismatch or a gap −1), divided by the number of quoted words. No candidate, score
// or grading is typed.
const tokensOf = (s) => words(s).map(normalise).filter(Boolean)

function alignmentScore(q, t) {
  let best = 0
  let prev = new Array(t.length + 1).fill(0)
  for (let i = 1; i <= q.length; i++) {
    const row = new Array(t.length + 1).fill(0)
    for (let j = 1; j <= t.length; j++) {
      const v = Math.max(0, prev[j - 1] + (q[i - 1] === t[j - 1] ? 1 : -1), prev[j] - 1, row[j - 1] - 1)
      row[j] = v
      if (v > best) best = v
    }
    prev = row
  }
  return q.length ? Number((best / q.length).toFixed(2)) : 0
}

const excerptOf = (text) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 160 ? `${clean.slice(0, 160).trimEnd()}…` : clean
}

const quranIndex = quran.ayahs.map((row) => ({ surah: row[0], number: row[1], tokens: tokensOf(row[3]) }))
const hadithIndex = hadeethenc.hadeeths.map((h) => ({ h, tokens: tokensOf(h.hadeeth) }))
const retrievalCache = new Map()

function retrieve(kind, quoted, limit) {
  const key = `${kind}|${limit}|${quoted}`
  if (!retrievalCache.has(key)) {
    const q = tokensOf(quoted)
    const index = kind === 'quran' ? quranIndex : hadithIndex
    retrievalCache.set(
      key,
      index
        .map((entry) => ({ entry, similarity: alignmentScore(q, entry.tokens) }))
        .sort((a, b) => b.similarity - a.similarity || a.entry.tokens.length - b.entry.tokens.length)
        .slice(0, limit),
    )
  }
  return retrievalCache.get(key)
}

const quranCandidate = (a, lang, similarity, chosen) => {
  const src = quranSource(a, lang)
  return { source_name: src.source_name, ref: src.ref, url: src.url, similarity, chosen, grade_text: null, excerpt: excerptOf(a.uthmani) }
}
const hadithCandidate = (h, similarity, chosen) => ({
  source_name: HADEETHENC_NAME.ar,
  ref: h.attribution,
  url: h.url,
  similarity,
  chosen,
  grade_text: h.grade || null,
  excerpt: excerptOf(h.hadeeth),
})
// Best first; on a tie the candidate the card was built from leads.
const ranked = (list) =>
  [...list]
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0) || Number(b.chosen) - Number(a.chosen))
    .slice(0, 5)
    .map((candidate, i) => ({ rank: i + 1, ...candidate }))

const quranCandidates = (quoted, lang, chosen, limit = 5) =>
  retrieve('quran', quoted, limit).map(({ entry, similarity }) =>
    quranCandidate(ayah(entry.surah, entry.number), lang, similarity, !!chosen && entry.surah === chosen.surah && entry.number === chosen.number),
  )
const hadithCandidates = (quoted, chosenId, limit = 5) =>
  retrieve('hadith', quoted, limit).map(({ entry, similarity }) =>
    hadithCandidate(entry.h, similarity, String(entry.h.id) === String(chosenId)),
  )

const DATA_VERSION = fs.existsSync(path.join(ROOT, 'data/VERSION'))
  ? fs.readFileSync(path.join(ROOT, 'data/VERSION'), 'utf8').trim()
  : `fixtures · quran ${quran.ayahs.length} · hadeethenc ${hadeethenc.hadeeths.length}`

// Thresholds used by the mock rules. The real ones live in the backend's evidence_rules.
const ACCEPT = 0.85

/** F4: the source's wording, ready to paste. Never the wording as quoted. */
function copyTextOf(c, lang) {
  const src = c.source
  if (!src) return null
  if (src.kind === 'quran') return `﴿${src.text}﴾ [${src.quranRef[lang]}]`
  const grade = c.grades[0]
  const gradeLine = grade ? ` — ${grade.text} (${grade.source_name})` : ''
  return `${src.text}\n${src.ref}${gradeLine}\n${src.url}`
}

// ── Card factory ──────────────────────────────────────────────────────────────────────────────
const ACTION = {
  supported: 'adopt',
  supported_with_note: 'correct_wording',
  needs_review: 'refer_to_scholars',
  not_found: 'remove_or_request_source',
  contradicted: 'remove_and_warn',
}

function card(partial) {
  return {
    certainty: 'not_applicable',
    attributed_to: null,
    explicit_attribution: false,
    action: ACTION[partial.state],
    similarity: null,
    match_kind: 'none',
    is_question: false,
    referral_query: null,
    alternatives: [],
    source: null,
    other_sources: [],
    grades: [],
    grade_unavailable: false,
    diff: null,
    note_ar: '',
    note_en: '',
    ai_explanation: null,
    referral: false,
    personal_case: false,
    disagreement_noted: false,
    timestamp: null,
    span: null,
    warnings: [],
    copy_text: null,
    explain: null,
    ...partial,
  }
}

// Claims that stand in for content the fixtures must not invent (same device as the pitch deck).
const STAND_IN = {
  attributed: '[قول منسوب إلى أحد العلماء كما ورد في المقطع]',
  disputed: '[حكم في مسألة خلافية كما ورد في المقطع]',
  referenced: '[حكم في مسألة خلافية استُدلّ له بحديث كما ورد في المقطع]',
  hadithNotFound: '[حديث متداول في فضل الصيام لا أصل له في المصادر كما ورد في المقطع]',
}
// Not religious texts: a pillar named in the pitch deck's own mock, a personal question, a request.
const PLAIN = {
  // A question put to the tool: not a religious text. It is referred, never answered.
  question: 'ما حكم الزكاة؟',
  ruling: 'صيام رمضان واجب على كل مسلم',
  personal: 'طلّقت زوجتي وأنا غاضب، فهل يقع الطلاق؟',
  request: 'أعطني حديثاً يثبت أن من أكل التفاح على الريق دخل الجنة',
}

// The backend's sentence for a disputed matter, word for word (evidence_rules/rules.py).
const DISPUTED_NOTE = {
  ar: 'مسألة خلافية أو عالية الحساسية: يُعرض ما في المصادر دون ترجيح، ويُحال فيها إلى أهل العلم.',
  en: 'A disputed or highly sensitive matter: what the sources say is shown without preference, and it is referred to scholars.',
}

function buildCards(lang) {
  const a1 = ayah(...PICK.ayahExact)
  const a2 = ayah(...PICK.ayahForRuling)
  const hPartial = hadith(PICK.hadithPartial)
  const [hA, hB] = PICK.hadithTwoGrades.map(hadith)
  const hMis = hadith(PICK.hadithMisattributed)
  const book = bookHadith(PICK.bookHadith)

  // c2: the speaker quotes only the opening words of the hadith.
  const partialQuoted = trimPunct(stripTashkeel(words(matnOf(hPartial)).slice(0, 7).join(' ')))
  const partialDiff = wordDiff(partialQuoted, hPartial.hadeeth)

  // c4: quoted in full, without diacritics.
  const twoQuoted = trimPunct(stripTashkeel(matnOf(hB)))

  // c8: opening clause of a hadith that the speaker introduces as a verse.
  const misQuoted = trimPunct(stripTashkeel(words(matnOf(hMis)).slice(0, 8).join(' ')))

  const cards = {
    ayah: card({
      claim_type: 'ayah',
      content_level: 'A',
      certainty: 'definitive',
      text_as_quoted: a1.simple,
      attributed_to: lang === 'ar' ? 'القرآن الكريم' : 'The Quran',
      explicit_attribution: true,
      state: 'supported',
      rule_id: 'ayah.exact',
      similarity: 1,
      match_kind: 'exact',
      source: quranSource(a1, lang),
      note_ar: 'النص مطابق لنص المصحف الشريف.',
      note_en: 'The text matches the Mushaf verbatim.',
    }),
    hadithPartial: card({
      claim_type: 'hadith',
      content_level: 'A',
      text_as_quoted: partialQuoted,
      explicit_attribution: true,
      state: 'supported_with_note',
      rule_id: 'hadith.accepted_near',
      similarity: partialDiff.similarity,
      match_kind: 'partial',
      source: hadithSource(hPartial, lang),
      grades: [hadithGrade(hPartial)],
      diff: partialDiff.ops,
      // The backend's own sentence for this rule (evidence_rules/rules.py, `hadith.accepted_near`).
      note_ar: 'الحديث ثابت في المصدر مع اختلاف يسير في اللفظ أو اقتباس مجتزأ.',
      note_en:
        'The narration is established in the source with a slight difference in wording or a partial quotation.',
      ai_explanation:
        lang === 'ar'
          ? 'ذكر المتحدث مطلع الحديث فقط، والنص في المصدر أطول منه.'
          : 'The speaker quoted only the opening of the hadith; the text in the source is longer.',
    }),
    ruling: card({
      claim_type: 'ruling',
      content_level: 'A',
      certainty: 'definitive',
      text_as_quoted: PLAIN.ruling,
      state: 'supported',
      rule_id: 'ruling.foundational_with_source',
      match_kind: 'topic',
      source: quranSource(a2, lang),
      note_ar: 'حكم من الأصول المستقرة، والدليل المعروض آية مسترجَعة من المصحف.',
      note_en: 'A stable foundational ruling. The evidence shown is a verse retrieved from the Mushaf.',
    }),
    hadithTwoGrades: card({
      claim_type: 'hadith',
      content_level: 'A',
      text_as_quoted: twoQuoted,
      explicit_attribution: true,
      state: 'supported',
      rule_id: 'hadith.accepted_exact',
      similarity: 1,
      match_kind: 'exact',
      source: hadithSource(hB, lang),
      other_sources: [hadithSource(hA, lang)],
      grades: [hadithGrade(hA), hadithGrade(hB)],
      note_ar: 'النص مطابق لحديث في مصدر معتمد. ورد له في المصدر حكمان، ويُعرضان كما هما دون ترجيح.',
      note_en:
        'The text matches a narration in an approved source. The source carries two gradings for it; both are shown as they are, with no preference.',
    }),
    attributed: card({
      claim_type: 'attributed_quote',
      content_level: 'B',
      text_as_quoted: STAND_IN.attributed,
      explicit_attribution: true,
      state: 'not_found',
      rule_id: 'quote.no_source',
      referral: true,
      note_ar: 'لم يُعثر على هذا القول في المصادر المعتمدة، ولا يولّد تبيّن بديلاً عنه.',
      note_en: 'This saying was not found in the approved sources, and Tabayyun generates no substitute for it.',
    }),
    disputed: card({
      claim_type: 'ruling',
      content_level: 'C',
      certainty: 'ijtihadi',
      text_as_quoted: STAND_IN.disputed,
      state: 'needs_review',
      rule_id: 'level_c.cap_needs_review',
      referral: true,
      // Topic words for the referral links' search (the clip is about fasting): not a religious text.
      referral_query: 'أحكام الصيام',
      disagreement_noted: true,
      // The backend's own sentence for a disputed matter (evidence_rules/rules.py, `ruling.disputed`).
      note_ar: DISPUTED_NOTE.ar,
      note_en: DISPUTED_NOTE.en,
    }),
    // A disputed ruling for which the speaker points at a narration. The backend shows that
    // narration as the evidence referred to, with its grading, and does not raise the state
    // (`match_kind: "referenced"`, backend/tabayyun/verify.py); the last sentence of the note is
    // the backend's own. The narration is one the fixtures already carry (the one c4 quotes).
    referenced: card({
      claim_type: 'ruling',
      content_level: 'C',
      certainty: 'ijtihadi',
      text_as_quoted: STAND_IN.referenced,
      state: 'needs_review',
      rule_id: 'level_c.cap_needs_review',
      match_kind: 'referenced',
      source: hadithSource(hB, lang),
      grades: [hadithGrade(hB)],
      referral: true,
      referral_query: 'أحكام الصيام',
      disagreement_noted: true,
      note_ar: `${DISPUTED_NOTE.ar} أقرب نص في المصادر لما أُشير إليه معروض مع حكمه؛ عرضه لا يعني ترجيحاً ولا حكماً من تبيّن.`,
      note_en: `${DISPUTED_NOTE.en} The closest text in the sources to what is referred to is shown with its grading; showing it is neither a preference nor a ruling by Tabayyun.`,
    }),
    misattributed: card({
      claim_type: 'ayah',
      content_level: 'A',
      certainty: 'definitive',
      text_as_quoted: misQuoted,
      attributed_to: lang === 'ar' ? 'القرآن الكريم' : 'The Quran',
      explicit_attribution: true,
      state: 'contradicted',
      rule_id: 'ayah.not_in_mushaf_found_as_hadith',
      similarity: 1,
      match_kind: 'none',
      source: hadithSource(hMis, lang),
      grades: [hadithGrade(hMis)],
      note_ar: 'نُسب هذا النص في المقطع إلى القرآن الكريم، ولم يُعثر عليه في المصحف. وُجد نصُّه حديثاً في مصدر معتمد.',
      note_en:
        'The clip attributes this text to the Quran, but it is not in the Mushaf. The same wording was found as a hadith in an approved source.',
    }),
    personal: card({
      claim_type: 'ruling',
      content_level: 'D',
      text_as_quoted: PLAIN.personal,
      state: 'needs_review',
      rule_id: 'level_d.personal_case',
      referral: true,
      personal_case: true,
      // The backend's own sentence for a personal case (`PERSONAL_CASE_AR` / `_EN`): it is the note.
      note_ar: 'هذه حالة شخصية تستوجب فتوى من جهة مؤهلة',
      note_en: 'This is a personal case that requires a fatwa from a qualified body.',
    }),
    // A hadith in circulation that the sources do not carry. The backend offers accepted
    // narrations on the same subject beside it (F2, `Card.alternatives`): here, two the fixtures
    // already use. The note is the backend's sentence for `hadith.none`.
    hadithNotFound: card({
      claim_type: 'hadith',
      content_level: 'A',
      text_as_quoted: STAND_IN.hadithNotFound,
      explicit_attribution: true,
      state: 'not_found',
      rule_id: 'hadith.none',
      referral: true,
      alternatives: [alternativeOf(hPartial), alternativeOf(hB)],
      note_ar: 'لم يُعثر على هذا الحديث في المصادر المعتمدة المتاحة.',
      note_en: 'This hadith was not found in the approved sources available.',
    }),
    // «تبيّن يتحقق مما يُنقل، ولا يجيب عما يُسأل»: a question is referred to the approved scholars'
    // sites and never answered. Nothing is retrieved for it. The note is the backend's sentence
    // for `question.referral` (evidence_rules/rules.py), and the query its topic words.
    question: card({
      claim_type: 'ruling',
      content_level: 'B',
      text_as_quoted: PLAIN.question,
      state: 'needs_review',
      rule_id: 'question.referral',
      referral: true,
      is_question: true,
      referral_query: 'حكم الزكاة',
      note_ar: 'هذا سؤال، وتبيّن يتحقق مما يُنقل ولا يجيب عما يُسأل. لا نفتي؛ راجع جواب مسألتك في مواقع أهل العلم المعتمدة.',
      note_en:
        "This is a question. Tabayyun verifies what is quoted; it does not answer what is asked and gives no fatwa. Look the matter up on the approved scholars' sites.",
    }),
    request: card({
      claim_type: 'request',
      content_level: 'B',
      text_as_quoted: PLAIN.request,
      state: 'not_found',
      rule_id: 'request.no_fabrication',
      referral: true,
      note_ar: 'تبيّن لا يؤلّف نصوصاً شرعية ولا ينسبها: لم يُعثر على مصدر موثوق يطابق هذا الطلب.',
      note_en:
        'Tabayyun does not compose or attribute religious texts: no reliable source matching this request was found.',
    }),
  }

  if (book) {
    // c5: the closing words of the narration with two words swapped, as a speaker's slip would do.
    const all = words(book.text)
    const start = all.lastIndexOf('وسلم') + 1
    const matn = all.slice(start)
    const slipped = [...matn]
    const last = slipped.length - 1
    ;[slipped[last - 2], slipped[last]] = [slipped[last], slipped[last - 2]]
    const quoted = slipped.join(' ')
    const diff = wordDiff(quoted, matn.join(' '))
    cards.bookHadith = card({
      claim_type: 'hadith',
      content_level: 'A',
      text_as_quoted: quoted,
      explicit_attribution: true,
      state: 'needs_review',
      rule_id: 'hadith.near_no_grade',
      similarity: diff.similarity,
      match_kind: 'near',
      source: {
        kind: 'hadith',
        source_name: 'كتب السنة — بيانات Open-Hadith-Data',
        text: book.text,
        ref:
          lang === 'ar'
            ? `جامع الترمذي، رقم ${book.number} (ترقيم Open-Hadith-Data)`
            : `Jami\` al-Tirmidhi, no. ${book.number} (Open-Hadith-Data numbering)`,
        url: `https://dorar.net/hadith/search?q=${encodeURIComponent(matn.slice(0, 7).join(' '))}`,
        attribution: null,
        explanation: null,
        translation: null,
      },
      grade_unavailable: true,
      diff: diff.ops,
      referral: true,
      note_ar: 'لفظ قريب من حديث في كتب السنة مع اختلاف في موضعين. لا يتوفر حكم على الحديث من المصدر.',
      note_en:
        'The wording is close to a narration in the hadith collections, with two differences. The source provides no grading for it.',
    })
  } else {
    console.warn('data/raw/open-hadith-data is missing: the grade_unavailable card is left out.')
  }

  // ── F5: why each verdict was reached. Rule sentences are the tool's own words; every candidate
  // comes from the retrieval above. ────────────────────────────────────────────────────────────
  const HADITH_LIMITS = {
    ar: 'لم نبحث خارج المصادر المعتمدة؛ قد يوجد الحديث بلفظ آخر في كتب أخرى.',
    en: 'Nothing outside the approved sources was searched; the hadith may exist with other wording in other books.',
  }
  const explain = (c, e) => ({
    rule_ar: e.rule[0],
    rule_en: e.rule[1],
    limits_ar: e.limits[0],
    limits_en: e.limits[1],
    similarity: c.similarity,
    threshold: e.threshold ?? null,
    candidates: ranked(e.candidates ?? []),
    level_reason_ar: e.level[0],
    level_reason_en: e.level[1],
    level_reason_origin: e.origin ?? 'rule',
    match_ms: e.ms,
    data_version: DATA_VERSION,
  })
  const fmt = (n) => n.toFixed(2)
  const quotedWords = (c) => words(c.text_as_quoted).length

  cards.ayah.explain = explain(cards.ayah, {
    rule: [
      `تطابق لفظي كامل مع نص المصحف: ${quotedWords(cards.ayah)} كلمة متتالية في ${cards.ayah.source.ref}.`,
      `Exact wording match with the Mushaf text: ${quotedWords(cards.ayah)} consecutive words in ${cards.ayah.source.ref}.`,
    ],
    limits: [
      'طابق تبيّن اللفظ مع نص المصحف فقط؛ لا ينظر في صحة الاستدلال بالآية في سياق الكلام.',
      'Tabayyun matched the wording against the Mushaf only; it does not assess whether the verse is used correctly in context.',
    ],
    candidates: quranCandidates(cards.ayah.text_as_quoted, lang, a1),
    level: ['نص قرآني: من الأصول المستقرة.', 'Quranic text: stable, foundational content.'],
    ms: 6,
  })

  cards.hadithPartial.explain = explain(cards.hadithPartial, {
    rule: [
      `أفضل مرشح بتشابه ${fmt(cards.hadithPartial.similarity)} (العتبة ${fmt(ACCEPT)})، والاقتباس ${quotedWords(cards.hadithPartial)} كلمات من نص أطول. حكمه «${hPartial.grade}» منقول من موسوعة الأحاديث النبوية.`,
      `Best candidate at similarity ${fmt(cards.hadithPartial.similarity)} (threshold ${fmt(ACCEPT)}); the quote is ${quotedWords(cards.hadithPartial)} words of a longer text. Its grading “${hPartial.grade}” is copied from HadeethEnc.`,
    ],
    limits: [HADITH_LIMITS.ar, HADITH_LIMITS.en],
    threshold: ACCEPT,
    candidates: hadithCandidates(cards.hadithPartial.text_as_quoted, hPartial.id),
    level: ['حديث منسوب صراحةً إلى النبي ﷺ: من الأصول المستقرة.', 'A hadith explicitly attributed to the Prophet: stable, foundational content.'],
    ms: 212,
  })

  cards.ruling.explain = explain(cards.ruling, {
    rule: [
      'حكم من الأصول المستقرة، واستُرجعت له آية من المصحف بالموضوع لا باللفظ.',
      'A stable foundational ruling; a verse was retrieved for it from the Mushaf by topic, not by wording.',
    ],
    limits: [
      'الآية المعروضة مسترجَعة بالموضوع؛ لا يقرّر تبيّن وجه الدلالة، ولا يغني ذلك عن الرجوع إلى أهل العلم.',
      'The verse shown was retrieved by topic; Tabayyun does not decide how it proves the ruling, and this does not replace consulting scholars.',
    ],
    candidates: [a2, ayah(2, 185), ayah(2, 184)].map((a, i) => quranCandidate(a, lang, null, i === 0)),
    level: ['وجوب صيام رمضان من أركان الإسلام المعلومة.', 'The obligation of fasting Ramadan is one of the well-known pillars of Islam.'],
    origin: 'model',
    ms: 388,
  })

  cards.hadithTwoGrades.explain = explain(cards.hadithTwoGrades, {
    rule: [
      `تطابق لفظي كامل مع حديث في المصدر (تشابه ${fmt(1)}، العتبة ${fmt(ACCEPT)}). ورد له في المصدر حكمان، ويُعرضان معاً.`,
      `Exact wording match with a hadith in the source (similarity ${fmt(1)}, threshold ${fmt(ACCEPT)}). The source carries two gradings for it; both are shown.`,
    ],
    limits: [
      `${HADITH_LIMITS.ar} عند تعدد الأحكام لا يرجّح تبيّن بينها.`,
      `${HADITH_LIMITS.en} When gradings differ, Tabayyun prefers none.`,
    ],
    threshold: ACCEPT,
    candidates: hadithCandidates(cards.hadithTwoGrades.text_as_quoted, hB.id),
    level: ['حديث منسوب صراحةً إلى النبي ﷺ: من الأصول المستقرة.', 'A hadith explicitly attributed to the Prophet: stable, foundational content.'],
    ms: 240,
  })

  cards.attributed.explain = explain(cards.attributed, {
    rule: [
      'لم يُعثر على أي مرشح فوق حد الاسترجاع في المصادر المعتمدة. القاعدة عند غياب المصدر: الامتناع.',
      'No candidate above the retrieval floor was found in the approved sources. The rule when there is no source: abstain.',
    ],
    limits: [
      'البحث محصور في المصادر المعتمدة، وقد يكون القول في كتب لم تُفهرس. عدم العثور ليس حكماً ببطلان القول.',
      'The search is limited to the approved sources; the saying may be in books that are not indexed. Not finding it is not a ruling that it is false.',
    ],
    threshold: ACCEPT,
    level: ['قول منسوب إلى عالم: شرح واستدلال.', 'A saying attributed to a scholar: explanation and argumentation.'],
    origin: 'model',
    ms: 431,
  })

  cards.hadithNotFound.explain = explain(cards.hadithNotFound, {
    rule: [
      'لم يُعثر على أي حديث فوق حد المطابقة في المصادر المعتمدة. القاعدة عند غياب المصدر: الامتناع. الأحاديث المعروضة تحت «الثابت في الباب» مسترجَعة في الموضوع نفسه، وليست هذا النص.',
      'No narration above the match threshold was found in the approved sources. The rule when there is no source: abstain. The narrations under “Reliably reported on the same subject” were retrieved on the same subject; they are not this text.',
    ],
    limits: [HADITH_LIMITS.ar, HADITH_LIMITS.en],
    threshold: ACCEPT,
    level: ['حديث منسوب صراحةً إلى النبي ﷺ: من الأصول المستقرة.', 'A hadith explicitly attributed to the Prophet: stable, foundational content.'],
    ms: 262,
  })

  cards.disputed.explain = explain(cards.disputed, {
    rule: [
      'صُنّفت المسألة خلافية (المستوى C)، وسقف هذا المستوى «يحتاج مزيد تحقق» مهما كانت نتيجة المطابقة.',
      'The matter was classified as disputed (level C); that level is capped at “needs further verification” whatever the match result.',
    ],
    limits: [
      'تبيّن لا يرجّح بين الأقوال في المسائل الخلافية ولا يفتي فيها؛ يُرجع فيها إلى أهل العلم.',
      'Tabayyun prefers no opinion on disputed matters and issues no fatwa; they are referred to scholars.',
    ],
    level: [
      'مسألة فقهية يختلف فيها أهل العلم؛ وعند الشك يُختار المستوى الأشد حساسية.',
      'A fiqh matter on which scholars differ; when in doubt the more sensitive level is chosen.',
    ],
    origin: 'model',
    ms: 9,
  })

  cards.referenced.explain = explain(cards.referenced, {
    rule: [
      'صُنّفت المسألة خلافية (المستوى C)، وسقف هذا المستوى «يحتاج مزيد تحقق». النص المعروض هو ما أُشير إليه في الكلام، وعرضه لا يرفع الحالة.',
      'The matter was classified as disputed (level C); that level is capped at “needs further verification”. The text shown is what the speaker points at; showing it does not raise the state.',
    ],
    limits: [
      'تبيّن لا يرجّح بين الأقوال في المسائل الخلافية ولا يفتي فيها، ولا ينظر في صحة الاستدلال بالنص المشار إليه؛ يُرجع في ذلك إلى أهل العلم.',
      'Tabayyun prefers no opinion on disputed matters and issues no fatwa, and does not assess whether the text referred to supports the ruling; that is for scholars.',
    ],
    candidates: [hadithCandidate(hB, null, false)],
    level: [
      'مسألة فقهية يختلف فيها أهل العلم؛ وعند الشك يُختار المستوى الأشد حساسية.',
      'A fiqh matter on which scholars differ; when in doubt the more sensitive level is chosen.',
    ],
    origin: 'model',
    ms: 412,
  })

  const misQuran = quranCandidates(cards.misattributed.text_as_quoted, lang, null, 2)
  cards.misattributed.explain = explain(cards.misattributed, {
    rule: [
      `النص منسوب صراحةً إلى القرآن ولم يطابق أي آية (أعلى تشابه مع المصحف ${fmt(misQuran[0].similarity)})، ووُجد بتشابه ${fmt(1)} حديثاً في المصدر.`,
      `The text is explicitly attributed to the Quran but matches no verse (highest similarity with the Mushaf ${fmt(misQuran[0].similarity)}); it was found as a hadith in the source at similarity ${fmt(1)}.`,
    ],
    limits: [
      'قورن النص بالمصحف كاملاً وبالمصادر الحديثية المعتمدة. الحكم هنا على النسبة إلى القرآن، لا على صحة الحديث.',
      'The text was compared with the whole Mushaf and the approved hadith sources. The verdict is about the attribution to the Quran, not about the authenticity of the hadith.',
    ],
    threshold: ACCEPT,
    candidates: [...hadithCandidates(cards.misattributed.text_as_quoted, hMis.id, 3), ...misQuran].sort(
      (a, b) => b.similarity - a.similarity,
    ),
    level: ['نص منسوب إلى القرآن: من الأصول المستقرة.', 'A text attributed to the Quran: stable, foundational content.'],
    ms: 263,
  })

  cards.personal.explain = explain(cards.personal, {
    rule: [
      'صُنّف النص حالة شخصية (المستوى D): لا تُجرى مطابقة ولا يصدر حكم، ويُحال صاحبها إلى جهة فتوى مؤهلة.',
      'The text was classified as a personal case (level D): nothing is matched and no verdict is issued; the person is referred to a qualified fatwa body.',
    ],
    limits: [
      'تبيّن لا يتحقق من الحالات الشخصية ولا يفتي فيها.',
      'Tabayyun does not verify personal cases and issues no fatwa on them.',
    ],
    level: [
      'سؤال عن واقعة تخص السائل نفسه، ويترتب عليها حكم في حقه.',
      'A question about the asker’s own situation, with a ruling that would apply to them personally.',
    ],
    origin: 'model',
    ms: 4,
  })

  const requestCandidates = hadithCandidates(cards.request.text_as_quoted, null, 3)
  cards.request.explain = explain(cards.request, {
    rule: [
      `طلب إنشاء دليل: تبيّن لا يولّد نصوصاً. أعلى تشابه بين الطلب ونصوص المصادر ${fmt(requestCandidates[0].similarity)}، وهو دون العتبة ${fmt(ACCEPT)}.`,
      `A request to produce evidence: Tabayyun generates no texts. The highest similarity between the request and the source texts is ${fmt(requestCandidates[0].similarity)}, below the threshold ${fmt(ACCEPT)}.`,
    ],
    limits: [
      'عدم العثور لا يثبت أن المعنى باطل؛ يثبت فقط أن تبيّن لم يجد في المصادر المعتمدة نصاً بهذا اللفظ.',
      'Not finding a source does not prove the meaning false; it only shows that Tabayyun found no text with this wording in the approved sources.',
    ],
    threshold: ACCEPT,
    candidates: requestCandidates,
    level: ['طلب دليل: يُعامل معاملة الاستدلال.', 'An evidence request: treated as argumentation.'],
    ms: 305,
  })
  cards.request.similarity = null

  if (cards.bookHadith) {
    const c = cards.bookHadith
    cards.bookHadith.explain = explain(c, {
      rule: [
        `أفضل مرشح بتشابه ${fmt(c.similarity)}، دون عتبة القبول ${fmt(ACCEPT)}، ولا يحمل مصدره حكماً عليه؛ لذلك «يحتاج مزيد تحقق».`,
        `Best candidate at similarity ${fmt(c.similarity)}, below the acceptance threshold ${fmt(ACCEPT)}, and its source carries no grading; hence “needs further verification”.`,
      ],
      limits: [
        'وُجد النص في كتاب من كتب السنة بلا حكم مرفق. غياب الحكم في هذا المصدر لا يدل على صحة الحديث ولا على ضعفه.',
        'The text was found in a hadith collection with no grading attached. A missing grading in this source says nothing about the hadith being authentic or weak.',
      ],
      threshold: ACCEPT,
      candidates: [
        { source_name: c.source.source_name, ref: c.source.ref, url: c.source.url, similarity: c.similarity, chosen: true, grade_text: null, excerpt: excerptOf(c.source.text) },
        ...hadithCandidates(c.text_as_quoted, null, 4),
      ],
      level: ['حديث منسوب صراحةً إلى النبي ﷺ: من الأصول المستقرة.', 'A hadith explicitly attributed to the Prophet: stable, foundational content.'],
      ms: 344,
    })
  }

  // ── F4: copy_text, then drop the helper field that only the generator needs.
  for (const c of Object.values(cards)) {
    c.copy_text = copyTextOf(c, lang)
    for (const src of [c.source, ...c.other_sources]) if (src) delete src.quranRef
  }
  return cards
}

// ── Scenarios: segments with claim spans located mechanically ─────────────────────────────────
function scenario({ source, parts, llm = true }) {
  const out = {}
  for (const lang of ['ar', 'en']) {
    const lib = buildCards(lang)
    const segments = []
    const cards = []
    let offset = 0
    parts.forEach((part, i) => {
      const claim = part.card ? lib[part.card] : null
      if (part.card && !claim) return
      const text = claim ? `${part.before ?? ''}${claim.text_as_quoted}${part.after ?? ''}` : part.text
      const id = segments.length
      segments.push({
        id,
        text,
        start: part.at ?? null,
        end: part.at != null ? (parts[i + 1]?.at ?? source.duration ?? null) : null,
      })
      if (claim) {
        const start = (part.before ?? '').length
        const index = cards.length + 1
        cards.push({
          id: `c${index}`,
          index,
          ...claim,
          span: { segment_id: id, start, end: start + claim.text_as_quoted.length },
          timestamp: part.at != null ? { start: part.at, end: null } : null,
          position: offset + start,
        })
      }
      offset += text.length + 1
    })
    out[lang] = { cards }
    out.segments = segments
  }
  return { source, segments: out.segments, cards: { ar: out.ar.cards, en: out.en.cards }, llm }
}

const video = scenario({
  source: {
    input_type: 'video_url',
    title: 'مقطع تجريبي: الصبر والصيام',
    url: 'https://www.youtube.com/watch?v=TABAYYUN-MOCK',
    duration: 521,
    transcript_origin: 'captions',
    language: 'ar',
  },
  parts: [
    { at: 0, text: 'أهلاً بكم. نتحدث اليوم عن الصبر والصيام، ونمرّ على نصوص يكثر تداولها.' },
    { at: 134, card: 'ayah', before: 'قال تعالى: ', after: ' فالصبر أول ما نبدأ به.' },
    { at: 242, card: 'hadithPartial', before: 'وفي الحديث: ', after: ' إلى آخر الحديث.' },
    { at: 320, card: 'ruling', before: 'ومن المعلوم أن ', after: '، وهذا لا يخفى على أحد.' },
    { at: 351, card: 'hadithTwoGrades', before: 'وجاء في فضل الصيام: ', after: '' },
    { at: 378, card: 'bookHadith', before: 'ويُروى كذلك: ', after: '' },
    { at: 397, card: 'attributed', before: 'وقد قيل: ', after: '' },
    { at: 431, card: 'disputed', before: 'وأما ', after: ' فهذا ما أراه في المسألة.' },
    { at: 448, card: 'referenced', before: 'وكذلك ', after: '، ودليله عندهم الحديث الذي مرّ في فضل الصيام.' },
    { at: 466, card: 'misattributed', before: 'وقال الله تعالى: ', after: '' },
    { at: 492, card: 'personal', before: 'ووصلني هذا السؤال: ', after: '' },
    { at: 502, card: 'hadithNotFound', before: 'ويتداول الناس: ', after: '' },
    { at: 510, text: 'نكتفي بهذا القدر، وإلى لقاء قادم.' },
  ],
})

const text = scenario({
  source: { input_type: 'text', title: null, url: null, duration: null, transcript_origin: null, language: null },
  parts: [
    { card: 'ayah', before: 'ذكر الخطيب في خطبته فضل الصبر، واستشهد بقول الله تعالى: ', after: '' },
    { card: 'hadithPartial', before: 'ثم ذكر حديث: ', after: '' },
    { card: 'attributed', before: 'وختم بقوله: ', after: '' },
  ],
})

const fabrication = scenario({
  source: { input_type: 'text', title: null, url: null, duration: null, transcript_origin: null, language: null },
  parts: [{ card: 'request', before: '', after: '.' }],
})

const question = scenario({
  source: { input_type: 'text', title: null, url: null, duration: null, transcript_origin: null, language: null },
  parts: [{ card: 'question', before: '', after: '' }],
})

// ── /api/meta ─────────────────────────────────────────────────────────────────────────────────
function closingClause(a, marker) {
  // The clause is located by a word of the simple text; the Uthmani words at the same positions
  // are returned (pause marks are not words and are skipped on both sides).
  const isWord = (w) => /[ء-ي]/.test(w)
  const simple = words(a.simple).filter(isWord)
  const uthmani = words(a.uthmani).filter(isWord)
  const at = simple.findIndex((w) => w.includes(marker))
  if (at < 2 || simple.length !== uthmani.length) return a.uthmani
  return uthmani.slice(at - 2).join(' ')
}

const abst = ayah(...PICK.abstention)
const motto = ayah(...PICK.motto)

const meta = {
  abstention_verse: {
    text: closingClause(abst, 'الذكر'),
    ref: `${abst.name_ar}: ${abst.number}`,
    ref_en: `${abst.name_en} ${abst.surah}:${abst.number}`,
    url: quranUrl(abst, 'ar'),
  },
  motto_verse: {
    text: motto.uthmani,
    ref: `${motto.name_ar}: ${motto.number}`,
    ref_en: `${motto.name_en} ${motto.surah}:${motto.number}`,
    url: quranUrl(motto, 'ar'),
  },
  // The same sites, search addresses and word limits as backend/tabayyun/meta.py: the approved
  // package's fatwa sites, then the hadith one (which is not offered for questions and rulings).
  referral_links: [
    { name_ar: 'الإسلام سؤال وجواب', name_en: 'Islam Question & Answer', kind: 'fatwa', url: 'https://islamqa.info/ar', search_url: 'https://islamqa.info/ar/search?q={q}', max_words: 6 },
    { name_ar: 'الموقع الرسمي للشيخ عبدالعزيز بن باز', name_en: 'Official site of Shaykh Ibn Baz', kind: 'fatwa', url: 'https://binbaz.org.sa', search_url: 'https://binbaz.org.sa/search?q={q}', max_words: 6 },
    { name_ar: 'الموقع الرسمي للشيخ محمد بن صالح العثيمين', name_en: 'Official site of Shaykh Ibn Uthaymeen', kind: 'fatwa', url: 'https://binothaimeen.net', search_url: 'https://binothaimeen.net/ar/Searchpage/{q}/0/0', max_words: 2 },
    { name_ar: 'الدرر السنية', name_en: 'Dorar.net', kind: 'hadith', url: 'https://dorar.net', search_url: null, max_words: 0 },
  ],
  examples: [
    {
      id: 'text',
      input_type: 'text',
      label_ar: 'نص فيه آية وحديث',
      label_en: 'Text with a verse and a hadith',
      text: text.segments.map((s) => s.text).join('\n'),
      url: null,
    },
    {
      id: 'video',
      input_type: 'video_url',
      label_ar: 'رابط مقطع يوتيوب',
      label_en: 'YouTube link',
      text: null,
      url: video.source.url,
    },
    {
      id: 'fabrication',
      input_type: 'text',
      label_ar: 'طلب اختلاق حديث',
      label_en: 'A request to fabricate a hadith',
      text: fabrication.segments.map((s) => s.text).join('\n'),
      url: null,
    },
  ],
  limits: { max_text_chars: 60000, max_upload_mb: 50, max_media_minutes: 30 },
  // Phase 2. app_url is null on purpose: the UI then uses window.location.origin.
  features: { share_card: true, copy: true, explain: true, alternatives: true },
  app_url: null,
  data_version: DATA_VERSION,
}

const fixtures = {
  _generated: {
    by: 'frontend/scripts/build-fixtures.mjs',
    note: 'Generated file. Religious texts are read from the repository data by number or id; do not edit by hand.',
    quran: quran.meta.source,
    hadith: hadeethenc.meta.source,
    picks: PICK,
  },
  meta,
  scenarios: { video, text, fabrication, question },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 1) + '\n')

const summary = Object.entries(fixtures.scenarios)
  .map(([name, s]) => `${name}: ${s.cards.ar.length} cards [${s.cards.ar.map((c) => c.state).join(', ')}]`)
  .join('\n  ')
console.log(`Wrote ${path.relative(ROOT, OUT)}\n  ${summary}`)
