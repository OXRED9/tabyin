# Sources

Tabayyun only uses sources approved by the challenge's scientific reference
(«المرجعية والحزمة العلمية والبيانات», version 20/3/1448). That document is the final authority on
any source decision. Every API below was called for real before being relied on; the response shape
recorded here is what the call returned on **3 October 2026**.

## What the scientific reference requires (summary)

- **Scope**: serving, verifying and presenting Islamic content. Issuing independent personal fatwas,
  judging people or groups, and building rulings on unverified individual facts are out of scope.
- **Four content levels** — A (stable foundational information: answer directly, with source),
  B (explanation/definition/argumentation: answer from approved material, show the reference, avoid
  certainty where disagreement is possible), C (disputed or highly sensitive: restricted answer,
  state the disagreement, or refer to a specialist), D (fatwa or personal case: no independent
  ruling; general information and referral to a qualified body).
- **Binding standard**: every religious statement traceable to its source; distinguish definitive
  from ijtihadi; no independent fatwa; **prefer abstention, reservation or referral over an
  undocumented answer**; faithful translation of terms; disclose that the tool is AI-assisted;
  collect no personal data beyond need.
- **Hadith rule**: «لا ينسب حديث دون مصدر وحكم معتمد في البيانات».

## Sources in use

| # | Source | Used for | Access | State |
|---|---|---|---|---|
| 1 | Tanzil Project — Uthmani text (Madinah Mushaf) + simple-clean | Quran matching and display | one-time download, committed | in use |
| 2 | QuranEnc.com | translations of the meanings (English UI), verse pages | live API, cached | in use |
| 3 | HadeethEnc.com | hadith text, takhrij line, grading, explanation, English translation | one-time API download + local index | in use |
| 4 | Dorar.net — الموسوعة الحديثية | scholars' gradings, verbatim | live API, cached | in use |
| 5 | Open-Hadith-Data | the Six Books, Muwatta, Musnad Ahmad — retrieval only | download + local FTS index | in use |
| 6 | Challenge scientific package — terminology table | approved Arabic→English equivalents | static `data/terms.json` | in use |
| 7 | mcp.islamiccontent.org | association's MCP server | explored; used in a test to fetch a recitation | fallback only |
| 8 | islamqa.info, binbaz.org.sa, binothaimeen.net, the Kuwaiti encyclopedia (bohoth.awqaf.gov.kw) | rulings and fatwas (package p. 12) | referral only, links: binothaimeen — the nearest page by title from a local index of the site's public sitemap (titles and addresses only); islamqa and binbaz — the site's own search; the encyclopedia — its search page and the term to type. No fatwa text is fetched or shown | **linked, not integrated** |
| 9 | shamela.ws — المكتبة الشاملة | attributed sayings, in the scholars' own books | live search (the endpoint its own search page calls) + the top 3 pages, cached under hashed keys; the saying is aligned against each page's text | in use |

### 1. Quran text — Tanzil (Uthmani v1.1 and simple-clean)

- `https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true` and
  `…quranType=simple-clean…` → `surah|ayah|text` lines, 6,236 ayahs, followed by the licence block.
  Surah names from `https://tanzil.net/res/text/metadata/quran-data.xml`.
- The raw files are kept verbatim in `data/raw/tanzil/` (licence header intact).
  `scripts/build_quran.py` builds `data/quran.json`; the only processing is separating the basmala
  that Tanzil prefixes to the first ayah of each surah.
- The Uthmani text is what users see. The simple-clean text and a normalised form of both are used
  only for matching and never displayed as "the verse".
- The scientific reference names the King Fahd Complex text; Tanzil's Uthmani text follows the
  Madinah Mushaf and its terms allow verbatim redistribution. Switching to the Complex's own
  developer files (`qurancomplex.gov.sa/quran-dev`) is a data swap: same script, same JSON shape.

### 2. QuranEnc.com (association platform)

- `GET https://quranenc.com/api/v1/translation/aya/{key}/{sura}/{aya}` →
  `{"result": {"id","sura","aya","arabic_text","translation","footnotes"}}`.
  `GET /api/v1/translation/sura/{key}/{sura}` → `{"result": [ …same objects… ]}`.
  `GET /api/v1/translations/list/en` → `{"translations": [{"key","language_iso_code","title",…}]}`.
- Used for the English UI (`english_saheeh`) and as the verse page each Quran card links to
  (`https://quranenc.com/ar/browse/arabic_moyassar/{sura}/{aya}`).

### 3. HadeethEnc.com (association platform)

- `GET https://hadeethenc.com/api/v1/categories/roots/?language=ar` → 7 root categories
  `[{"id","title","hadeeths_count","parent_id"}]`.
- `GET /api/v1/hadeeths/list/?language=ar&category_id={id}&page={n}&per_page={n}` →
  `{"data":[{"id","title","translations":[…]}], "meta":{"current_page","last_page","total_items","per_page"}}`.
- `GET /api/v1/hadeeths/one/?language={ar|en}&id={id}` →
  `{"id","title","hadeeth","attribution","grade","explanation","hints","categories","translations","hadeeth_intro","words_meanings","reference"}`.
- `scripts/fetch_hadeethenc.py` downloads all 3,574 Arabic records (2,328 with an English
  translation) into `data/hadeethenc.json`. That file is **not** committed (the site publishes no
  redistribution licence); it is fetched from the public API at build time.
- `grade` and `attribution` are shown exactly as returned. The collection is a curated set of
  accepted narrations: 3,205 are graded «صحيح», 275 «حسن», the rest are variants of the two.

### 4. Dorar.net — hadith search API

- `GET https://dorar.net/dorar_api.json?skey={text}` (documented at `dorar.net/article/389`) →
  `{"ahadith": {"result": "<html>"}}`; each hit is a `<div class="hadith">` followed by a
  `<div class="hadith-info">` with `<span class="info-subtitle">` labels: الراوي, المحدث, المصدر,
  الصفحة أو الرقم, خلاصة حكم المحدث. Fifteen hits per call. `robots.txt` allows all paths.
- Called live for every hadith claim, cached on disk for 30 days (`data/cache/`, keyed by a SHA-256
  digest — no user text is stored).
- A grading is only attached to a card when the Dorar entry's text aligns with the quoted text above
  the match threshold, and, when our source names the narrating Companion, only for the same
  narrator. The grading text, scholar and book are copied verbatim.
- Availability varies by client: requests from `curl` on the development network were answered by
  a Cloudflare 403 page, while the backend's own HTTP client (honestly identified) gets normal
  answers. The client is never disguised. When Dorar cannot be reached the card says
  «الحكم غير متاح حالياً» and the state drops to `needs_review` unless the narration is in
  al-Bukhari or Muslim.

### 5. Open-Hadith-Data (github.com/mhashim6/Open-Hadith-Data)

- CSV files, one row per narration: `"number","text with tashkeel"[,"elaboration"]`.
  Indexed: Sahih al-Bukhari (7,008), Sahih Muslim (5,362), Sunan Abu Dawud (4,590), Jami
  al-Tirmidhi (3,891), Sunan al-Nasa'i (5,662), Sunan Ibn Majah (4,332), Muwatta Malik (1,594),
  Musnad Ahmad (26,363) — 58,802 narrations. Sunan al-Darimi ships with the dataset but is not on
  the project's approved list and is not indexed.
- **Retrieval only.** The dataset carries no gradings, so a hit here never produces one; numbering
  is the dataset's own and is labelled as such on the card.

### 6. Terminology

`data/terms.json` holds the ten Arabic→English equivalents and usage notes from the scientific
package's «نماذج لقاموس المصطلحات الأساسية» table (e.g. التوحيد → "Tawhid / Oneness of God").
The fuller dictionaries at `islamic-content.com/dictionary` and `terminologyenc.com` are the next
step.

### 7. Association MCP server (mcp.islamiccontent.org)

- Streamable-HTTP MCP at `POST /mcp`. Tools: `search`, `fetch`, `get_quran_verses`,
  `list_quran_translations`, `get_quran_audio`, `get_hadith`, `browse_hadith_categories`,
  `browse_library`, `get_library_item`, `list_library_categories`, `list_languages`.
- Its Quran and hadith corpora are QuranEnc and HadeethEnc — the same data Tabayyun already indexes
  locally — so it adds no coverage for those; it is kept as a fallback and for its IslamHouse
  library search (fatwas, books), which is the natural next source for rulings.

## Not integrated yet

- **Fatwa sites**: only linked. islamqa.info and binbaz.org.sa search through undocumented internal
  APIs (islamqa's robots.txt disallows its internals) and islamqa's sitemap lists numbers without
  titles, so they get search links, not a nearest page. The Kuwaiti encyclopedia's search is a form
  its firewall rejects for scripts. binothaimeen.net is matched by title (row 8).
- **Shamela**: integrated through its website search, not its 13 GB database (the database download is the package's other option; a local index of chosen authors would remove the dependency on the live site).
- **Tafsir** sources: not used; Tabayyun verifies wording and attribution, it does not explain.
