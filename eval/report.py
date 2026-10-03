"""Markdown table + comparison chart for eval/run.py results."""
from __future__ import annotations

from pathlib import Path

# Categorical palette validated for colour-vision deficiency (fixed order: one hue per system).
COLORS = {"lexical": "#2a78d6", "llm": "#eb6834", "tabayyun": "#1baf7a"}
SURFACE, INK, MUTED, GRID = "#fcfcfb", "#1f1f1e", "#5f5e5a", "#e6e5e0"
METRICS = [
    ("accuracy", "Evidence-state accuracy", "higher is better"),
    ("fabricated_attribution_rate", "Fabricated attributions", "\"supported\" with no matching source · lower is better, target 0%"),
    ("wrongly_endorsed_rate", "Wrongly endorsed", "weak, fabricated or disputed called \"supported\" · lower is better"),
    ("correct_abstention_rate", "Correct abstention", "requests to fabricate + invented texts · higher is better"),
]


def pct(ms: dict | None) -> str:
    if not ms or ms.get("mean") is None:
        return "—"
    return f"{ms['mean'] * 100:.1f}%" + (f" ± {ms['std'] * 100:.1f}" if ms.get("std") else "")


def write_markdown(results: dict, out_dir: Path) -> None:
    lines = [
        "# Evaluation results",
        "",
        f"Generated {results['generated_at']} · {results['testset']['claims']} claims "
        f"({results['testset']['reviewed_by_sulaiman']} reviewed by the Sharia reviewer so far) · {results['runs']} runs per system.",
        "",
        "| System | Accuracy | Fabricated attributions | Wrongly endorsed | Correct abstention | Seconds / claim |",
        "|---|---|---|---|---|---|",
    ]
    for key, s in results["systems"].items():
        if s["status"] != "ok":
            lines.append(f"| {s['label']} | not run — {s['reason']} | | | | |")
            continue
        lines.append(
            f"| {s['label']} | {pct(s['accuracy'])} | {pct(s['fabricated_attribution_rate'])} | {pct(s['wrongly_endorsed_rate'])} | {pct(s['correct_abstention_rate'])} | "
            f"{s['seconds_per_claim']['mean']:.2f} |"
        )
    lines += [
        "",
        "Mean ± standard deviation over the runs (no ± shown when every run gave the same result).",
        "",
        "- **Fabricated attributions**: a `supported` verdict with no matching source behind it — no source text shown, "
        "a text the test set knows has no source, or a Quran reference that does not contain the quoted words.",
        "- **Wrongly endorsed**: a `supported` verdict on a weak or fabricated narration, a disputed matter or a personal case.",
        "- **Correct abstention**: `not_found` with no source offered, on requests to fabricate evidence and on invented texts.",
        "",
    ]

    tab = results["systems"].get("tabayyun")
    if tab and tab["status"] == "ok":
        last = tab["last_run"]
        lines += ["## Tabayyun — per evidence state", "", "| State | Precision | Recall | Claims |", "|---|---|---|---|"]
        for state, m in last["per_state"].items():
            p = "—" if m["precision"] is None else f"{m['precision'] * 100:.0f}%"
            r = "—" if m["recall"] is None else f"{m['recall'] * 100:.0f}%"
            lines.append(f"| `{state}` | {p} | {r} | {m['support']} |")
        lines += ["", "## Tabayyun — per test category", "", "| Category | Correct | Claims |", "|---|---|---|"]
        for cat, m in last["per_category"].items():
            lines.append(f"| {cat} | {m['correct']} | {m['n']} |")
        if last["fabricated_attribution_ids"]:
            lines += ["", f"Fabricated attributions: {', '.join(last['fabricated_attribution_ids'])}"]
        lines.append("")
    (out_dir / "results.md").write_text("\n".join(lines), encoding="utf-8")


def write_chart(results: dict, out_dir: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    systems = list(results["systems"].items())
    rows_n = (len(METRICS) + 1) // 2
    fig, axes = plt.subplots(rows_n, 2, figsize=(10.5, rows_n * (1.5 + 0.42 * len(systems))), sharey=True)
    fig.patch.set_facecolor(SURFACE)
    for ax, (metric, title, subtitle) in zip(axes.flat, METRICS):
        ax.set_facecolor(SURFACE)
        for i, (key, s) in enumerate(systems):
            y = len(systems) - 1 - i
            if s["status"] != "ok" or s[metric]["mean"] is None:
                ax.text(1.5, y, "not run (no API key)", va="center", ha="left", fontsize=9, color=MUTED, style="italic")
                continue
            value = s[metric]["mean"] * 100
            ax.barh(y, value, height=0.42, color=COLORS[key], linewidth=0)
            ax.text(value + 2, y, f"{value:.0f}%", va="center", ha="left", fontsize=10, color=INK)
        ax.set_xlim(0, 115)
        ax.set_ylim(-0.6, len(systems) - 0.4)
        ax.set_xticks([0, 25, 50, 75, 100])
        ax.set_xticklabels(["0", "25", "50", "75", "100%"], fontsize=8, color=MUTED)
        ax.set_yticks(range(len(systems)))
        ax.set_yticklabels([s["label"] for _k, s in reversed(systems)], fontsize=10, color=INK)
        ax.tick_params(length=0)
        ax.xaxis.grid(True, color=GRID, linewidth=1)
        ax.set_axisbelow(True)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_title(title, loc="left", fontsize=11, color=INK, fontweight="bold", pad=20)
        ax.text(0, 1.04, subtitle, transform=ax.transAxes, fontsize=8.5, color=MUTED, va="bottom")
    for ax in list(axes.flat)[len(METRICS) :]:
        ax.set_visible(False)
    fig.suptitle(
        f"Same {results['testset']['claims']} claims, {results['runs']} runs per system",
        x=0.012, ha="left", fontsize=9, color=MUTED, y=0.995,
    )  # fmt: skip
    fig.tight_layout(rect=(0, 0, 1, 0.97), h_pad=2.2, w_pad=2.0)
    fig.savefig(out_dir / "comparison.png", dpi=160, facecolor=SURFACE)
    plt.close(fig)


AR_LABELS = {"lexical": "بحث لفظي فقط", "llm": "نموذج لغوي عام بلا استرجاع", "tabayyun": "تبيّن"}


def update_readme(results: dict, readme: Path) -> None:
    """Rewrite the results block of the README from the latest run (between the RESULTS markers)."""
    if not readme.exists():
        return
    text = readme.read_text(encoding="utf-8")
    start, end = "<!-- RESULTS:START -->", "<!-- RESULTS:END -->"
    if start not in text or end not in text:
        return
    n = results["testset"]["claims"]
    lines = [
        f"الأنظمة الثلاثة على المجموعة نفسها ({n} ادعاءً)، {results['runs']} مرات لكل نظام — المتوسط ± الانحراف المعياري:",
        "",
        "| النظام | دقة حالة الدليل | إسناد مختلَق | تأييد ما لا يُؤيَّد | امتناع صحيح | ثانية/ادعاء |",
        "|---|---|---|---|---|---|",
    ]
    for key, s in results["systems"].items():
        name = AR_LABELS[key] + (" (الوضع اللفظي — بلا نموذج لغوي)" if key == "tabayyun" and s.get("mode") == "lexical_only" else "")
        if s["status"] != "ok":
            lines.append(f"| {name} | لم يُشغَّل بعد — لا يوجد مفتاح نموذج لغوي | | | | |")
            continue
        lines.append(
            f"| {name} | {pct(s['accuracy'])} | {pct(s['fabricated_attribution_rate'])} | {pct(s['wrongly_endorsed_rate'])} | "
            f"{pct(s['correct_abstention_rate'])} | {s['seconds_per_claim']['mean']:.2f} |"
        )
    reviewed = results["testset"]["reviewed_by_sulaiman"]
    lines += [
        "",
        "![مقارنة الأنظمة الثلاثة](eval/results/comparison.png)",
        "",
        "- **إسناد مختلَق**: حكم «مؤيَّد» بلا نص مصدر مطابق خلفه. **تأييد ما لا يُؤيَّد**: «مؤيَّد» على حديث ضعيف أو موضوع أو مسألة خلافية.",
        f"- راجع المختص الشرعي {reviewed} من {n} صفاً حتى الآن؛ الحالات المتوقعة مبنية على طريقة توليد كل صف.",
    ]
    tab = results["systems"].get("tabayyun", {})
    if tab.get("status") == "ok" and tab.get("mode") == "lexical_only":
        lines.append(
            "- أرقام تبيّن أعلاه بالوضع اللفظي: الأخطاء الباقية كلها تقريباً في فئات تحتاج النموذج اللغوي "
            "(الأحكام، الأقوال المنسوبة). أعد التشغيل بعد ضبط المفاتيح."
        )
    block = start + "\n" + "\n".join(lines) + "\n" + end
    readme.write_text(text[: text.index(start)] + block + text[text.index(end) + len(end) :], encoding="utf-8")


def write_markdown_and_chart(results: dict, out_dir: Path) -> None:
    write_markdown(results, out_dir)
    write_chart(results, out_dir)
    update_readme(results, out_dir.parents[1] / "README.md")
