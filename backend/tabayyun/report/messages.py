"""User-facing error catalogue: what happened + what to do now, in Arabic and English."""
from __future__ import annotations

ERRORS: dict[str, dict[str, str]] = {
    "empty_input": {
        "message_ar": "لم يصلنا نص للتحقق منه.",
        "message_en": "There is no text to verify.",
        "hint_ar": "الصق النص أو الرابط ثم اضغط «تحقّق».",
        "hint_en": "Paste a text or a link, then press Verify.",
    },
    "input_too_long": {
        "message_ar": "النص أطول من الحد المسموح في طلب واحد.",
        "message_en": "The text is longer than a single request allows.",
        "hint_ar": "قسّم النص إلى أجزاء وتحقق من كل جزء على حدة.",
        "hint_en": "Split the text and verify each part separately.",
    },
    "invalid_url": {
        "message_ar": "هذا الرابط غير صالح.",
        "message_en": "This link is not valid.",
        "hint_ar": "تأكد أنه يبدأ بـ https:// وأنه رابط صفحة عامة.",
        "hint_en": "Make sure it starts with https:// and points to a public page.",
    },
    "article_fetch_failed": {
        "message_ar": "تعذّر استخراج نص المقال من هذا الرابط.",
        "message_en": "The article text could not be extracted from this link.",
        "hint_ar": "انسخ نص المقال والصقه في تبويب «نص».",
        "hint_en": "Copy the article text and paste it in the Text tab.",
    },
    "video_download_failed": {
        "message_ar": "تعذّر تحميل هذا المقطع من المنصة.",
        "message_en": "This clip could not be downloaded from the platform.",
        "hint_ar": "ارفع الملف من تبويب «رفع ملف» أو الصق التفريغ في تبويب «نص».",
        "hint_en": "Upload the file in the Upload tab, or paste the transcript in the Text tab.",
    },
    "video_too_long": {
        "message_ar": "المقطع أطول من الحد المسموح.",
        "message_en": "The clip is longer than the allowed limit.",
        "hint_ar": "اختر مقطعاً أقصر أو الصق تفريغ الجزء الذي يهمك.",
        "hint_en": "Choose a shorter clip or paste the transcript of the part you need.",
    },
    "no_speech": {
        "message_ar": "لم نجد كلاماً مسموعاً في هذا المقطع.",
        "message_en": "No speech was found in this recording.",
        "hint_ar": "تأكد من وضوح الصوت أو الصق النص مباشرة.",
        "hint_en": "Check the audio quality, or paste the text directly.",
    },
    "transcription_unavailable": {
        "message_ar": "خدمة التفريغ الصوتي غير متاحة حالياً، وهذا المقطع بلا ترجمة نصية جاهزة.",
        "message_en": "Speech-to-text is unavailable right now and this clip has no ready captions.",
        "hint_ar": "الصق التفريغ في تبويب «نص»، أو جرّب مقطعاً عليه ترجمة نصية.",
        "hint_en": "Paste the transcript in the Text tab, or try a clip that has captions.",
    },
    "unsupported_file": {
        "message_ar": "نوع الملف غير مدعوم.",
        "message_en": "This file type is not supported.",
        "hint_ar": "ارفع ملفاً صوتياً أو مرئياً (mp3, m4a, wav, mp4, webm).",
        "hint_en": "Upload an audio or video file (mp3, m4a, wav, mp4, webm).",
    },
    "file_too_large": {
        "message_ar": "حجم الملف أكبر من الحد المسموح.",
        "message_en": "The file is larger than the allowed limit.",
        "hint_ar": "اقتطع الجزء المطلوب أو حوّله إلى ملف صوتي أصغر.",
        "hint_en": "Trim the part you need or convert it to a smaller audio file.",
    },
    "no_claims": {
        "message_ar": "لم نجد في هذا المحتوى استشهاداً شرعياً يمكن التحقق منه.",
        "message_en": "No religious citation to verify was found in this content.",
        "hint_ar": "جرّب نصاً فيه آية أو حديث أو قول منسوب.",
        "hint_en": "Try a text that contains a verse, a hadith or an attributed saying.",
    },
    "llm_unavailable": {
        "message_ar": "نموذج اللغة غير متاح الآن؛ نعمل بالوضع اللفظي بتغطية أقل.",
        "message_en": "The language model is unavailable; running in lexical mode with reduced coverage.",
        "hint_ar": "تُفحص الآيات والأحاديث المنقولة بلفظها، وقد لا تُلتقط الأحكام والروايات بالمعنى.",
        "hint_en": "Verbatim verses and hadith are still checked; rulings and paraphrased narrations may be missed.",
    },
    "internal": {
        "message_ar": "حدث خطأ غير متوقع أثناء المعالجة.",
        "message_en": "An unexpected error occurred while processing.",
        "hint_ar": "أعد المحاولة بعد قليل.",
        "hint_en": "Please try again shortly.",
    },
}


def error_event(code: str, stage: str, fatal: bool = True) -> dict:
    return {"code": code, "stage": stage, "fatal": fatal, **ERRORS.get(code, ERRORS["internal"])}
