#!/usr/bin/env bash
# The comic panel detector: a YOLO model from Hugging Face (panels and text) converted to Core ML with its
# non-maximum suppression, compiled for the app to bundle — scripts/make-app.sh copies
# build/PanelDetector/PanelDetector.mlmodelc (and .json, its names and origin) into the app's Resources.
# macOS only (Xcode's coremlcompiler); Python 3.10–3.12 with pip.
#   PANEL_MODEL_REPO=owner/name scripts/panel-detector.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# What happened, as workflow annotations too: the run's log is long, its annotations are short.
note() { echo "::notice title=panel detector::$*"; echo "$*"; }
warn() { echo "::warning title=panel detector::$*"; echo "$*" >&2; }
trap 'warn "failed at line $LINENO: $BASH_COMMAND (exit $?)"' ERR

REPO="${PANEL_MODEL_REPO:-Oliverdsfdsf/comic-panels-text-detect}"
IMGSZ="${PANEL_MODEL_IMGSZ:-1280}"
OUT="build/PanelDetector"
WORK="build/panel-detector"
PYTHON="${PYTHON:-python3}"

if [ -d "$OUT/PanelDetector.mlmodelc" ] && [ -f "$OUT/PanelDetector.json" ]; then
  echo "panel detector already built: $(cat "$OUT/PanelDetector.json")"
  exit 0
fi
mkdir -p "$OUT" "$WORK"

echo "== model card of $REPO"
if ! curl -fsSL "https://huggingface.co/api/models/$REPO" -o "$WORK/card.json"; then
  warn "the model card of $REPO could not be fetched from huggingface.co"
  exit 1
fi
WEIGHTS=$("$PYTHON" - "$WORK/card.json" "$WORK/meta.json" <<'PY'
import json, sys
card = json.load(open(sys.argv[1]))
files = [s["rfilename"] for s in card.get("siblings", [])]
data = card.get("cardData") or {}
meta = {"repo": card.get("id"), "sha": card.get("sha"), "license": data.get("license"), "tags": card.get("tags"), "files": files, "gated": card.get("gated"), "private": card.get("private")}
json.dump(meta, open(sys.argv[2], "w"))
print(json.dumps(meta, indent=1), file=sys.stderr)
weights = [f for f in files if f.endswith(".pt") or f.endswith(".safetensors")]
weights.sort(key=lambda f: (not f.endswith(".pt"), not f.endswith("best.pt"), f.count("/"), f))
print(weights[0] if weights else "")
PY
)
note "model card: $("$PYTHON" -c 'import json,sys; m=json.load(open(sys.argv[1])); print("license", m.get("license"), "| gated", m.get("gated"), "| tags", m.get("tags"), "| files", m.get("files"))' "$WORK/meta.json")"
if [ -z "$WEIGHTS" ]; then
  warn "no PyTorch (.pt or .safetensors) weights in $REPO; nothing to convert"
  exit 1
fi
note "weights: $WEIGHTS"
echo "== weights: $WEIGHTS"
WEIGHTS_FILE="$WORK/weights.${WEIGHTS##*.}"
curl -fsSL "https://huggingface.co/$REPO/resolve/main/$WEIGHTS" -o "$WEIGHTS_FILE"
ls -la "$WEIGHTS_FILE"
curl -fsSL "https://huggingface.co/$REPO/resolve/main/README.md" -o "$WORK/README.md" || true
if [ -s "$WORK/README.md" ]; then note "model card text: $(tr -s '[:space:]' ' ' < "$WORK/README.md" | cut -c1-1500)"; fi

echo "== converting with Ultralytics and coremltools"
if [ ! -x "$WORK/venv/bin/python" ]; then "$PYTHON" -m venv "$WORK/venv"; fi
# shellcheck disable=SC1091
source "$WORK/venv/bin/activate"
pip install -q --upgrade pip
pip install -q "ultralytics>=8.3" "coremltools>=8.0" safetensors
python scripts/panel-detector-export.py "$WEIGHTS_FILE" "$WORK/meta.json" "$OUT/PanelDetector.json" "$WORK/mlpackage.txt" "$IMGSZ" "$WORK/README.md"
MLPACKAGE=$(cat "$WORK/mlpackage.txt")
test -d "$MLPACKAGE" || test -f "$MLPACKAGE"

echo "== compiling for the app"
rm -rf "$WORK/compiled" "$OUT/PanelDetector.mlmodelc"
mkdir -p "$WORK/compiled"
xcrun coremlcompiler compile "$MLPACKAGE" "$WORK/compiled"
COMPILED=$(find "$WORK/compiled" -maxdepth 1 -name '*.mlmodelc' | head -1)
test -n "$COMPILED"
mv "$COMPILED" "$OUT/PanelDetector.mlmodelc"
du -sh "$OUT/PanelDetector.mlmodelc"
note "built PanelDetector.mlmodelc ($(du -sh "$OUT/PanelDetector.mlmodelc" | cut -f1)): $(tr -d '\n' < "$OUT/PanelDetector.json" | tr -s ' ')"
echo "built $OUT/PanelDetector.mlmodelc"
