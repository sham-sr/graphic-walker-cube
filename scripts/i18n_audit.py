import json
import re
from pathlib import Path

src = Path("packages/graphic-walker/src")
locales_dir = src / "locales"
locales = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in locales_dir.glob("*.json")}


def flatten(obj, prefix=""):
    out = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                out |= flatten(v, p)
            else:
                out.add(p)
    return out


flat = {lang: flatten(data) for lang, data in locales.items()}
en = flat["en-US"]
en_tops = set(locales["en-US"].keys())

key_prefix_re = re.compile(
    r"useTranslation\(\s*['\"]translation['\"]\s*,\s*\{\s*keyPrefix:\s*['\"]([^'\"]+)['\"]"
)
t_call_re = re.compile(r"\bt\(\s*[`'\"]([^`'\"]+)[`'\"]")

files = [f for f in list(src.rglob("*.tsx")) + list(src.rglob("*.ts")) if "locales" not in f.parts and ".test." not in f.name]


def keys_for_file(text: str, rel: str):
    results = []
    cur_prefixes: list[str] = []
    for line in text.splitlines():
        m = key_prefix_re.search(line)
        if m:
            cur_prefixes = [m.group(1)]
        elif "useTranslation(" in line and "keyPrefix" not in line:
            cur_prefixes = []
        for tm in t_call_re.finditer(line):
            key = tm.group(1)
            if "${" in key:
                base = key.split("${", 1)[0].rstrip(".")
                if base:
                    results.append(("DYN", base, tuple(cur_prefixes), rel))
                continue
            top = key.split(".")[0]
            if cur_prefixes and top not in en_tops:
                for p in cur_prefixes:
                    results.append(("KEY", f"{p}.{key}", rel))
            else:
                results.append(("KEY", key, rel))
    return results


all_used = []
for f in files:
    rel = str(f.relative_to(src))
    all_used.extend(keys_for_file(f.read_text(encoding="utf-8", errors="ignore"), rel))

abs_keys = sorted({k for kind, k, *_ in [(a[0], a[1], a[-1]) for a in all_used] if kind == "KEY"})
# normalize tuple unpacking
abs_keys = sorted({a[1] for a in all_used if a[0] == "KEY"})
dyn_prefixes = sorted({(a[1], a[2]) for a in all_used if a[0] == "DYN"})

lines = []
lines.append("=== Exact keys used missing from locales ===")
for lang, keys in flat.items():
    missing = []
    for k in abs_keys:
        if k in keys:
            continue
        if any(x.startswith(k + ".") for x in keys):
            continue
        missing.append(k)
    if missing:
        lines.append(f"\n[{lang}] missing {len(missing)}:")
        for k in missing:
            locs = sorted({a[-1] for a in all_used if a[0] == "KEY" and a[1] == k})
            lines.append(f"  - {k}  @ {', '.join(locs[:4])}")

lines.append("\n=== Dynamic key prefixes (manual check) ===")
for base, prefs in dyn_prefixes:
    pref = ",".join(prefs) if prefs else "(absolute)"
    lines.append(f"  {base}.*  prefix={pref}")

lines.append("\n=== field_menu completeness vs en-US ===")
en_fm = {k for k in en if k.startswith("field_menu.")}
for lang, keys in flat.items():
    miss = sorted(en_fm - keys)
    lines.append(f"{lang}: missing_vs_en={len(miss)}")
    for k in miss:
        lines.append(f"  MISSING {k}")

lines.append("\n=== Hardcoded English labels (possible missing i18n) ===")
hard_re = re.compile(r"label:\s*['\"]([A-Z][^'\"]+)['\"]")
for f in files:
    text = f.read_text(encoding="utf-8", errors="ignore")
    for m in hard_re.finditer(text):
        lines.append(f"  {f.relative_to(src)}: {m.group(1)}")

Path("i18n-audit.txt").write_text("\n".join(lines), encoding="utf-8")
print(f"wrote i18n-audit.txt used={len(abs_keys)} dyn={len(dyn_prefixes)}")
