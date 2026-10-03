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

/*
 * The summary is a sentence, so small numbers are words. Arabic: «استشهاد» is masculine, so three
 * to ten take the feminine numeral («ثلاثة استشهادات») and a plural of things takes a feminine
 * singular adjective («ثلاثة مؤيَّدة»).
 */
const AR_NUMBER = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']
const arWord = (n: number) => (n >= 1 && n <= 10 ? AR_NUMBER[n] : n.toLocaleString('en-US'))
// «كلمة» is feminine, so three to ten take the masculine numeral: «ثلاث كلمات».
const AR_NUMBER_FEMININE_NOUN = ['', '', '', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر']
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
    // F1: a picture is read first; its text is then checked by the user and verified as text.
    imageReading: 'جارٍ قراءة الصورة…',
    imageRead: 'هذا ما قرأناه من الصورة — عدّله إن لزم ثم تحقّق',
    imageUnread: (n: number): string =>
      n === 1
        ? 'كلمة واحدة لم تُقرأ — صحّحها قبل التحقق'
        : n === 2
          ? 'كلمتان لم تُقرآ — صحّحهما قبل التحقق'
          : n <= 10
            ? `${AR_NUMBER_FEMININE_NOUN[n]} كلمات لم تُقرأ — صحّحها قبل التحقق`
            : `${n.toLocaleString('en-US')} كلمة لم تُقرأ — صحّحها قبل التحقق`,
    imageUncertain: 'القراءة غير مؤكَّدة: قارن النص بالصورة قبل التحقق.',
    imageRemoved: (n: number) => `حُذف من الصورة (${n})`,
    imageRemove: 'إزالة الصورة',
    imageFailed: 'لم تُقرأ الصورة',
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
    partial: 'الكلمات الملوَّنة هي ما ورد في النص.',
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
    invalidUrl: { message: 'هذا لا يبدو رابطاً صحيحاً', hint: 'الرابط يبدأ بـ https:// — انسخه كاملاً من شريط العنوان.' },
    tooLong: (max: number) => ({
      message: `النص أطول من الحد المسموح (${max.toLocaleString('en-US')} حرف)`,
      hint: 'قسّم النص إلى أجزاء وتحقق من كل جزء على حدة.',
    }),
    imageTooLarge: (mb: number) => ({
      message: `الصورة أكبر من ${mb} م.ب`,
      hint: 'اقتطع الجزء الذي فيه النص، أو صغّر الصورة، ثم أرفقها من جديد.',
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
