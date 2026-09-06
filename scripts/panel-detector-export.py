"""Rebuilds an Ultralytics YOLO model from Hugging Face weights and exports it to Core ML.

Weights come as a .pt (a pickled model) or as .safetensors (tensors only). For tensors only, the architecture is
found by trying the YOLO families and scales — detection or segmentation heads, fused or with batch norm — for one
whose parameters have exactly these names and shapes, the model card's own naming first; the number of classes is
read off the detection head. End-to-end (NMS-free) families export as they are; older ones with Apple's NMS pipeline.

    python panel-detector-export.py WEIGHTS META_JSON OUT_JSON OUT_PATH_FILE IMGSZ [README]
"""
import json
import re
import sys
import traceback

weights, meta_path, out_json, out_path, imgsz = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
readme = sys.argv[6] if len(sys.argv) > 6 else None
readme_text = ""
if readme:
    try:
        readme_text = open(readme, encoding="utf-8", errors="replace").read()
    except OSError:
        readme_text = ""


def note(message):
    text = str(message).replace("\n", " ")
    print(f"::notice title=panel detector::{text[:1800]}")
    print(text)


def names_from_readme(count):
    """Class names when the model card lists them ('0: panel', 'names: [panel, text]', '- `Panel`: …')."""
    found = {}
    for m in re.finditer(r"^\s*[-*]?\s*(\d+)\s*[:=.)-]\s*[`'\"]?([A-Za-z][\w -]{0,30})", readme_text, re.M):
        index, name = int(m.group(1)), m.group(2).strip().lower()
        if index < count and index not in found and name not in ("", "class", "classes"):
            found[index] = name
    if len(found) == count:
        return found
    m = re.search(r"names\s*[:=]\s*\[([^\]]+)\]", readme_text)
    if m:
        items = [s.strip(" '\"`") for s in m.group(1).split(",")]
        if len(items) == count:
            return {i: items[i].lower() for i in range(count)}
    listed = re.findall(r"^\s*[-*]\s*`([A-Za-z][\w ]{0,30})`\s*:", readme_text, re.M)
    if len(listed) == count:
        return {i: listed[i].lower() for i in range(count)}
    return None


def default_names(count):
    # As the model's author uses the classes in ebookcc: 0 panels, 1 text.
    base = {0: "panel", 1: "text"}
    return {i: base.get(i, f"class{i}") for i in range(count)}


def load_pt(path):
    from ultralytics import YOLO
    return YOLO(path)


def load_safetensors(path):
    import torch  # noqa: F401
    from safetensors import safe_open
    from safetensors.torch import load_file
    from ultralytics import YOLO
    from ultralytics.nn.tasks import DetectionModel, SegmentationModel
    from ultralytics.utils import DEFAULT_CFG_DICT

    with safe_open(path, framework="pt") as f:
        metadata = f.metadata() or {}
    tensors = load_file(path)
    keys = sorted(tensors)
    note(f"safetensors: {len(keys)} tensors, metadata {json.dumps(metadata)[:600]}, first keys {keys[:6]}")

    def strip(prefix):
        return {k[len(prefix):]: v for k, v in tensors.items() if k.startswith(prefix)}
    sd = None
    for prefix in ("", "model.", "model.model.", "module.", "ema."):
        candidate = strip(prefix)
        if candidate and all(re.match(r"model\.\d+\.", k) for k in candidate):
            sd = candidate
            break
    if sd is None:
        raise SystemExit(f"the tensors' names are not those of an Ultralytics model (first: {keys[:4]})")
    fused = not any(".bn." in k for k in sd)
    head = max(int(re.match(r"model\.(\d+)\.", k).group(1)) for k in sd)
    segment = any(re.match(rf"model\.{head}\.proto\.", k) for k in sd)
    nc = None
    for branch in ("cv3", "one2one_cv3"):
        for k, v in sd.items():
            if re.match(rf"model\.{head}\.{branch}\.0\.\d+\.weight$", k) and v.ndim == 4 and v.shape[2] == 1 and v.shape[3] == 1:
                nc = int(v.shape[0])
        if nc is not None:
            break
    stem = sd.get("model.0.conv.weight")
    note(f"weights: {'segmentation' if segment else 'detection'} head at layer {head}, {'fused' if fused else 'with batch norm'}, {nc} classes, stem {tuple(stem.shape) if stem is not None else None}")
    if nc is None:
        raise SystemExit("could not read the number of classes off the detection head")

    # Candidates: what the model card names first, then every family and scale.
    scales = {"yolo26": "nsmlx", "yolo11": "nsmlx", "yolov8": "nsmlx", "yolo12": "nsmlx", "yolov9": "tsmce", "yolov10": "nsmblx", "yolov5": "nsmlx", "yolov6": "nsmlx", "yolov3": ""}
    suffix = "-seg" if segment else ""
    candidates = []
    for m in re.finditer(r"YOLO\s*(v?\d+)\s*-?\s*([nsmlxtcbe])?(?:-?(seg|pose|obb))?", readme_text, re.I):
        family = "yolo" + m.group(1).lower()
        scale = (m.group(2) or "").lower()
        if family in scales and (scale in scales[family] or not scale):
            candidates.append(f"{family}{scale}{suffix}.yaml")
    for family, letters in scales.items():
        for scale in (letters or [""]):
            candidates.append(f"{family}{scale}{suffix}.yaml")
    seen = set()
    candidates = [c for c in candidates if not (c in seen or seen.add(c))]
    Model = SegmentationModel if segment else DetectionModel
    matched = None
    tried = []
    for cfg in candidates:
        try:
            net = Model(cfg, nc=nc, verbose=False)
        except Exception as error:  # a family this Ultralytics does not know
            tried.append(f"{cfg}: {type(error).__name__}")
            continue
        if fused:
            net.fuse(verbose=False)
        own = net.state_dict()
        extra = set(sd) - set(own)
        if extra:
            tried.append(f"{cfg}: {len(extra)} unknown names ({sorted(extra)[0]})")
            continue
        missing = {k for k in set(own) - set(sd) if not k.endswith("num_batches_tracked")}
        if missing:
            tried.append(f"{cfg}: {len(missing)} missing ({sorted(missing)[0]})")
            continue
        bad = [k for k in sd if tuple(own[k].shape) != tuple(sd[k].shape)]
        if bad:
            tried.append(f"{cfg}: {len(bad)} shapes differ ({bad[0]}: {tuple(own[bad[0]].shape)} vs {tuple(sd[bad[0]].shape)})")
            continue
        matched = (cfg, net)
        break
    if not matched:
        note("no YOLO architecture has these parameters; tried " + "; ".join(tried)[:1500])
        raise SystemExit(1)
    cfg, net = matched
    net.load_state_dict(sd, strict=False)
    names = names_from_readme(nc) or default_names(nc)
    net.names = names
    net.nc = nc
    # A family built for NMS-free inference (the yaml says so) runs its one-to-one head.
    if net.yaml.get("end2end") and hasattr(net.model[-1], "one2one_cv2"):
        net.end2end = True
    note(f"architecture: {cfg}, classes {names}, end-to-end {bool(getattr(net, 'end2end', False))}")
    # Into the wrapper the way it builds a model from a yaml itself: full default args, the task.
    model = YOLO(cfg, task="segment" if segment else "detect")
    model.model = net
    model.model.args = {**DEFAULT_CFG_DICT, **model.overrides}
    model.model.task = model.task
    return model


def main():
    model = load_safetensors(weights) if weights.endswith(".safetensors") else load_pt(weights)
    names = {int(k): str(v) for k, v in model.names.items()}
    end2end = bool(getattr(model.model, "end2end", False))
    task = getattr(model, "task", None) or "detect"
    print("classes:", names, "task:", task, "end2end:", end2end)
    # NMS-free models export as they are (top-k boxes, scores, classes, mask coefficients); older detectors get
    # Apple's NMS pipeline so Vision hands back recognised objects. Should the end-to-end graph not convert, the
    # raw one-to-many head is exported instead and the app does the suppression.
    nms = not end2end and task == "detect"
    try:
        exported = model.export(format="coreml", nms=nms, imgsz=imgsz, half=True)
    except Exception:
        text = traceback.format_exc()
        print(text)
        note("end-to-end export failed: " + text.strip().split("\n")[-1][:600] + " | " + text[-900:])
        if not end2end:
            raise
        model.model.end2end = False
        end2end = False
        try:
            exported = model.export(format="coreml", nms=False, imgsz=imgsz, half=True)
        except Exception:
            text = traceback.format_exc()
            print(text)
            note("raw export failed too: " + text.strip().split("\n")[-1][:600] + " | " + text[-900:])
            raise
    print("exported:", exported)
    meta = json.load(open(meta_path))
    meta.update({"names": names, "imgsz": imgsz, "task": task, "end2end": end2end, "nms": nms, "weights": weights.rsplit("/", 1)[-1]})
    json.dump(meta, open(out_json, "w"), indent=1)
    open(out_path, "w").write(str(exported))


main()
