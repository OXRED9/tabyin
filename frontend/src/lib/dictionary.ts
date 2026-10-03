/**
 * The whole UI copy, Arabic first. `en` must satisfy the same shape, so a missing translation is a
 * type error. No Quran verse, hadith or scholar's quote may ever appear here: religious text is
 * served by the API at runtime.
 */
import type {
  Action,
  Certainty,
  ClaimType,
  ContentLevel,
  EvidenceState,
  MatchKind,
  StageId,
} from './types'

/** Arabic count agreement: 1 واحد, 2 مثنى, 3–10 جمع, 11+ مفرد منصوب. */
function arCount(
  n: number,
  f: { zero: string; one: string; two: string; few: string; many: string },
): string {
  if (n === 0) return f.zero
  if (n === 1) return f.one
  if (n === 2) return f.two
  const mod = n % 100
  if (mod >= 3 && mod <= 10) return `${n} ${f.few}`
  return `${n} ${f.many}`
}

const enCount = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/*
 * The summary is a sentence, so small numbers are words. Arabic: «استشهاد» is masculine, so three
 * to ten take the feminine numeral («ثلاثة استشهادات») and a plural of things takes a feminine
 * singular adjective («ثلاثة مؤيَّدة»).
 */
const AR_NUMBER = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']
const arWord = (n: number) => (n >= 1 && n <= 10 ? AR_NUMBER[n] : n.toLocaleString('en-US'))
const AR_STATE_FORMS: Record<EvidenceState, { one: string; two: string; many: string; alone: string; allOf: string }> = {
  supported: { one: 'مؤيَّد', two: 'مؤيَّدان', many: 'مؤيَّدة', alone: 'مؤيَّد', allOf: 'مؤيَّدة' },
  supported_with_note: {
    one: 'مع ملاحظة',
    two: 'مع ملاحظة',
    many: 'مع ملاحظة',
    alone: 'مؤيَّد مع ملاحظة',
    allOf: 'مؤيَّدة مع ملاحظة',
  },
  needs_review: {
    one: 'يحتاج مراجعة',
    two: 'يحتاجان مراجعة',
    many: 'تحتاج مراجعة',
    alone: 'يحتاج مراجعة',
    allOf: 'تحتاج مراجعة',
  },
  not_found: { one: 'بلا مصدر', two: 'بلا مصدر', many: 'بلا مصدر', alone: 'بلا مصدر', allOf: 'بلا مصدر' },
  contradicted: {
    one: 'مخالف للمصدر',
    two: 'مخالفان للمصدر',
    many: 'مخالفة للمصدر',
    alone: 'مخالف للمصدر',
    allOf: 'مخالفة للمصدر',
  },
}

const EN_NUMBER = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const enWord = (n: number) => (n >= 1 && n <= 10 ? EN_NUMBER[n] : n.toLocaleString('en-US'))
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const EN_STATE_FORMS: Record<EvidenceState, { one: string; many: string }> = {
  supported: { one: 'supported', many: 'supported' },
  supported_with_note: { one: 'with a note', many: 'with a note' },
  needs_review: { one: 'needs review', many: 'need review' },
  not_found: { one: 'with no source', many: 'with no source' },
  contradicted: { one: 'contradicts the source', many: 'contradict the source' },
}

export const ar = {
  appName: 'تبيّن',
  // The headline is the client's own wording (docs/DESIGN_V2_BRIEF.md §2), copied from the brief.
  headline: 'فتبيّنوا — تحقّق قبل أن تصدّق أو تنشر',
  transparency: 'تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم',
  skipToContent: 'تخطَّ إلى المحتوى',
  close: 'إغلاق',
  opensInNewTab: 'يفتح في تبويب جديد',

  header: {
    language: 'لغة الواجهة',
    arabic: 'عربي',
    english: 'English',
    darkOn: 'تفعيل الوضع الداكن',
    darkOff: 'تفعيل الوضع الفاتح',
    reviewerMode: 'وضع المراجع',
    reviewerModeHint: 'يتيح تعديل حالة كل حاشية بمراجعة بشرية',
    export: 'تصدير التقرير',
    exportShort: 'تصدير',
    history: 'آخر ما تحققتَ منه',
    more: 'المزيد',
    home: 'تبيّن: الصفحة الرئيسية',
  },

  input: {
    tabsLabel: 'نوع المُدخل',
    tabs: {
      text: 'نص',
      article_url: 'رابط مقال',
      video_url: 'رابط مقطع',
      file: 'رفع ملف',
    },
    label: 'تحقّق من صحة الآيات والأحاديث في أي نص',
    placeholder: 'الصق نصاً أو رابط مقطع أو مقال، أو أرفق ملفاً صوتياً…',
    placeholderImage: 'الصق نصاً أو رابط مقطع أو مقال، أو أرفق صورة من واتساب…',
    attach: 'إرفاق',
    attachLink: 'رابط',
    attachImage: 'صورة',
    attachFile: 'ملف',
    attachAudio: 'صوت',
    // The tag under the field: what was recognised, then what will be done with it. After a
    // failed attempt on that link only the first half is shown: the tag must not go on promising.
    link: {
      youtube: 'مقطع يوتيوب',
      tiktok: 'مقطع تيك توك',
      video: 'رابط مقطع',
      article: 'رابط مقال',
    },
    linkPromise: {
      video: 'سيُفرَّغ ويُتحقق منه',
      article: 'سيُقرأ نصه ويُتحقق منه',
    },
    linkRemove: 'إزالة الرابط',
    asVideo: 'هذا رابط مقطع',
    asArticle: 'هذا رابط مقال',
    fileMedia: 'سيُفرَّغ ويُتحقق منه',
    fileImage: 'سيُقرأ نصها ويُتحقق منه',
    fileLimit: (mb: number) => `حتى ${mb} م.ب، ولا يُحفظ الملف على الخادم`,
    fileRemove: 'إزالة الملف',
    dropHere: 'أفلت الملف هنا',
    fileSize: (size: string, unit: 'kb' | 'mb') => `${size} ${unit === 'kb' ? 'ك.ب' : 'م.ب'}`,
    clear: 'مسح الحقل',
    chars: (n: number, max: number) => `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
    verify: 'تحقّق',
    verifying: 'جارٍ التحقق…',
    cancel: 'إلغاء',
    examples: 'جرّب:',
    recent: (n: number) => `آخر ما تحققتَ منه (${n})`,
  },

  stages: {
    ingest: 'الحصول على النص',
    extract: 'استخراج الادّعاءات',
    match: 'المطابقة مع المصادر',
    rules: 'تحديد حالة الدليل',
    report: 'تقرير التحقق',
  } satisfies Record<StageId, string>,

  // One word under each of the five steps.
  stagesShort: {
    ingest: 'النص',
    extract: 'الاستخراج',
    match: 'المطابقة',
    rules: 'الحكم',
    report: 'التقرير',
  } satisfies Record<StageId, string>,

  progress: {
    label: 'تقدّم التحقق',
    sentence: (stage: string) => `جارٍ التحقق — ${stage}`,
    stageOf: (n: number) => `المرحلة ${n} من 5`,
    eta: (s: number) => `الوقت المتوقع: نحو ${s} ث`,
    etaSoon: 'لحظات وينتهي…',
    matched: (done: number, total: number) => `${done} من ${total}`,
    stageDone: 'اكتملت',
    stageActive: 'جارية',
    stagePending: 'لم تبدأ',
    cancelled: 'أُلغي التحقق',
  },

  states: {
    supported: 'مؤيَّد بمصدر معتمد',
    supported_with_note: 'مؤيَّد مع ملاحظة',
    needs_review: 'يحتاج مزيد تحقق',
    not_found: 'لم يُعثر على مصدر موثوق',
    contradicted: 'مخالف للمصدر',
  } satisfies Record<EvidenceState, string>,

  statesShort: {
    supported: 'مؤيَّد',
    supported_with_note: 'مع ملاحظة',
    needs_review: 'يحتاج تحققاً',
    not_found: 'بلا مصدر',
    contradicted: 'مخالف',
  } satisfies Record<EvidenceState, string>,

  // The word beside the ring glyph in the margin (docs/DESIGN.md §2.2). `states` above stays the
  // full name: it is what the exports and the reviewer's menu print.
  stateWords: {
    supported: 'مؤيَّد',
    supported_with_note: 'مؤيَّد مع ملاحظة',
    needs_review: 'يحتاج مراجعة',
    not_found: 'لا مصدر',
    contradicted: 'مخالف للمصدر',
  } satisfies Record<EvidenceState, string>,

  actions: {
    adopt: 'اعتماد',
    correct_wording: 'تصحيح اللفظ',
    refer_to_scholars: 'إحالة إلى أهل العلم',
    remove_or_request_source: 'حذف أو طلب مصدر',
    remove_and_warn: 'حذف وتنبيه',
  } satisfies Record<Action, string>,

  // The same five actions, each said as a sentence in the open note. TODO-SULAIMAN-REVIEW (wording).
  actionSentences: {
    adopt: 'الإجراء المقترح: اعتماده كما ورد.',
    correct_wording: 'الإجراء المقترح: تصحيح اللفظ على ما في المصدر.',
    refer_to_scholars: 'الإجراء المقترح: إحالة المسألة إلى أهل العلم.',
    remove_or_request_source: 'الإجراء المقترح: حذفه أو طلب مصدره.',
    remove_and_warn: 'الإجراء المقترح: حذفه والتنبيه على مخالفته للمصدر.',
  } satisfies Record<Action, string>,

  claimTypes: {
    ayah: 'آية',
    hadith: 'حديث',
    ruling: 'حكم',
    attributed_quote: 'قول منسوب',
    fact: 'معلومة',
    request: 'طلب دليل',
  } satisfies Record<ClaimType, string>,

  levels: {
    A: 'أصلي مستقر',
    B: 'شرح وتعريف واستدلال',
    C: 'خلافي أو عالي الحساسية',
    D: 'فتوى أو حالة شخصية',
  } satisfies Record<ContentLevel, string>,

  certainty: {
    definitive: 'قطعي',
    ijtihadi: 'اجتهادي',
    not_applicable: 'لا ينطبق',
  } satisfies Record<Certainty, string>,

  matchKinds: {
    exact: 'تطابق نصي كامل',
    near: 'تطابق قريب',
    partial: 'اقتباس مجتزأ',
    paraphrase: 'رواية بالمعنى',
    topic: 'تطابق في الموضوع',
    none: 'لا تطابق',
  } satisfies Record<MatchKind, string>,

  report: {
    title: 'تقرير التحقق',
    citations: (n: number) =>
      arCount(n, {
        zero: 'لا استشهادات',
        one: 'استشهاد واحد',
        two: 'استشهادان',
        few: 'استشهادات',
        many: 'استشهاداً',
      }),
    summaryLabel: 'ملخص التقرير',
    summary: {
      total: (n: number): string =>
        n === 0
          ? 'لا استشهادات'
          : n === 1
            ? 'استشهاد واحد'
            : n === 2
              ? 'استشهادان'
              : n <= 10
                ? `${arWord(n)} استشهادات`
                : arCount(n, { zero: '', one: '', two: '', few: 'استشهادات', many: 'استشهاداً' }),
      /** One clause of the sentence: «اثنان مؤيَّدان». */
      clause: (state: EvidenceState, n: number): string => {
        const forms = AR_STATE_FORMS[state]
        return `${arWord(n)} ${n === 1 ? forms.one : n === 2 ? forms.two : forms.many}`
      },
      /** When every citation has the same state: «استشهادان، كلاهما مؤيَّد». */
      uniform: (state: EvidenceState, n: number): string => {
        const forms = AR_STATE_FORMS[state]
        return n === 1 ? ` ${forms.alone}` : n === 2 ? `، كلاهما ${forms.alone}` : `، كلها ${forms.allOf}`
      },
      colon: ': ',
      comma: '، ',
      and: 'و',
      showAll: 'عرض كل الحواشي',
      filterHint: (clause: string) => `عرض الحواشي: ${clause}`,
      reviewed: (n: number): string =>
        n === 1
          ? 'استشهاد واحد روجع بشرياً'
          : n === 2
            ? 'استشهادان روجعا بشرياً'
            : n <= 10
              ? `${arWord(n)} استشهادات روجعت بشرياً`
              : `${arCount(n, { zero: '', one: '', two: '', few: 'استشهادات', many: 'استشهاداً' })} روجعت بشرياً`,
    },
    sortLabel: 'ترتيب الحواشي',
    sortByState: 'الأهم أولاً',
    sortByOrder: 'حسب الترتيب',
    pendingCount: (n: number) => `${n} قيد التحقق`,
    modifiedCount: (n: number) => `${n} معدَّلة بمراجعة بشرية`,
    lexicalTitle: 'تغطية مخفَّضة',
    lexicalBody:
      'نموذج اللغة غير متاح الآن، فاقتصر الفحص على الآيات والأحاديث المنقولة بلفظها. قد لا تُلتقط الأحكام والروايات بالمعنى.',
    dorarUnavailable: 'أحكام المحدّثين من «الدرر السنية» غير متاحة الآن.',
    backupModelBody:
      'النموذج اللغوي الأساسي غير متاح الآن، فأُجيب هذا الطلب بنموذج احتياطي. قد يفوته بعض الاستشهادات؛ الأحكام نفسها ما زالت تصدر عن القواعد والمصادر.',
    noClaimsTitle: 'لم نجد في هذا المحتوى استشهاداً دينياً نتحقق منه',
    noClaimsHint: 'جرّب نصاً فيه آية أو حديث أو قول منسوب.',
    finishTitle: 'اكتمل التحقق',
    finishBody: (seconds: string) => `استغرق التحقق ${seconds} ث`,
    finished: (seconds: string | null) => (seconds ? `اكتمل التحقق في ${seconds} ث.` : 'اكتمل التحقق.'),
    sources: 'المصادر المستخدمة',
    another: 'تحقّق من نص آخر',
    restored: 'تقرير محفوظ في هذا المتصفح.',
    shareSummary: 'بطاقة خلاصة التحقق',
  },

  notes: {
    title: 'الحواشي',
    open: 'افتح الحاشية',
    pendingWord: 'قيد التحقق',
    noneForFilter: 'لا حواشي بهذه الحالة.',
    sourceWords: 'نص المصدر',
    quotedWords: 'النص كما ورد',
    without: 'استشهاد بلا موضع في النص',
    quote: (text: string) => `«${text}»`,
  },

  card: {
    quoted: 'كما ورد',
    inText: 'في النص',
    inSource: 'في المصدر',
    reference: 'المرجع',
    grade: 'الحكم',
    grades: 'الحكم على الحديث',
    gradeUnavailable: 'الحكم غير متاح من المصدر',
    gradesCount: (n: number) =>
      n === 2 ? 'حكمان في المصادر' : n <= 10 ? `${n} أحكام في المصادر` : `${n} حكماً في المصادر`,
    gradesMany: 'وردت عدة أحكام، وتُعرض كلها كما في مصادرها دون ترجيح.',
    gradeVerbatim: 'منقول بنصّه من المصدر',
    scholar: 'المحدِّث',
    book: 'الكتاب',
    narrator: 'الراوي',
    gradeSource: 'مصدر الحكم',
    attribution: 'التخريج',
    sourceText: 'النص في المصدر',
    source: 'المصدر',
    openSource: 'فتح المصدر',
    level: 'المستوى',
    certainty: 'درجة القطعية',
    action: 'الإجراء المقترح',
    occurredAt: (time: string) => `ورد في الدقيقة ${time}`,
    minute: (time: string) => `الدقيقة ${time}`,
    openVideoAt: (time: string) => `فتح المقطع عند الدقيقة ${time} في تبويب جديد`,
    position: 'موضع الورود',
    attributedTo: 'منسوب في المحتوى إلى',
    note: 'ملاحظة التحقق',
    explanation: 'شرح الناشر',
    explanationHint: 'منقول من المصدر كما هو، وليس من تبيّن',
    aiExplanation: 'شرح مولَّد بالذكاء الاصطناعي',
    aiExplanationHint: 'ليس مصدراً ولا حكماً، وقد يخطئ.',
    otherSources: (n: number) => `مصادر أخرى (${n})`,
    technical: 'تفاصيل تقنية',
    rule: 'القاعدة المطبَّقة',
    similarity: 'نسبة التشابه',
    matchKind: 'نوع المطابقة',
    translation: 'الترجمة',
    warnings: 'تنبيهات',
    details: 'التفاصيل',
    showDetails: 'عرض التفاصيل',
    hideDetails: 'إخفاء التفاصيل',
    locate: 'موضعه في النص',
    showMore: 'عرض النص كاملاً',
    showLess: 'عرض أقل',
    pending: 'جارٍ التحقق من هذا الاستشهاد…',
    abstention: 'لا نُصدر حكماً بلا مصدر، ولا نولّد بديلاً.',
    referral: 'إحالة إلى أهل العلم',
    personalCase: 'هذه حالة شخصية تستوجب فتوى من جهة مؤهلة',
    disagreement: 'مسألة خلافية: يعرض تبيّن ما ورد في المصادر كما هو، دون ترجيح.',
    claimN: (n: number) => `الاستشهاد ${n}`,
    levelSentence: (level: string, name: string, certainty: string) =>
      `المستوى ${level}، ${name}. درجة القطعية: ${certainty}.`,
    attributedSentence: (who: string) => `منسوب في المحتوى إلى: ${who}.`,
    gradeBy: (parts: string[]) => parts.join('، '),
    reviewedShort: (original: string) => `مراجعة بشرية، الحالة الأصلية: ${original}`,
  },

  copy: {
    ayah: 'نسخ الآية',
    hadith: 'نسخ نص الحديث',
    source: 'نسخ نص المصدر',
    hint: 'ينسخ نص المصدر مع مرجعه، لا النص كما ورد',
    done: 'تم النسخ ✓',
    failed: 'تعذّر النسخ. حدّد النص وانسخه يدوياً.',
    report: 'نسخ التقرير كنص',
    reportHint: 'Markdown جاهز للصق في رسالة أو مستند',
    reportDone: 'نُسخ التقرير نصاً ✓',
  },

  share: {
    button: 'مشاركة بطاقة التثبّت',
    short: 'بطاقة مشاركة',
    description: 'صورة تلخّص الحكم ومصدره. لا تحمل تاريخاً ولا أي شيء عنك.',
    size: 'المقاس',
    portrait: 'عمودي',
    square: 'مربّع',
    theme: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    preview: 'معاينة البطاقة',
    send: 'مشاركة',
    download: 'تنزيل الصورة',
    copyImage: 'نسخ الصورة',
    preparing: 'جارٍ تجهيز الصورة…',
    shared: 'تمت المشاركة ✓',
    downloaded: 'نُزّلت البطاقة ✓',
    copied: 'نُسخت الصورة ✓',
    copyFailed: 'هذا المتصفح لا ينسخ الصور. نزّل البطاقة بدلاً من ذلك.',
    failed: 'تعذّر تجهيز البطاقة. أعد المحاولة.',
    cardLabel: 'بطاقة تثبّت',
    summaryLabel: 'خلاصة التحقق',
    asQuoted: 'النص كما ورد',
    reference: 'المرجع',
    grading: 'الحكم (منقول حرفياً)',
    source: 'المصدر',
    footer: 'تحقّق بنفسك على تبيّن',
    humanReview: 'حالة معدَّلة بمراجعة بشرية',
    citationsNoun: (n: number): string =>
      n === 1 ? 'استشهاد' : n === 2 ? 'استشهادان' : n % 100 >= 3 && n % 100 <= 10 ? 'استشهادات' : 'استشهاداً',
    alt: (state: string) => `بطاقة تثبّت: ${state}`,
    altSummary: 'بطاقة خلاصة التحقق',
  },

  explain: {
    title: 'لماذا هذا الحكم؟',
    rule: 'القاعدة التي طُبّقت',
    ruleId: 'معرّف القاعدة',
    similarity: 'التشابه',
    threshold: 'العتبة',
    meets: 'يبلغ العتبة',
    below: 'دون العتبة',
    similarityOf: (value: string) => `التشابه ${value}`,
    thresholdOf: (value: string) => `العتبة ${value}`,
    noSimilarity: 'لم يُحسب تشابه لفظي لهذا الاستشهاد.',
    candidates: 'المرشحون المسترجَعون من المصادر',
    noCandidates: 'لم يُسترجَع أي مرشح من المصادر.',
    rank: 'الترتيب',
    source: 'المصدر',
    reference: 'المرجع',
    grade: 'الحكم',
    chosen: 'المعتمد',
    chosenHint: 'المرشح الذي بُنيت عليه البطاقة',
    notChosen: 'غير معتمد',
    byTopic: 'بالموضوع',
    noGrade: 'لا حكم في المصدر',
    open: 'فتح',
    level: 'مستوى المحتوى',
    levelByRule: 'حُدِّد بقاعدة',
    levelByModel: 'تعليل المصنِّف الآلي، وليس حكماً شرعياً',
    timing: 'الزمن',
    matchMs: (duration: string) => `مطابقة هذا الاستشهاد: ${duration}`,
    seconds: (value: string) => `${value} ث`,
    millis: (value: string) => `${value} مللي ثانية`,
    total: 'الإجمالي',
    dataVersion: 'نسخة البيانات',
    limits: 'حدود هذا الحكم',
  },

  diff: {
    title: 'مقارنة اللفظ',
    exact: 'اللفظ مطابق للمصدر',
    legend: 'دليل الألوان',
    changed: 'لفظ مختلف',
    extra: 'زيادة ليست في المصدر',
    missing: 'في المصدر ولم يُذكر',
    partial: 'بالحبر الداكن ما ورد في النص، وبالباهت بقية نص المصدر.',
  },

  referral: {
    title: 'إحالة إلى أهل العلم',
    description: 'تبيّن لا يفتي ولا يرجّح. هذه جهات يمكنك الرجوع إليها:',
    empty: 'تعذّر تحميل روابط الإحالة الآن.',
  },

  reviewer: {
    title: 'مراجعة بشرية',
    state: 'الحالة بعد المراجعة',
    chooseState: 'اختر الحالة',
    note: 'ملاحظة المراجع',
    notePlaceholder: 'سبب التعديل أو ملاحظة للمحرّر',
    name: 'اسم المراجع',
    namePlaceholder: 'الاسم',
    save: 'حفظ المراجعة',
    undo: 'تراجع',
    remove: 'إلغاء المراجعة',
    modified: 'حالة معدَّلة بمراجعة بشرية',
    noted: 'ملاحظة مراجعة بشرية',
    original: 'الحالة الأصلية',
    by: (name: string) => `المراجع: ${name}`,
    anonymous: 'بلا اسم',
    saved: 'حُفظت المراجعة',
    undone: 'أُلغيت المراجعة',
    needsSource: 'لا تُعتمد حالة «مؤيَّد» دون نص مصدر مسترجَع.',
    levelC: 'المسائل الخلافية لا تُرفع إلى «مؤيَّد» ولا تُجعل «مخالف».',
    levelD: 'الحالات الشخصية لا تُعطى حالة؛ تُحال إلى جهة فتوى مؤهلة.',
    nothingToSave: 'غيّر الحالة أو اكتب ملاحظة أولاً.',
  },

  transcript: {
    titleMedia: 'التفريغ',
    titleText: 'النص الأصلي',
    show: 'عرض النص الأصلي',
    duration: 'المدة',
    origin: {
      captions: 'من ترجمة المقطع المرفقة',
      'cloud-stt': 'تفريغ آلي سحابي',
      'local-stt': 'تفريغ آلي محلي',
    } as Record<string, string>,
    jumpToCard: (n: number, state: string) => `الاستشهاد ${n}: ${state}. انتقل إلى بطاقته`,
    passage: (text: string, state: string) => `${text} — ${state}. افتح الحاشية`,
    pendingState: 'قيد التحقق',
    openSource: 'فتح المصدر الأصلي',
    empty: 'لا يوجد نص لعرضه.',
    durationOf: (clock: string) => `المدة ${clock}`,
  },

  exportMenu: {
    json: 'ملف JSON',
    jsonHint: 'البيانات كاملة مع المراجعات البشرية',
    html: 'صفحة للطباعة أو PDF',
    htmlHint: 'تقرير مقروء مع المصادر كاملة',
    doneJson: 'نُزِّل ملف JSON',
    doneHtml: 'فُتحت صفحة الطباعة في تبويب جديد',
    downloadedHtml: 'نُزِّلت صفحة التقرير',
    fallback: 'تعذّر الوصول إلى الخادم، فأُنشئت الصفحة في المتصفح.',
    print: 'طباعة',
    generatedAt: 'تاريخ التقرير',
    inputSource: 'المحتوى المفحوص',
  },

  history: {
    title: 'آخر ما تحققتَ منه',
    empty: 'لا يوجد سجل بعد.',
    localOnly: 'يُحفظ في هذا المتصفح فقط، ولا يُرسل إلى أي خادم.',
    clear: 'مسح السجل',
    cleared: 'مُسح السجل',
    open: 'فتح التقرير',
    untitled: 'تحقق بلا عنوان',
  },

  errors: {
    retry: 'أعد المحاولة',
    uploadInstead: 'ارفع الملف',
    pasteInstead: 'الصق التفريغ',
    pasteText: 'الصق نص المقال',
    dismiss: 'إخفاء الرسالة',
    empty: { message: 'لا يوجد ما نتحقق منه', hint: 'الصق نصاً أو رابطاً، أو أرفق ملفاً، ثم اضغط «تحقّق».' },
    // The backend's hints still name the old tabs; these say the same thing for one composer.
    hintPasteArticle: 'قد يمنع الموقع القراءة الآلية. انسخ نص المقال والصقه في الحقل.',
    hintUploadOrPaste: 'ارفع الملف أو الصق التفريغ في الحقل.',
    hintPasteTranscript: 'الصق التفريغ في الحقل، أو جرّب مقطعاً عليه ترجمة نصية.',
    invalidUrl: { message: 'هذا لا يبدو رابطاً صحيحاً', hint: 'الرابط يبدأ بـ https:// — انسخه كاملاً من شريط العنوان.' },
    tooLong: (max: number) => ({
      message: `النص أطول من الحد المسموح (${max.toLocaleString('en-US')} حرف)`,
      hint: 'قسّم النص إلى أجزاء وتحقق من كل جزء على حدة.',
    }),
    fileTooLarge: (mb: number) => ({
      message: `الملف أكبر من ${mb} م.ب`,
      hint: 'اقتطع الجزء المطلوب من المقطع، أو الصق تفريغه نصاً.',
    }),
    unsupportedFile: {
      message: 'نوع الملف غير مدعوم',
      hint: 'ارفع ملفاً صوتياً أو مرئياً مثل mp3 أو m4a أو wav أو mp4 أو webm.',
    },
    network: { message: 'تعذّر الاتصال بالخادم', hint: 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة.' },
    interrupted: {
      message: 'انقطع الاتصال قبل اكتمال التقرير',
      hint: 'أعد المحاولة. الحواشي التي وصلت معروضة أدناه.',
    },
    internal: { message: 'حدث خطأ غير متوقع', hint: 'أعد المحاولة بعد لحظات.' },
  },
}

export type Dictionary = typeof ar

export const en: Dictionary = {
  appName: 'Tabayyun',
  headline: 'Verify before you believe or share',
  transparency:
    'Tabayyun is an AI-assisted tool. It does not replace consulting qualified scholars.',
  skipToContent: 'Skip to content',
  close: 'Close',
  opensInNewTab: 'Opens in a new tab',

  header: {
    language: 'Interface language',
    arabic: 'عربي',
    english: 'English',
    darkOn: 'Switch to dark mode',
    darkOff: 'Switch to light mode',
    reviewerMode: 'Reviewer mode',
    reviewerModeHint: 'Lets a human reviewer change the state of each note',
    export: 'Export report',
    exportShort: 'Export',
    history: 'What you verified recently',
    more: 'More',
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
    fileImage: 'its text will be read, then verified',
    fileLimit: (mb: number) => `Up to ${mb} MB. The file is not stored on the server`,
    fileRemove: 'Remove file',
    dropHere: 'Drop the file here',
    fileSize: (size: string, unit: 'kb' | 'mb') => `${size} ${unit === 'kb' ? 'KB' : 'MB'}`,
    clear: 'Clear field',
    chars: (n: number, max: number) => `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
    verify: 'Verify',
    verifying: 'Verifying…',
    cancel: 'Cancel',
    examples: 'Try:',
    recent: (n: number) => `What you verified recently (${n})`,
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
    supported: 'Supported by an approved source',
    supported_with_note: 'Supported, with a note',
    needs_review: 'Needs further verification',
    not_found: 'No reliable source found',
    contradicted: 'Contradicts the source',
  },

  statesShort: {
    supported: 'supported',
    supported_with_note: 'with a note',
    needs_review: 'needs review',
    not_found: 'no source',
    contradicted: 'contradicted',
  },

  stateWords: {
    supported: 'Supported',
    supported_with_note: 'Supported, with a note',
    needs_review: 'Needs review',
    not_found: 'No source',
    contradicted: 'Contradicts the source',
  },

  actions: {
    adopt: 'Adopt',
    correct_wording: 'Correct the wording',
    refer_to_scholars: 'Refer to scholars',
    remove_or_request_source: 'Remove or request a source',
    remove_and_warn: 'Remove and warn',
  },

  actionSentences: {
    adopt: 'Suggested action: adopt it as quoted.',
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
      reviewed: (n: number) => `${capital(enWord(n))} ${n === 1 ? 'citation' : 'citations'} reviewed by a human`,
    },
    sortLabel: 'Note order',
    sortByState: 'Most important first',
    sortByOrder: 'In text order',
    pendingCount: (n: number) => `${n} in progress`,
    modifiedCount: (n: number) => `${n} changed by human review`,
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
  },

  card: {
    quoted: 'As quoted',
    inText: 'In the text',
    inSource: 'In the source',
    reference: 'Reference',
    grade: 'Grading',
    grades: 'Hadith grading',
    gradeUnavailable: 'Grading not available from the source',
    gradesCount: (n: number) => `${n} gradings in the sources`,
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
    reviewedShort: (original: string) => `Human review, original state: ${original}`,
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
    description: 'An image that sums up the verdict and its source. It carries no date and nothing about you.',
    size: 'Size',
    portrait: 'Portrait',
    square: 'Square',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    preview: 'Card preview',
    send: 'Share',
    download: 'Download image',
    copyImage: 'Copy image',
    preparing: 'Preparing the image…',
    shared: 'Shared ✓',
    downloaded: 'Card downloaded ✓',
    copied: 'Image copied ✓',
    copyFailed: 'This browser cannot copy images. Download the card instead.',
    failed: 'The card could not be prepared. Try again.',
    cardLabel: 'Verification card',
    summaryLabel: 'Verification summary',
    asQuoted: 'As quoted',
    reference: 'Reference',
    grading: 'Grading (verbatim)',
    source: 'Source',
    footer: 'Check it yourself on Tabayyun',
    humanReview: 'State changed by human review',
    citationsNoun: (n: number) => (n === 1 ? 'citation' : 'citations'),
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
    partial: 'Dark ink: the words quoted in the text. Faint: the rest of the source’s words.',
  },

  referral: {
    title: 'Refer to scholars',
    description: 'Tabayyun issues no fatwa and prefers no opinion. You can consult these bodies:',
    empty: 'The referral links could not be loaded right now.',
  },

  reviewer: {
    title: 'Human review',
    state: 'State after review',
    chooseState: 'Choose a state',
    note: 'Reviewer note',
    notePlaceholder: 'Reason for the change, or a note for the editor',
    name: 'Reviewer name',
    namePlaceholder: 'Name',
    save: 'Save review',
    undo: 'Undo',
    remove: 'Remove review',
    modified: 'State changed by human review',
    noted: 'Human reviewer note',
    original: 'Original state',
    by: (name: string) => `Reviewer: ${name}`,
    anonymous: 'unnamed',
    saved: 'Review saved',
    undone: 'Review removed',
    needsSource: '“Supported” cannot be set without a retrieved source text.',
    levelC: 'Disputed matters cannot be raised to “supported” or set to “contradicted”.',
    levelD: 'Personal cases get no state; they are referred to a qualified fatwa body.',
    nothingToSave: 'Change the state or write a note first.',
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
    jsonHint: 'All data, including human reviews',
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
    hintPasteArticle: 'The site may block automated reading. Copy the article text and paste it in the field.',
    hintUploadOrPaste: 'Upload the file, or paste the transcript in the field.',
    hintPasteTranscript: 'Paste the transcript in the field, or try a clip that has captions.',
    invalidUrl: { message: 'This does not look like a valid link', hint: 'A link starts with https:// — copy it in full from the address bar.' },
    tooLong: (max: number) => ({
      message: `The text is longer than the limit (${max.toLocaleString('en-US')} characters)`,
      hint: 'Split the text and verify each part separately.',
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

export const dictionaries = { ar, en } as const
