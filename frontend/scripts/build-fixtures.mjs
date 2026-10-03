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
    ...partial,
  }
}

// Claims that stand in for content the fixtures must not invent (same device as the pitch deck).
const STAND_IN = {
  attributed: '[قول منسوب إلى أحد العلماء كما ورد في المقطع]',
  disputed: '[حكم في مسألة خلافية كما ورد في المقطع]',
}
// Not religious texts: a pillar named in the pitch deck's own mock, a personal question, a request.
const PLAIN = {
  ruling: 'صيام رمضان واجب على كل مسلم',
  personal: 'طلّقت زوجتي وأنا غاضب، فهل يقع الطلاق؟',
  request: 'أعطني حديثاً يثبت أن من أكل التفاح على الريق دخل الجنة',
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
      rule_id: 'hadith.accepted_partial',
      similarity: partialDiff.similarity,
      match_kind: 'partial',
      source: hadithSource(hPartial, lang),
      grades: [hadithGrade(hPartial)],
      diff: partialDiff.ops,
      note_ar: 'اقتباس مجتزأ: اللفظ المنقول جزء من حديث في مصدر معتمد، وبقية النص مظلَّلة في المقارنة.',
      note_en:
        'Partial quote: the quoted words are part of a narration in an approved source. The rest of the text is highlighted in the comparison.',
      ai_explanation:
        lang === 'ar'
          ? 'ذكر المتحدث مطلع الحديث فقط. النص في المصدر أطول، والجزء الذي لم يُذكر مظلَّل في المقارنة أعلاه.'
          : 'The speaker quoted only the opening of the hadith. The source text is longer, and the part that was left out is highlighted in the comparison above.',
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
      disagreement_noted: true,
      note_ar: 'مسألة اجتهادية وقع فيها خلاف بين أهل العلم. لا يرجّح تبيّن قولاً على قول.',
      note_en: 'An ijtihadi matter on which scholars differ. Tabayyun prefers no opinion over another.',
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
      note_ar: 'حالة شخصية: لا يصدر تبيّن فيها حكماً ولا يتحقق منها.',
      note_en: 'A personal case: Tabayyun issues no ruling on it and does not verify it.',
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
    { at: 466, card: 'misattributed', before: 'وقال الله تعالى: ', after: '' },
    { at: 492, card: 'personal', before: 'ووصلني هذا السؤال: ', after: '' },
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
  referral_links: [
    { name_ar: 'الإسلام سؤال وجواب', name_en: 'Islam Question & Answer', url: 'https://islamqa.info/ar' },
    { name_ar: 'الموقع الرسمي للشيخ عبدالعزيز بن باز', name_en: 'Official site of Shaykh Ibn Baz', url: 'https://binbaz.org.sa' },
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
  scenarios: { video, text, fabrication },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 1) + '\n')

const summary = Object.entries(fixtures.scenarios)
  .map(([name, s]) => `${name}: ${s.cards.ar.length} cards [${s.cards.ar.map((c) => c.state).join(', ')}]`)
  .join('\n  ')
console.log(`Wrote ${path.relative(ROOT, OUT)}\n  ${summary}`)
