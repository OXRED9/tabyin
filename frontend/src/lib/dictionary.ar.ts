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
 * singular («ثلاثة لها مرجعية», «ثلاثة تحتاج مراجعة»).
 *
 * The state words say what was found about the SOURCE of a text, not whether the text is right
 * (docs/DESIGN.md §8.2; the backend's table is report/labels.py).
 */
const AR_NUMBER = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']
const arWord = (n: number) => (n >= 1 && n <= 10 ? AR_NUMBER[n] : n.toLocaleString('en-US'))
// «كلمة» is feminine, so three to ten take the masculine numeral: «ثلاث كلمات».
const AR_NUMBER_FEMININE_NOUN = ['', '', '', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر']
const AR_STATE_FORMS: Record<EvidenceState, { one: string; two: string; many: string; alone: string; allOf: string }> = {
  supported: { one: 'له مرجعية', two: 'لهما مرجعية', many: 'لها مرجعية', alone: 'له مرجعية', allOf: 'لها مرجعية' },
  supported_with_note: {
    one: 'له مرجعية مع ملاحظة',
    two: 'لهما مرجعية مع ملاحظة',
    many: 'لها مرجعية مع ملاحظة',
    alone: 'له مرجعية مع ملاحظة',
    allOf: 'لها مرجعية مع ملاحظة',
  },
  needs_review: {
    one: 'يحتاج مراجعة',
    two: 'يحتاجان مراجعة',
    many: 'تحتاج مراجعة',
    alone: 'يحتاج مراجعة',
    allOf: 'تحتاج مراجعة',
  },
  not_found: { one: 'بلا مرجعية', two: 'بلا مرجعية', many: 'بلا مرجعية', alone: 'بلا مرجعية', allOf: 'بلا مرجعية' },
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
  undo: 'تراجع',
  opensInNewTab: 'يفتح في تبويب جديد',

  // ── v3: the shell, the hero and the investigation (docs/DESIGN.md §10) ────────────────────────
  // Everything the investigation shows is a number, a name or a time the server really sent
  // (`trace` events, `meta.engines`); these strings only label them.
  shell: {
    menu: 'القائمة',
    newVerification: 'تحقّق جديد',
    rail: 'التنقّل والسجل',
    closeRail: 'إخفاء الشريط الجانبي',
    openRail: 'إظهار الشريط الجانبي',
    // From this browser's own record of when it verified; nothing is sent anywhere.
    week: (n: number) =>
      n === 1
        ? 'تحقّقت من نص واحد هذا الأسبوع'
        : n === 2
          ? 'تحقّقت من نصّين هذا الأسبوع'
          : n <= 10
            ? `تحقّقت من ${n} نصوص هذا الأسبوع`
            : `تحقّقت من ${n} نصاً هذا الأسبوع`,
  },

  hero: {
    enginesTitle: 'ما يعمل خلف هذه الصفحة',
    // TODO-SULAIMAN-REVIEW (wording of the four descriptions below).
    mushaf: {
      title: 'مطابق المصحف',
      body: 'يطابق لفظ كل آية بنص مصحف المدينة النبوية خوارزمياً، ولا نموذج في القرار.',
    },
    index: {
      title: 'فهرس الروايات',
      body: (graded: string, books: string) =>
        `${graded} رواية بأحكامها من موسوعة الأحاديث النبوية، و${books} رواية من كتب السنة.`,
    },
    units: { verse: 'آية', narration: 'رواية' },
    // The models are named by what they do and how many they are, never by their ids.
    models: {
      title: 'نماذج ذكاء اصطناعي',
      unit: (n: number): string => (n === 1 ? 'نموذج' : n === 2 ? 'نموذجان' : 'نماذج'),
      extractVerb: 'تستخرج الاستشهادات',
      visionVerb: 'تقرأ الصور',
      audioVerb: 'تفرّغ الصوت',
      join: '، ',
      propose: 'تقترح ولا تقرّر',
      none: 'غير مفعّلة على هذا الخادم: الفحص لفظي فقط.',
    },
    gradings: {
      title: 'أحكام المحدّثين',
      liveWord: 'حيّة',
      storedWord: 'محفوظة',
      live: 'تُجلب حيّة من الدرر السنية وتُنقل بنصّها؛ لا يولّد النموذج حكماً.',
      stored: 'تُنقل بنصّها من موسوعة الأحاديث النبوية؛ لا يولّد النموذج حكماً.',
    },
  },

  pipeline: {
    title: 'التحرّي',
    running: 'التحرّي جارٍ',
    finished: 'اكتمل التحرّي',
    replay: 'أعد عرض التحرّي',
    hide: 'إخفاء التحرّي',
    log: 'سجل الخطوات',
    status: { waiting: 'ينتظر', active: 'يعمل', done: 'تمّ', skipped: 'لم يُستخدم', warning: 'تعذّر' },
    steps: { scan: 'المطابقة الخوارزمية', verify: 'التحقق من المصادر', quranHits: 'في المصحف', narrationHits: 'في الروايات' },
    // A time the server rounded down to nothing is said as it is: under a millisecond.
    ms: (ms: number) =>
      ms < 1
        ? 'أقل من 1 مث'
        : ms < 1000
          ? `${ms.toLocaleString('en-US')} مث`
          : `${(ms / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} ث`,
    input: {
      title: 'المُدخل',
      kinds: { text: 'نص', article_url: 'رابط مقال', video_url: 'رابط مقطع', file: 'ملف صوتي أو مرئي', image: 'صورة' },
      characters: 'الأحرف',
    },
    read: {
      title: 'القراءة',
      pasted: 'نص يُقرأ كما هو',
      article: 'جلب نص المقال',
      captions: 'ترجمة المقطع المرفقة',
      stt: 'نموذج يفرّغ الصوت',
      image: 'نموذج يقرأ الصور',
      segments: 'المقاطع',
    },
    mushaf: { title: 'مطابق المصحف', detail: 'خوارزمي، بلا نموذج', verses: 'الآيات', hits: 'المطابقات' },
    narrations: { title: 'فهرس الروايات', detail: 'موسوعة الأحاديث وكتب السنة', count: 'الروايات', hits: 'المطابقات', markers: 'علامات الاستشهاد' },
    model: { title: 'نموذج الاستخراج', role: 'نموذج ذكاء اصطناعي يستخرج الاستشهادات', proposed: 'المقترَح', unused: 'فحص لفظي فقط' },
    gradings: { title: 'أحكام المحدّثين', detail: 'تُجلب حيّة من الدرر السنية', count: 'الأحكام', unreachable: 'تعذّر الوصول إلى الدرر السنية', notCalled: 'لم يُحتج إليها' },
    pointer: { title: 'نموذج الإشارة', detail: 'يشير إلى الدليل ولا يحكم', calls: 'النداءات', selections: 'اختيار «الثابت في الباب»' },
    rules: { title: 'محرّك القواعد', detail: 'القواعد تقرّر الحالة، لا النموذج', notes: 'الحواشي' },
    report: { title: 'التقرير', detail: 'جاهز للقراءة', elapsed: 'المدة' },
  },

  verdict: {
    tiles: 'الحالات بأعدادها',
    enginesUsed: 'ما عمل في هذا التحقق',
    elapsed: (seconds: string) => `${seconds} ث`,
    filterBy: (word: string) => `عرض الحواشي: ${word}`,
  },

  provenance: {
    title: 'مسار التحقق',
    matched: 'المطابقة',
    similarity: (value: string) => `التشابه ${value}`,
    source: 'المصدر',
    grading: 'الحكم',
    rule: 'القاعدة',
    action: 'الإجراء',
    none: 'لا مصدر مطابق',
  },

  panes: {
    text: 'النص',
    notes: 'الحواشي',
  },

  header: {
    language: 'لغة الواجهة',
    arabic: 'عربي',
    english: 'English',
    darkOn: 'تفعيل الوضع الداكن',
    darkOff: 'تفعيل الوضع الفاتح',
    export: 'تصدير التقرير',
    exportShort: 'تصدير',
    history: 'آخر ما تحققتَ منه',
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
    paste: 'لصق',
    chars: (n: number, max: number) => `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
    verify: 'تحقّق',
    verifying: 'جارٍ التحقق…',
    cancel: 'إلغاء',
    examples: 'جرّب:',
    recent: (n: number) => `آخر ما تحققتَ منه (${n})`,
  },

  // The installable app (F6).
  pwa: {
    install: 'ثبّت تبيّن على جهازك لتشارك إليه مباشرة من أي تطبيق',
    installButton: 'تثبيت',
    dismiss: 'إخفاء',
    ios: 'لتثبيت تبيّن: زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية». المشاركة إليه غير متاحة على iOS؛ الصق النص أو الرابط.',
    shareUnavailable: 'تعذّر استلام ما شاركتَه. الصقه هنا بدلاً من ذلك.',
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
    supported: 'له مرجعية في مصدر معتمد',
    supported_with_note: 'له مرجعية مع ملاحظة',
    needs_review: 'يحتاج مزيد تحقق',
    not_found: 'لم يُعثر على مصدر موثوق',
    contradicted: 'مخالف للمصدر',
  } satisfies Record<EvidenceState, string>,

  statesShort: {
    supported: 'له مرجعية',
    supported_with_note: 'له مرجعية مع ملاحظة',
    needs_review: 'يحتاج مراجعة',
    not_found: 'بلا مرجعية',
    contradicted: 'مخالف للمصدر',
  } satisfies Record<EvidenceState, string>,

  // The word beside the ring glyph in the margin (docs/DESIGN.md §2.2). `states` above stays the
  // full name: it is what the exports and the verdict card print.
  stateWords: {
    supported: 'له مرجعية',
    supported_with_note: 'له مرجعية مع ملاحظة',
    needs_review: 'يحتاج مراجعة',
    not_found: 'بلا مرجعية',
    contradicted: 'مخالف للمصدر',
  } satisfies Record<EvidenceState, string>,

  // «ما معنى هذه الحالات؟»: one plain sentence per state, of what it means and what it does not.
  // TODO-SULAIMAN-REVIEW (wording of every sentence here).
  legend: {
    link: 'ما معنى هذه الحالات؟',
    title: 'ما معنى هذه الحالات؟',
    description: 'الحالة تصف ما وُجد عن مصدر النص، لا حكماً بالعمل به.',
    states: {
      supported:
        'وُجد النص في مصدر معتمد بلفظه، والحكم المعروض منقول من المصدر. ليس حكماً من تبيّن بصحة العمل به.',
      supported_with_note:
        'وُجد النص في مصدر معتمد، واللفظ المتداول يختلف عنه يسيراً أو هو جزء منه. ليس اعتماداً للفظ المتداول: يُنقل لفظ المصدر.',
      needs_review:
        'لم يثبت من المصادر ولم يُنفَ: لفظ بعيد عن المصدر، أو حديث ضعّفه المصدر أو لم يتوفر حكمه، أو مسألة خلافية أو شخصية. ليس حكماً بخطئه؛ يُرجع فيه إلى أهل العلم.',
      not_found:
        'لم يُعثر على النص في المصادر المعتمدة التي يبحث فيها تبيّن. ليس حكماً بأنه مكذوب؛ قد يكون في مصدر آخر، فلا يُنقل حتى يُعرف مصدره.',
      contradicted:
        'النص يخالف ما في المصدر: آية غُيّر لفظها، أو قول نُسب إلى غير صاحبه، أو حديث حكم عليه المصدر بما يمنع نسبته إلى النبي ﷺ. الحكم منقول من المصدر، وليس حكماً من تبيّن على من نقله.',
    } satisfies Record<EvidenceState, string>,
    notDone: 'تبيّن لا يفتي ولا يرجّح بين أقوال أهل العلم ولا يحكم في حالة شخصية؛ يعرض ما في المصادر كما هو.',
  },

  // F2 «الثابت في الباب». TODO-SULAIMAN-REVIEW (the title and the sentence under it).
  alternatives: {
    title: 'الثابت في الباب',
    hint: 'أحاديث مقبولة في الموضوع نفسه، مسترجَعة من موسوعة الأحاديث النبوية — ليست تصحيحاً للنص المتداول',
  },

  // «أبلغ عن خطأ»: the message is composed here and sent by the reader's own mail or WhatsApp.
  feedback: {
    action: 'أبلغ عن خطأ',
    missedAction: 'فات تبيّن استشهاداً؟ أبلغ عن خطأ',
    title: 'أبلغ عن خطأ في هذا الحكم',
    titleMissed: 'أبلغ عن استشهاد لم يلتقطه تبيّن',
    privacy: 'لا يُرسَل شيء إلى خادم تبيّن: أنت من يرسل هذه الرسالة، بالوسيلة التي تختارها.',
    report: 'نص البلاغ',
    what: 'ما الخطأ؟',
    whatPlaceholder: 'اكتب ما تراه خطأً، وما الصواب إن عرفته',
    mail: 'إرسال بالبريد',
    whatsapp: 'إرسال بواتساب',
    copy: 'نسخ البلاغ',
    copied: 'نُسخ البلاغ ✓',
    share: 'مشاركة',
    subject: 'بلاغ عن خطأ في حكم — تبيّن',
    subjectMissed: 'بلاغ عن استشهاد لم يُلتقط — تبيّن',
    lineQuoted: 'النص',
    lineState: 'الحالة',
    lineRule: 'القاعدة',
    lineReference: 'المرجع',
    lineChecked: 'المحتوى المفحوص',
    lineData: 'إصدار البيانات',
    lineAddress: 'العنوان',
    lineWhat: 'الخطأ',
  },

  actions: {
    adopt: 'نقله مع ذكر مرجعه',
    correct_wording: 'تصحيح اللفظ',
    refer_to_scholars: 'إحالة إلى أهل العلم',
    remove_or_request_source: 'حذف أو طلب مصدر',
    remove_and_warn: 'حذف وتنبيه',
  } satisfies Record<Action, string>,

  // The same five actions, each said as a sentence in the open note. TODO-SULAIMAN-REVIEW (wording).
  actionSentences: {
    adopt: 'الإجراء المقترح: نقله مع ذكر مرجعه.',
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
    referenced: 'دليل مشار إليه',
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
      /** One clause of the sentence: «اثنان لهما مرجعية». */
      clause: (state: EvidenceState, n: number): string => {
        const forms = AR_STATE_FORMS[state]
        return `${arWord(n)} ${n === 1 ? forms.one : n === 2 ? forms.two : forms.many}`
      },
      /** When every citation has the same state: «استشهادان، كلاهما له مرجعية». */
      uniform: (state: EvidenceState, n: number): string => {
        const forms = AR_STATE_FORMS[state]
        return n === 1 ? ` ${forms.alone}` : n === 2 ? `، كلاهما ${forms.alone}` : `، كلها ${forms.allOf}`
      },
      colon: ': ',
      comma: '، ',
      and: 'و',
      showAll: 'عرض كل الحواشي',
      filterHint: (clause: string) => `عرض الحواشي: ${clause}`,
    },
    sortLabel: 'ترتيب الحواشي',
    sortByState: 'الأهم أولاً',
    sortByOrder: 'حسب الترتيب',
    pendingCount: (n: number) => `${n} قيد التحقق`,
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
    jump: (n: number) => `الحواشي (${n})`,
  },

  card: {
    quoted: 'كما ورد',
    inText: 'في النص',
    inSource: 'في المصدر',
    // A ruling or statement that points at its evidence: the text shown is what it refers to,
    // not something it quotes, and showing it raises no state.
    referencedSource: 'الدليل المشار إليه في المصادر',
    referencedShort: 'الدليل المشار إليه',
    // Beside the state of a hadith that has gradings and is not «له مرجعية»: the sources' own
    // words, every distinct one, so that «مخالف للمصدر» is read with what the sources say.
    gradedAs: (wordings: string[]) => `حكمه في المصادر: ${wordings.map((w) => `«${w}»`).join('، ')}`,
    // Travels with the verdict card and the shared text of such a claim: a disputed ruling beside
    // a narration, with no caveat, would read as an argument for one opinion.
    referencedCaveat: 'عرض هذا النص لا يعني ترجيحاً ولا حكماً من تبيّن.',
    reference: 'المرجع',
    grade: 'الحكم',
    grades: 'الحكم على الحديث',
    gradeUnavailable: 'الحكم غير متاح من المصدر',
    gradesCount: (n: number) =>
      n === 1 ? 'حكم واحد في المصدر' : n === 2 ? 'حكمان في المصادر' : n <= 10 ? `${n} أحكام في المصادر` : `${n} حكماً في المصادر`,
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
    description: 'صورة أو نص يلخّص الحكم ومصدره، بلا تاريخ ولا أي شيء عنك.',
    shareAs: 'المشاركة كـ',
    asImage: 'صورة',
    asText: 'نص',
    textPreview: 'النص الذي سيُرسل',
    copyText: 'نسخ النص',
    textCopied: 'نُسخ النص ✓',
    size: 'المقاس',
    portrait: 'عمودي',
    square: 'مربّع',
    theme: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    preview: 'معاينة البطاقة',
    send: 'مشاركة',
    download: 'حفظ الصورة',
    copyImage: 'نسخ الصورة',
    preparing: 'جارٍ تجهيز الصورة…',
    shared: 'تمت المشاركة ✓',
    downloaded: 'حُفظت الصورة ✓',
    copied: 'نُسخت الصورة ✓',
    copyFailed: 'هذا المتصفح لا ينسخ الصور. احفظ الصورة بدلاً من ذلك.',
    // The named apps (docs/DESIGN.md §8.3). A web page can hand an app text and an address through
    // its web link; an image reaches an app only through the system's share sheet.
    targets: 'مشاركة إلى تطبيق',
    apps: { whatsapp: 'واتساب', x: 'إكس', telegram: 'تيليغرام', instagram: 'إنستغرام' },
    hintImageSheet: 'أزرار التطبيقات تفتح قائمة المشاركة ومعها الصورة، فتختار التطبيق منها.',
    hintImageSave: 'هذا المتصفح لا يسلّم الصورة إلى تطبيق، فتُحفظ لترفقها أنت فيه.',
    hintText: 'واتساب وإكس وتيليغرام تُفتح وفيها هذا النص، وإنستغرام يُنسخ له النص لتلصقه فيه.',
    attachIn: (app: string) => `حُفظت الصورة. أرفقها في ${app}.`,
    pasteIn: (app: string) => `نُسخ النص. الصقه في ${app}.`,
    moreCitations: (n: number): string =>
      n === 1
        ? 'واستشهاد واحد آخر'
        : n === 2
          ? 'واستشهادان آخران'
          : n <= 10
            ? `و${arWord(n)} استشهادات أخرى`
            : n % 100 >= 3 && n % 100 <= 10
              ? `و${n} استشهادات أخرى`
              : `و${n} استشهاداً آخر`,
    failed: 'تعذّر تجهيز البطاقة. أعد المحاولة.',
    cardLabel: 'بطاقة تثبّت',
    summaryLabel: 'خلاصة التحقق',
    circulating: 'النص المتداول',
    referral: 'تبيّن لا يفتي ولا يرجّح؛ يُرجع في هذه المسألة إلى أهل العلم.',
    // The server's card says the same sentence (docs/DECISIONS.md, 65). TODO-SULAIMAN-REVIEW (wording).
    verseInMushaf: 'نص الآية أطول من أن تسعه البطاقة؛ يُقرأ كاملاً في موضعه من المصحف.',
    footer: 'تحقّق بنفسك على تبيّن',
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
    // TODO-SULAIMAN-REVIEW (wording).
    searchNote:
      'روابط بحث في مواقع أهل العلم المعتمدة؛ تبيّن لا يجلب منها شيئاً ولا يرجّح بينها، والنتائج نتائج بحث تلك المواقع.',
    searchFor: (words: string, site: string) => `ابحث عن «${words}» في ${site}`,
  },

  // «تبيّن يتحقق مما يُنقل، ولا يجيب عما يُسأل»: a question put to the tool is referred, never
  // answered. It is counted apart from the five states. TODO-SULAIMAN-REVIEW (wording of `only`
  // and `legend`; the note's own sentence comes from the backend).
  question: {
    word: 'سؤال',
    referred: 'أُحيل إلى أهل العلم',
    clause: (n: number): string =>
      n === 1
        ? 'سؤال واحد أُحيل إلى أهل العلم'
        : n === 2
          ? 'سؤالان أُحيلا إلى أهل العلم'
          : n <= 10
            ? `${arWord(n)} أسئلة أُحيلت إلى أهل العلم`
            : `${n} سؤالاً أُحيلت إلى أهل العلم`,
    only: (n: number): string =>
      `${n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالان' : n <= 10 ? `${arWord(n)} أسئلة` : `${n} سؤالاً`}: تبيّن يتحقق مما يُنقل ولا يجيب عما يُسأل.`,
    legend:
      'سؤال وُجّه إلى تبيّن. تبيّن يتحقق مما يُنقل ولا يجيب عما يُسأل: يحيلك بروابط بحث إلى مواقع أهل العلم المعتمدة، ولا يجلب منها جواباً. ليس حكماً في المسألة.',
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
    jsonHint: 'بيانات التقرير كاملة',
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
