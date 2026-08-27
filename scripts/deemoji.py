#!/usr/bin/env python3
"""
Replace every emoji left in JSX with a real <Icon> (or a plain character).

Emoji were used as button glyphs all over the app. They render in a different
font on every OS, ignore the theme colours, cannot be sized reliably and look
like clip-art next to the rest of the UI. This sweeps the ones that survived
the manual pass, adding the icons import where a file needs it.
"""
import os, re, sys

# emoji -> replacement JSX (or a literal string for pure typography)
MAP = {
    '📖': '<Icon n="book" size={20} />',
    '📕': '<Icon n="books" size={20} />',
    '📗': '<Icon n="books" size={20} />',
    '📚': '<Icon n="books" size={20} />',
    '📄': '<Icon n="doc" size={18} />',
    '📋': '<Icon n="list" size={18} />',
    '📨': '<Icon n="mail" size={18} />',
    '📧': '<Icon n="mail" size={18} />',
    '✉️': '<Icon n="mail" size={18} />',
    '📸': '<Icon n="camera" size={17} />',
    '✍️': '<Icon n="pen" size={17} />',
    '🏆': '<Icon n="badge" size={18} />',
    '🎓': '<Icon n="cap" size={18} />',
    '💊': '<Icon n="pill" size={18} />',
    '🌾': '<Icon n="wheat" size={18} />',
    '🚌': '<Icon n="bus" size={17} />',
    '🚇': '<Icon n="metro" size={17} />',
    '🚈': '<Icon n="metro" size={17} />',
    '🚆': '<Icon n="train" size={17} />',
    '🚉': '<Icon n="train" size={17} />',
    '📍': '<Icon n="pin" size={17} />',
    '🧭': '<Icon n="compass" size={17} />',
    '🗺️': '<Icon n="globe" size={17} />',
    '🧳': '<Icon n="luggage" size={17} />',
    '🔴': '<Icon n="signal" size={17} />',
    '🎬': '<Icon n="film" size={18} />',
    '🎼': '<Icon n="disc" size={18} />',
    '🎞️': '<Icon n="film" size={18} />',
    '🖼️': '<Icon n="image" size={18} />',
    '💾': '<Icon n="save" size={18} />',
    '🔀': '<Icon n="swap" size={18} />',
    '⬇️': '<Icon n="download" size={16} />',
    '⬇': '<Icon n="download" size={16} />',
    '🔄': '<Icon n="refresh" size={15} />',
    '❄️': '<Icon n="drop" size={15} />',
    '⚠️': '<Icon n="warn" size={16} />',
    '✅': '<Icon n="check" size={16} />',
    '❌': '<Icon n="x" size={16} />',
    '🔍': '<Icon n="search" size={16} />',
    '⚙️': '<Icon n="cog" size={17} />',
    '📶': '<Icon n="signal" size={17} />',
    '🌤️': '<Icon n="sun" size={17} />',
    '🕐': '<Icon n="clock" size={17} />',
    '💱': '<Icon n="swap" size={17} />',
    '🎵': '<Icon n="music" size={17} />',
    '📻': '<Icon n="radio" size={17} />',
    '💿': '<Icon n="disc" size={17} />',
    '🎉': '<Icon n="sparkle" size={17} />',
    '🏦': '<Icon n="bank" size={17} />',
    '📮': '<Icon n="mail" size={17} />',
    '🕌': '<Icon n="mosque" size={17} />',
    '🛰️': '<Icon n="satellite" size={17} />',
    '🌍': '<Icon n="earth" size={17} />',
    '🌐': '<Icon n="globe" size={17} />',
}
# typographic characters that are fine as text but nicer as icons in buttons
TEXT = {'⏮': '‹‹', '⏭': '››', '❚❚': '॥'}

EMOJI_RE = re.compile(
    '[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u2190-\u21FF\u2B05-\u2B07]')

def main(check_only=False):
    root = os.path.join(os.path.dirname(__file__), '..', 'src')
    changed, leftover = [], {}
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(('.jsx', '.js')):
                continue
            p = os.path.join(dirpath, f)
            src = open(p, encoding='utf-8').read()
            orig = src

            # only touch JSX text, never comments — split off block comments
            parts = re.split(r'(/\*[\s\S]*?\*/|//[^\n]*)', src)
            for i in range(0, len(parts), 2):          # even = real code
                for e, rep in MAP.items():
                    if e in parts[i]:
                        parts[i] = parts[i].replace(e, rep)
                for e, rep in TEXT.items():
                    if e in parts[i]:
                        parts[i] = parts[i].replace(e, rep)
            src = ''.join(parts)

            if src != orig:
                if 'from \'../ui/icons\'' not in src and 'from "./icons"' not in src \
                        and '<Icon' in src:
                    # add the import after the last existing import line
                    lines = src.split('\n')
                    last = max(i for i, l in enumerate(lines) if l.startswith('import '))
                    rel = '../ui/icons' if '/tools/' in p or '/core/' in p else './icons'
                    lines.insert(last + 1, f"import {{ Icon }} from '{rel}';")
                    src = '\n'.join(lines)
                if not check_only:
                    open(p, 'w', encoding='utf-8').write(src)
                changed.append(os.path.relpath(p, root))

            # report anything still left, ignoring comments
            code = ''.join(re.split(r'(/\*[\s\S]*?\*/|//[^\n]*)', src)[::2])
            found = sorted(set(EMOJI_RE.findall(code)))
            if found:
                leftover[os.path.relpath(p, root)] = found

    print(f"rewrote {len(changed)} file(s): {', '.join(changed) or '—'}")
    if leftover:
        print("\nstill contains emoji (check by hand):")
        for f, e in leftover.items():
            print(f"  {f}: {' '.join(e)}")
    else:
        print("no emoji left in any JSX/JS source")
    return 1 if leftover else 0

sys.exit(main('--check' in sys.argv))
