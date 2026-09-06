#!/usr/bin/env bash
# The comic panel detector: a YOLO model from Hugging Face (panels and text) converted to Core ML with its
# non-maximum suppression, compiled for the app to bundle — scripts/make-app.sh copies
# build/PanelDetector/PanelDetector.mlmodelc (and .json, its names and origin) into the app's Resources.
# macOS only (Xcode's coremlcompiler); Python 3.10–3.12 with pip.
#   PANEL_MODEL_REPO=owner/name scripts/panel-detector.sh
set -euo pipefail
cd "$(dirname "$0")/.."

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
curl -fsSL "https://huggingface.co/api/models/$REPO" -o "$WORK/card.json"
WEIGHTS=$("$PYTHON" - "$WORK/card.json" "$WORK/meta.json" <<'PY'
import json, sys
card = json.load(open(sys.argv[1]))
files = [s["rfilename"] for s in card.get("siblings", [])]
data = card.get("cardData") or {}
meta = {"repo": card.get("id"), "sha": card.get("sha"), "license": data.get("license"), "tags": card.get("tags"), "files": files}
json.dump(meta, open(sys.argv[2], "w"))
print(json.dumps(meta, indent=1), file=sys.stderr)
weights = [f for f in files if f.endswith(".pt")]
weights.sort(key=lambda f: (not f.endswith("best.pt"), f.count("/"), f))
print(weights[0] if weights else "")
PY
)
if [ -z "$WEIGHTS" ]; then
  echo "no PyTorch (.pt) weights in $REPO; nothing to convert" >&2
  exit 1
fi
echo "== weights: $WEIGHTS"
curl -fsSL "https://huggingface.co/$REPO/resolve/main/$WEIGHTS" -o "$WORK/weights.pt"
ls -la "$WORK/weights.pt"

echo "== converting with Ultralytics and coremltools"
if [ ! -x "$WORK/venv/bin/python" ]; then "$PYTHON" -m venv "$WORK/venv"; fi
# shellcheck disable=SC1091
source "$WORK/venv/bin/activate"
pip install -q --upgrade pip
pip install -q "ultralytics>=8.3" "coremltools>=8.0"
python - "$WORK/weights.pt" "$WORK/meta.json" "$OUT/PanelDetector.json" "$WORK/mlpackage.txt" "$IMGSZ" <<'PY'
import json, sys
from ultralytics import YOLO
weights, meta_path, out_json, out_path, imgsz = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
model = YOLO(weights)
names = {int(k): str(v) for k, v in model.names.items()}
print("classes:", names)
exported = model.export(format="coreml", nms=True, imgsz=imgsz, half=True)
print("exported:", exported)
meta = json.load(open(meta_path))
meta.update({"names": names, "imgsz": imgsz, "task": getattr(model, "task", None)})
json.dump(meta, open(out_json, "w"), indent=1)
open(out_path, "w").write(str(exported))
PY
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
echo "built $OUT/PanelDetector.mlmodelc: $(cat "$OUT/PanelDetector.json")"
