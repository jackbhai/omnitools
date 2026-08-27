#!/usr/bin/env python3
"""
Remove every trace of the upstream vendor's name from the app.

A user must not be able to tell where the data comes from. That means:
  · no provider label like "AHM7 MangaSter" — these show in the "via …" line
    under a result AND in the system-status panel
  · no "via AHM7 …" sentences anywhere in the UI
  · no category called AHM7
  · no host string inside a component: base URLs live in core/endpoints.js,
    which assembles the host from fragments so it is not greppable in the
    shipped bundle either
  · no mention in comments, so reading the source in devtools reveals nothing

IMPORTANT: this only rewrites identifiers, UI strings and prose. It never
touches a URL literal — an earlier version did and turned
'https://host/api/' into 'https://the upstream host/api/', breaking every
request. URL literals are removed by hand, by importing from endpoints.js.

Run with --check to fail (exit 1) if anything creeps back in.
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ALLOWED = {'src/core/endpoints.js', 'scripts/debrand.py'}

# provider id + label: the label is user-visible, the id shows in system status
LABELS = {
    "id: 'ahm7-manga', label: 'AHM7 MangaSter'":  "id: 'manga-lib', label: 'Manga library'",
    "id: 'ahm7-ch', label: 'AHM7 chapters'":      "id: 'manga-ch', label: 'Chapter index'",
    "id: 'ahm7-pg', label: 'AHM7 pages'":         "id: 'manga-pg', label: 'Page reader'",
    "id: 'ahm7-novel', label: 'AHM7 NovelSter'":  "id: 'novel-lib', label: 'Novel library'",
    "id: 'ahm7-nch', label: 'AHM7 chapters'":     "id: 'novel-ch', label: 'Chapter index'",
    "id: 'ahm7-read', label: 'AHM7 reader'":      "id: 'novel-read', label: 'Chapter reader'",
    "id: 'ahm7-med', label: 'AHM7 MEDSTER'":      "id: 'med-price', label: 'Medicine price index'",
    "id: 'ahm7-courses', label: 'AHM7 Courses'":  "id: 'course-cat', label: 'Course catalogue'",
    "id: 'ahm7-telenor', label: 'AHM7 Telenor'":  "id: 'quiz-feed', label: 'Quiz feed'",
    "id: 'ahm7-cert', label: 'AHM7 CertSter'":    "id: 'cert-lib', label: 'Certificate templates'",
    "id: 'ahm7-cine', label: 'AHM7 CineSearch'":  "id: 'cine-idx', label: 'Film index'",
}

# user-visible sentences
TEXT = {
    "<span>via AHM7 Wikster — opens a real PDF</span>":
        "<span>Opens a real, printable PDF</span>",
    "<span>via AHM7 WebSnap</span>":
        "<span>Full-page capture of any public site</span>",
    "<span>Generation needs a POST request — browse templates here, generate via the AHM7 site.</span>":
        "<span>Browse the available templates here.</span>",
    "| Movies/TV | AHM7 CineSearch → TVmaze |":
        "| Movies/TV | Film index → TVmaze |",
    "via: got ? 'AHM7 + Piped' : 'Piped'": "via: got ? 'direct + index' : 'index'",
    "via: 'AHM7'": "via: 'resolver'",
}

# identifiers (safe: word-boundary, never inside a URL literal)
IDENTS = {
    r'\bahm7Json\b': 'resolveJson',
    r'\bAHM7_BASE\b': 'MEDIA_API',
}

# prose inside comments only
COMMENTS = [
    (r'\bAHM7 /api/alldl\b', 'The media resolver'),
    (r'\bAHM7 /api/search\b', 'the price index'),
    (r'\bAHM7 alldl\b', 'the resolver'),
    (r'\bAHM7 tool suite\b', 'Utility tool suite'),
    (r'\bthe AHM7 site\b', 'the upstream site'),
    (r'\bAHM7 endpoints?\b', 'upstream endpoints'),
    (r'\bAHM7\b', 'the resolver'),
    (r'ahm7xmakki\.com', 'the upstream host'),
    (r'ahm7\.tech', 'an upstream promo line'),
    (r'\bahm7\b', 'upstream'),
]

def parts_of(src):
    """Alternating [code, comment, code, comment, …]."""
    return re.split(r'(/\*[\s\S]*?\*/|//[^\n]*|\{/\*[\s\S]*?\*/\})', src)

def process(path, check):
    src = open(path, encoding='utf-8').read()
    orig = src

    for a, b in {**LABELS, **TEXT}.items():
        src = src.replace(a, b)

    chunks = parts_of(src)
    for i in range(len(chunks)):
        if i % 2 == 1:                      # comment: rewrite the prose
            for pat, rep in COMMENTS:
                chunks[i] = re.sub(pat, rep, chunks[i], flags=re.I)
        else:                               # code: identifiers only
            for pat, rep in IDENTS.items():
                chunks[i] = re.sub(pat, rep, chunks[i])
    src = ''.join(chunks)

    if src != orig and not check:
        open(path, 'w', encoding='utf-8').write(src)
    return src != orig, src

def main():
    check = '--check' in sys.argv
    targets = []
    for base in ('src', 'scripts'):
        for dp, _, fs in os.walk(os.path.join(ROOT, base)):
            for f in fs:
                if f.endswith(('.jsx', '.js', '.mjs')):
                    targets.append(os.path.join(dp, f))
    for f in ('README.md', 'TARGET.md', 'index.html'):
        p = os.path.join(ROOT, f)
        if os.path.exists(p): targets.append(p)

    changed, offenders = [], {}
    for p in targets:
        did, src = process(p, check)
        rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
        if did: changed.append(rel)
        if rel in ALLOWED: continue
        hits = sorted(set(re.findall(r'(?i)ahm7[a-z0-9.]*', src)))
        if hits: offenders[rel] = hits

    print(f"rewrote {len(changed)} file(s)" + (f": {', '.join(changed)}" if changed else ""))
    if offenders:
        print("\nvendor name still present:")
        for f, h in offenders.items():
            print(f"  {f}: {' '.join(h)}")
        return 1
    print("clean: vendor name appears nowhere outside core/endpoints.js")
    return 0

sys.exit(main())
