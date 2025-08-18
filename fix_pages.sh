#!/usr/bin/env bash
set -euo pipefail

# === CONFIG ===
REPO_SLUG="wwe_2001_sim"   # set to your repo name
PAGES_BRANCH="public"      # the branch you will deploy from
# ==============

echo "== GitHub Pages auto-fix for $REPO_SLUG =="

# Ensure repo root
[[ -f index.html || -d public ]] || { echo "Run this in repo root (index.html or public/ missing)."; exit 1; }

# Move out of /public if needed
if [[ -d public ]]; then
  echo "-- Moving files from /public to repo root"
  rsync -av --remove-source-files public/ ./
  find public -type d -empty -delete
fi

# .nojekyll
[[ -f .nojekyll ]] || { touch .nojekyll; echo "-- Created .nojekyll"; }

# 404.html fallback
[[ -f 404.html ]] || { cp index.html 404.html; echo "-- Created 404.html"; }

# Add or update <base> in all html
echo "-- Injecting/updating <base href=\"/${REPO_SLUG}/\"> in HTML"
while IFS= read -r -d '' f; do
  if grep -qi '<base ' "$f"; then
    sed -i -E "s|<base[^>]*href=[\"'][^\"']*[\"']|<base href=\"/${REPO_SLUG}/\"|I" "$f"
  else
    sed -i -E "0,/<head[^>]*>/ s|(<head[^>]*>)|\1\n  <base href=\"/${REPO_SLUG}/\">|" "$f"
  fi
  # Remove leading slashes in asset paths
  sed -i -E 's|(src=)"/|\1"|g; s|(href=)"/|\1"|g; s|(img[[:space:]]+src=)"/|\1"|g' "$f"
done < <(find . -maxdepth 2 -type f -name "*.html" -print0)

# Warn about absolute imports
echo "=== Scanning for absolute ESM imports (must fix manually) ==="
grep -Rni --include="*.js" "from '/" js || echo "OK: none found."

# Warn about missing .js extensions
echo "=== Scanning for imports missing .js extension ==="
grep -Rni --include="*.js" -E "import .* from ['\"][^\"']+['\"]\s*;?$" js | grep -vE "\.js['\"]\s*;?$" || echo "OK: all imports have .js."

# Git commit
BR="pages-fix-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BR"
git add .
git commit -m "Automated GitHub Pages fixes for $REPO_SLUG"

echo
echo "== DONE =="
echo "Created branch $BR with fixes."
echo "Next:"
echo "  git push -u origin $BR"
echo "  Open a PR → merge into $PAGES_BRANCH"
echo "  Ensure Settings → Pages points to branch '$PAGES_BRANCH' at '/'"
echo
echo "Check console for warnings above. Fix imports if listed!"

