#!/usr/bin/env bash
# Récupère les fichiers nécessaires du dépôt Microsoft Rocketbox (licence MIT) sans tout télécharger.
# Usage : RB=/chemin/clone bash tools/rocketbox/fetch.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
RB=${RB:?définir RB}
if [ ! -d "$RB/.git" ]; then git clone --depth 1 --filter=blob:none --no-checkout https://github.com/microsoft/Microsoft-Rocketbox "$RB"; fi
cd "$RB"
LIST=$(cat "$HERE/avatars.txt")
paths=()
for a in $LIST; do
  d=$(git -c gc.auto=0 ls-tree -d --name-only -r HEAD Assets/Avatars | grep -E "/$a\$" | head -1)
  paths+=("$d/Export/$a.fbx" "$d/$a.png")
  while read -r t; do paths+=("$t"); done < <(git -c gc.auto=0 ls-tree -r --name-only HEAD "$d/Textures" | grep -E "_color\.tga$")
done
for an in $(cat "$HERE/animals.txt"); do
  d=Assets/Animals/$an
  paths+=("$d/Export/$an.fbx")
  while read -r t; do paths+=("$t"); done < <(git -c gc.auto=0 ls-tree -r --name-only HEAD "$d/Textures" | grep -E "_color\.tga$")
done
for f in $(cat "$HERE/animations.txt"); do
  p=$(git -c gc.auto=0 ls-tree -r --name-only HEAD Assets/Animations | grep -F "/$f.max.fbx" | head -1)
  [ -n "$p" ] && paths+=("$p") || echo "animation absente : $f"
done
printf '%s\n' "${paths[@]}" > /tmp/rb_paths.txt
git -c gc.auto=0 checkout HEAD --pathspec-from-file=/tmp/rb_paths.txt
echo "fichiers : ${#paths[@]}"
