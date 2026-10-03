# Licences and attribution

## Code

The source code in this repository is released under the MIT licence (`LICENSE`).

## Data and religious texts

| Material | Publisher | Terms | How this repo complies |
|---|---|---|---|
| Quran text (Uthmani v1.1, simple-clean) and surah metadata | Tanzil Project — tanzil.net | Creative Commons Attribution 3.0; verbatim copies only; the copyright notice must be kept; the source must be indicated with a link to tanzil.net | Raw files are committed unchanged with their licence block (`data/raw/tanzil/`); `data/quran.json` embeds the notice; the UI and the exported report name Tanzil. The displayed text is never altered. |
| Hadith text, gradings, explanations, translations | HadeethEnc.com (جمعية خدمة المحتوى الإسلامي باللغات) | Free public API (`hadeethenc.com/api-docs`); the challenge's scientific reference states the association's content is free for individuals and organisations. No redistribution licence is published. | Not redistributed: `data/hadeethenc.json` is downloaded from the API at build time and is git-ignored. Every card links to the narration's page on hadeethenc.com. |
| Translations of the meanings of the Quran | QuranEnc.com (same association) | Free public API | Fetched on demand, cached, shown with the translation's name and a link. |
| Scholars' gradings | Dorar.net (مؤسسة الدرر السنية) | Public JSON API offered «لأصحاب المواقع» to show search results from the encyclopedia; all rights reserved by the foundation | Called live per claim; gradings are quoted verbatim with scholar, book and a link back to Dorar's search. Nothing is redistributed in bulk. |
| The Six Books, Muwatta, Musnad Ahmad | Open-Hadith-Data (mhashim6) | Open Database License 1.0; contents under Database Contents License 1.0 | Downloaded at build time into a derived search index (git-ignored). Attribution on every card that uses it and in the exported report. |
| Terminology table | Challenge scientific package (Bathel Foundation / Future Frontiers) | Provided to participants | `data/terms.json` cites the document. |
| Evaluation test set (`eval/testset/`, `eval/audio_scripts/`) | Built by this project | Short excerpts from the sources above, each row citing its origin | Kept small, attributed per row, for evaluation only. |

## Software dependencies (main ones)

| Component | Licence |
|---|---|
| FastAPI, Uvicorn, Pydantic, httpx | MIT / BSD-3-Clause |
| rapidfuzz | MIT |
| trafilatura | Apache-2.0 |
| yt-dlp | Unlicense |
| ffmpeg (system package in the Docker image) | LGPL/GPL |
| faster-whisper (optional), CTranslate2 | MIT |
| anthropic, openai SDKs | MIT / Apache-2.0 |
| React, Vite, Tailwind CSS, shadcn/ui, Radix UI, lucide-react | MIT / ISC |
| IBM Plex Sans Arabic, Inter, Amiri Quran (self-hosted via Fontsource) | SIL Open Font License 1.1 |

## Third-party services

LLM calls go to Anthropic (primary) and OpenAI (fallback) under the team's own API keys; speech-to-text
goes to OpenAI when a key is configured. Their terms apply to the text sent to them (see
`docs/OPERATIONS.md` → Privacy).
