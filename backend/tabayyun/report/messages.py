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
        "hint_ar": "انسخ نص المقال والصقه في خانة التحقق.",
        "hint_en": "Copy the article text and paste it into the field.",
    },
    "video_download_failed": {
        "message_ar": "تعذّر تحميل هذا المقطع من المنصة.",
        "message_en": "This clip could not be downloaded from the platform.",
        "hint_ar": "أرفق الملف نفسه، أو الصق التفريغ في خانة التحقق.",
        "hint_en": "Attach the file itself, or paste the transcript into the field.",
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
        "hint_ar": "الصق التفريغ في خانة التحقق، أو جرّب مقطعاً عليه ترجمة نصية.",
        "hint_en": "Paste the transcript into the field, or try a clip that has captions.",
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
    "rate_limited": {
        "message_ar": "طلبات كثيرة من هذا العنوان في وقت قصير.",
        "message_en": "Too many requests from this address in a short time.",
        "hint_ar": "انتظر دقيقة ثم أعد المحاولة.",
        "hint_en": "Wait a minute and try again.",
    },
    "internal": {
        "message_ar": "حدث خطأ غير متوقع أثناء المعالجة.",
        "message_en": "An unexpected error occurred while processing.",
        "hint_ar": "أعد المحاولة بعد قليل.",
        "hint_en": "Please try again shortly.",
    },
}


ERRORS.update(
    {
        "unsupported_image": {
            "message_ar": "تعذّرت قراءة هذا الملف كصورة.",
            "message_en": "This file could not be read as an image.",
            "hint_ar": "أرفق لقطة شاشة أو صورة بصيغة PNG أو JPG أو WebP أو HEIC.",
            "hint_en": "Attach a screenshot or a photo in PNG, JPG, WebP or HEIC format.",
        },
        "image_too_large": {
            "message_ar": "الصورة أكبر من الحد المسموح.",
            "message_en": "The image is larger than the limit.",
            "hint_ar": "قصّ الجزء الذي فيه النص ثم أرفقه، أو أرفق لقطة شاشة بدل الصورة الأصلية.",
            "hint_en": "Crop it to the part with the text, or attach a screenshot instead of the original photo.",
        },
        "ocr_unavailable": {
            "message_ar": "قراءة الصور غير متاحة الآن.",
            "message_en": "Reading images is not available right now.",
            "hint_ar": "اكتب النص الذي في الصورة أو الصقه في خانة التحقق.",
            "hint_en": "Type or paste the text of the image into the field.",
        },
        "ocr_failed": {
            "message_ar": "لم نتمكن من قراءة النص في هذه الصورة.",
            "message_en": "We could not read the text in this image.",
            "hint_ar": "جرّب صورة أوضح، أو اكتب النص في خانة التحقق.",
            "hint_en": "Try a clearer image, or type the text into the field.",
        },
        "no_text_in_image": {
            "message_ar": "لم نجد نصاً مقروءاً في هذه الصورة.",
            "message_en": "We found no readable text in this image.",
            "hint_ar": "تأكد أن الصورة فيها نص واضح، أو اكتبه في خانة التحقق.",
            "hint_en": "Make sure the image shows clear text, or type it into the field.",
        },
    }
)


def error_event(code: str, stage: str, fatal: bool = True) -> dict:
    return {"code": code, "stage": stage, "fatal": fatal, **ERRORS.get(code, ERRORS["internal"])}
