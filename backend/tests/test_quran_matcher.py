"""The Quran matcher is purely algorithmic. Faulty quotations are derived from the Mushaf text."""
import pytest

from tabayyun.evidence_rules import decide_ayah
from tabayyun.schemas import EvidenceState


def decide(m, explicit=True):
    return decide_ayah(
        found=m is not None,
        exact=bool(m and m.kind == "exact"),
        similarity=m.similarity if m else 0.0,
        quoted_words=m.quoted_words if m else 0,
        explicit_attribution=explicit,
    )


@pytest.mark.parametrize("ref", [(1, 2), (2, 153), (2, 255), (49, 6), (112, 1), (103, 3)])
def test_full_ayah_matches_exactly_in_both_spellings(quran, ayah, ref):
    uthmani, clean = ayah(*ref)
    for text in (clean, uthmani):
        m = quran.match(text)
        assert m is not None and m.kind == "exact"
        assert (m.surah, m.ayah_start) == ref
        assert decide(m).state == EvidenceState.supported


def test_fragment_of_three_or_more_words_is_exact(quran, ayah):
    words = ayah(2, 255)[1].split()
    m = quran.match(" ".join(words[4:9]))
    assert m.kind == "exact" and (m.surah, m.ayah_start) == (2, 255)


def test_fragment_repeated_elsewhere_lists_other_locations(quran, ayah):
    words = ayah(2, 153)[1].split()
    m = quran.match(" ".join(words[-4:]))
    assert m.kind == "exact" and m.other_locations


def test_quote_spanning_two_ayahs(quran, ayah):
    m = quran.match(ayah(112, 1)[1] + " " + ayah(112, 2)[1])
    assert m.kind == "exact" and (m.surah, m.ayah_start, m.ayah_end) == (112, 1, 2)


def test_two_words_cannot_be_verified(quran, ayah):
    assert quran.match(" ".join(ayah(2, 255)[1].split()[5:7])) is None


def test_one_changed_word_in_a_long_ayah_is_supported_with_note_and_diffed(quran, ayah):
    words = ayah(2, 255)[1].split()[:22]
    foreign = ayah(55, 46)[1].split()[-1]
    assert foreign not in words
    altered = words.copy()
    altered[10] = foreign
    m = quran.match(" ".join(altered))
    assert m.kind == "fuzzy" and m.similarity >= 0.85
    assert (m.surah, m.ayah_start) == (2, 255)
    changed = [d for d in m.diff if d.op != "equal"]
    assert len(changed) == 1 and changed[0].quoted == foreign and changed[0].source == words[10]
    assert decide(m).state == EvidenceState.supported_with_note


def test_heavily_altered_ayah_attributed_to_the_quran_is_contradicted(quran, ayah):
    words = ayah(49, 6)[1].split()
    donor = ayah(2, 282)[1].split()
    altered = words.copy()
    for k, i in enumerate((2, 6, 9, 13)):
        altered[i] = donor[20 + k * 3]
    m = quran.match(" ".join(altered))
    assert m is not None and 0.60 <= m.similarity < 0.85
    assert (m.surah, m.ayah_start) == (49, 6)
    assert decide(m, explicit=True).state == EvidenceState.contradicted
    assert decide(m, explicit=False).state == EvidenceState.needs_review


def test_text_that_is_not_quran_is_not_found(quran):
    m = quran.match("هذه جملة عادية تتحدث عن أحوال الطقس والمواصلات في المدينة اليوم")
    assert decide(m).state == EvidenceState.not_found


def test_scan_finds_a_verse_inside_running_text(quran, ayah):
    verse = ayah(49, 6)[1]
    text = "تحدث الكاتب عن خطورة الإشاعات ثم أورد " + verse + " وختم مقاله بالدعوة إلى التثبت"
    found = quran.find_quotes(text)
    assert len(found) == 1 and (found[0][2].surah, found[0][2].ayah_start) == (49, 6)


def test_scan_ignores_ordinary_prose(quran):
    assert quran.find_quotes("ذهبنا إلى السوق في الصباح واشترينا بعض الحاجات ثم عدنا إلى البيت قبل الظهر") == []


def test_displayed_text_is_the_verbatim_uthmani_ayah(quran, ayah):
    uthmani, clean = ayah(103, 3)
    m = quran.match(" ".join(clean.split()[-4:]))
    assert (m.surah, m.ayah_start) == (103, 3)
    assert m.uthmani_text == uthmani
