from tabayyun.normalize import arabic_ratio, normalize_ar, strip_diacritics
from tabayyun.textalign import aligned_words, best_span, word_diff, words_with_offsets


def test_diacritics_and_tatweel_removed():
    assert strip_diacritics("مُحَمَّـــد") == "محمد"


def test_hamza_alef_ya_ta_unified():
    assert normalize_ar("أإآٱ") == "اااا"
    assert normalize_ar("مؤمن شيء قائل") == "مومن شي قايل"
    assert normalize_ar("هدى") == "هدي"
    assert normalize_ar("رحمة") == "رحمه"


def test_punctuation_digits_and_latin_removed():
    assert normalize_ar("«كلمة»، 12 word! أخرى؟") == "كلمه اخري"


def test_honorifics_dropped_only_on_request():
    text = "قال النبي صلى الله عليه وسلم كلاما"
    assert "صلي" in normalize_ar(text)
    assert normalize_ar(text, drop_honorifics=True) == "قال النبي كلاما"
    assert normalize_ar("قال ﷺ كلاما") == "قال كلاما"


def test_uthmani_and_simple_spelling_of_the_same_ayah_share_most_words(ayah):
    uthmani, clean = ayah(1, 2)
    shared = set(normalize_ar(uthmani).split()) & set(normalize_ar(clean).split())
    assert len(shared) >= 2


def test_arabic_ratio():
    assert arabic_ratio("نص عربي") == 1.0
    assert arabic_ratio("english text") == 0.0


def test_words_with_offsets_point_back_into_the_text():
    text = "أولا، ثانيا: «ثالثا»"
    words = words_with_offsets(text)
    assert [text[s:e] for s, e, _o, _n in words] == ["أولا", "ثانيا", "ثالثا"]


def test_aligned_words_are_one_to_one():
    orig, norm = aligned_words("الكَلِمَةُ الأولى، والثانية")
    assert len(orig) == len(norm) == 3


def test_best_span_finds_a_fragment_inside_a_longer_text():
    source = "ا ب ج د ه و ز ح ط ي".split()
    span = best_span("د ه و".split(), source)
    assert (span.start, span.end) == (3, 6) and span.score == 1.0


def test_word_diff_reports_original_spelling():
    q_o, q_n = aligned_words("كَلِمَة أولى خاطئة")
    s_o, s_n = aligned_words("كلمة أولى صحيحة")
    diff = word_diff(q_o, q_n, s_o, s_n)
    assert [d.op for d in diff] == ["equal", "replace"]
    assert diff[1].quoted == "خاطئة" and diff[1].source == "صحيحة"
