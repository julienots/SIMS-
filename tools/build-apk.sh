#!/usr/bin/env bash
# Compile l'APK Android de MYLIFE UNIVERSE sans Android Studio ni Gradle.
# Outils : aapt, dalvik-exchange (dx), zipalign, apksigner (paquets Ubuntu), javac, android.jar (API 33).
# Usage : bash tools/build-apk.sh   → release/MyLifeUniverse.apk
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT=$(pwd)
AND="$ROOT/android"
OUT="$AND/build"
SDK_JAR="${ANDROID_JAR:-$AND/sdk/android-33.jar}"
KEYSTORE="$AND/keystore/mylife-release.keystore"
KS_PASS="${KS_PASS:-superessence}"
APK="$ROOT/release/MyLifeUniverse.apk"

need() { command -v "$1" >/dev/null || { echo "Outil manquant : $1 (sudo apt-get install aapt apksigner zipalign dalvik-exchange)"; exit 1; }; }
need aapt; need javac; need zipalign; need apksigner; need dalvik-exchange; need keytool

if [ ! -f "$SDK_JAR" ]; then
  echo "▶ Téléchargement de android.jar (API 33)…"
  mkdir -p "$(dirname "$SDK_JAR")"
  curl -fsSL -o "$SDK_JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-33/android.jar
fi

echo "▶ Construction de la version web…"
node tools/build-web.mjs

echo "▶ Préparation des dossiers…"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/obj" "$OUT/assets" "$OUT/dex" "$ROOT/release"
cp -r "$ROOT/dist/web" "$OUT/assets/web"

echo "▶ Ressources (aapt)…"
aapt package -f -m \
  -J "$OUT/gen" \
  -M "$AND/AndroidManifest.xml" \
  -S "$AND/res" \
  -A "$OUT/assets" \
  -I "$SDK_JAR" \
  -0 glb -0 woff2 -0 png \
  -F "$OUT/base.apk"

echo "▶ Compilation Java…"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$SDK_JAR" -classpath "$SDK_JAR" \
  -d "$OUT/obj" \
  $(find "$AND/src" -name '*.java') $(find "$OUT/gen" -name '*.java')

echo "▶ Conversion Dalvik (dx)…"
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/dex/classes.dex" "$OUT/obj"

echo "▶ Assemblage…"
( cd "$OUT/dex" && aapt add "$OUT/base.apk" classes.dex >/dev/null )
zipalign -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "▶ Création de la clé de signature…"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -noprompt -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias superessence -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=SUPERESSENCE STUDIO, OU=MYLIFE UNIVERSE, O=SUPERESSENCE, C=FR"
fi

echo "▶ Signature (v1 + v2 + v3)…"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias superessence \
  --min-sdk-version 24 --out "$APK" "$OUT/aligned.apk"
apksigner verify --verbose "$APK" | head -5
aapt dump badging "$APK" | head -4
ls -lh "$APK"
echo "✅ APK prêt : $APK"
