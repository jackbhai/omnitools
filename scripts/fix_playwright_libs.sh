#!/bin/sh
# Headless chromium starts failing with "error while loading shared libraries"
# after a sandbox reset: the versioned .so files under /home/user/.libs survive
# but their SONAME symlinks (what the loader actually asks for) do not.
# This recreates them from whatever full version is present.
# Run before any tests/qa_*.py if the browser dies:  sh scripts/fix_playwright_libs.sh
LIBS=/home/user/.libs/usr/lib/x86_64-linux-gnu
[ -d "$LIBS" ] || { echo "no $LIBS — deps were never staged"; exit 0; }
cd "$LIBS" || exit 0

# link_soname <soname> — find the newest real file whose name starts with it.
link_soname() {
  soname="$1"
  [ -e "$soname" ] && return 0
  target=$(ls -1 ${soname}.* 2>/dev/null | grep -v "^${soname}$" | sort -V | tail -1)
  [ -n "$target" ] && ln -sf "$target" "$soname" && echo "linked $soname -> $target"
}

for soname in libatk-1.0.so.0 libatk-bridge-2.0.so.0 libX11.so.6 libXext.so.6 \
              libXfixes.so.3 libXrandr.so.2 libXcomposite.so.1 libXdamage.so.1 \
              libXcursor.so.1 libXi.so.6 libXtst.so.6 libXkbcommon.so.0 libxkbcommon.so.0 \
              libgbm.so.1 libdrm.so.2 libasound.so.2 libatspi.so.0 libcups.so.2 \
              libcairo.so.2 libpango-1.0.so.0 libpangocairo-1.0.so.0 libgdk_pixbuf-2.0.so.0 \
              libgtk-3.so.0 libnss3.so libnspr4.so libdbus-1.so.3 libatspi2.0.so.0; do
  link_soname "$soname"
done

[ -d /home/user/.cache/ms-playwright ] || echo "note: browsers gone too — run: python3 -m playwright install chromium-headless-shell"
