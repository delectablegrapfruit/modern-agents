"""Rebuilds an Ultralytics YOLO detector from Hugging Face weights and exports it to Core ML with NMS.

Weights come as a .pt (a pickled model) or as .safetensors (tensors only). For tensors only, the architecture is
found by trying the YOLO families and scales whose parameters have exactly these names and shapes — fused or not —
with the number of classes read off the detection head.

    python panel-detector-export.py WEIGHTS META_JSON OUT_JSON OUT_PATH_FILE IMGSZ [README]
"""
import json
import re
import sys

weights, meta_path, out_json, out_path, imgsz = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
readme = sys.argv[6] if len(sys.argv) > 6 else None


def note(message):
    text = str(message).replace("\n", " ")
    print(f"::notice title=panel detector::{text[:1800]}")
    print(text)


def names_from_readme(count):
    """Class names when the model card lists them ('0: panel', '- panel', 'names: [panel, text]')."""
    if not readme:
        return None
    try:
        text = open(readme, encoding="utf-8", errors="replace").read()
    except OSError:
        return None
    found = {}
    for m in re.finditer(r"^\s*[-*]?\s*(\d+)\s*[:=.)-]\s*[`'\"]?([A-Za-z][\w -]{0,30})", text, re.M):
        index, name = int(m.group(1)), m.group(2).strip().lower()
        if index < count and index not in found and name not in ("", "class", "classes"):
            found[index] = name
    if len(found) == count:
        return found
    m = re.search(r"names\s*[:=]\s*\[([^\]]+)\]", text)
    if m:
        items = [s.strip(" '\"`") for s in m.group(1).split(",")]
        if len(items) == count:
            return {i: items[i].lower() for i in range(count)}
    return None


def default_names(count):
    # As the model's author uses the classes in ebookcc: 0 panels, 1 text.
    base = {0: "panel", 1: "text"}
    return {i: base.get(i, f"class{i}") for i in range(count)}


def load_pt(path):
    from ultralytics import YOLO
    return YOLO(path)


def load_safetensors(path):
    import torch
    from safetensors import safe_open
    from safetensors.torch import load_file
    from ultralytics import YOLO
    from ultralytics.nn.tasks import DetectionModel

    with safe_open(path, framework="pt") as f:
        metadata = f.metadata() or {}
    tensors = load_file(path)
    keys = sorted(tensors)
    note(f"safetensors: {len(keys)} tensors, metadata {json.dumps(metadata)[:600]}, first keys {keys[:6]}")

    # Normalise the key prefix to the DetectionModel's own ("model.N....").
    def strip(prefix):
        return {k[len(prefix):]: v for k, v in tensors.items() if k.startswith(prefix)}
    candidates_sd = []
    for prefix in ("", "model.", "model.model.", "module.", "ema."):
        sd = strip(prefix)
        if sd and all(re.match(r"model\.\d+\.", k) for k in sd):
            candidates_sd.append((prefix, sd))
    if not candidates_sd:
        raise SystemExit(f"the tensors' names are not those of an Ultralytics detector (first: {keys[:4]})")
    prefix, sd = candidates_sd[0]
    fused = not any(".bn." in k for k in sd)
    head = max(int(re.match(r"model\.(\d+)\.", k).group(1)) for k in sd)
    nc = None
    for k, v in sd.items():
        if re.match(rf"model\.{head}\.cv3\.0\.(\d+)\.weight$", k) and v.ndim == 4 and v.shape[2] == 1 and v.shape[3] == 1:
            nc = int(v.shape[0])
    if nc is None:
        for k, v in sd.items():
            if re.match(rf"model\.{head}\.cv3\.0\.", k) and k.endswith("weight") and v.ndim == 4:
                nc = int(v.shape[0])
    stem = sd.get("model.0.conv.weight")
    note(f"weights: prefix '{prefix}', {'fused' if fused else 'with batch norm'}, head at layer {head}, {nc} classes, stem {tuple(stem.shape) if stem is not None else None}")
    if nc is None:
        raise SystemExit("could not read the number of classes off the detection head")

    families = ["yolov8", "yolo11", "yolov9", "yolov10", "yolo12", "yolov5", "yolov3", "yolov6"]
    scales = {"yolov8": "nsmlx", "yolo11": "nsmlx", "yolov9": "tsmce", "yolov10": "nsmblx", "yolo12": "nsmlx", "yolov5": "nsmlx", "yolov3": "", "yolov6": "nsmlx"}
    matched = None
    tried = []
    for family in families:
        for scale in (scales[family] or [""]):
            cfg = f"{family}{scale}.yaml"
            try:
                net = DetectionModel(cfg, nc=nc, verbose=False)
            except Exception as error:  # a family this Ultralytics does not know
                tried.append(f"{cfg}: {type(error).__name__}")
                continue
            if fused:
                net.fuse(verbose=False) if "verbose" in net.fuse.__code__.co_varnames else net.fuse()
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
        if matched:
            break
    if not matched:
        raise SystemExit("no YOLO architecture has these parameters; tried " + "; ".join(tried)[:1500])
    cfg, net = matched
    net.load_state_dict(sd, strict=False)
    names = names_from_readme(nc) or default_names(nc)
    net.names = names
    net.nc = nc
    note(f"architecture: {cfg}, classes {names}")
    model = YOLO(cfg, task="detect")
    model.model = net
    model.model.args = model.overrides
    return model


def main():
    if weights.endswith(".safetensors"):
        model = load_safetensors(weights)
    else:
        model = load_pt(weights)
    names = {int(k): str(v) for k, v in model.names.items()}
    print("classes:", names)
    exported = model.export(format="coreml", nms=True, imgsz=imgsz, half=True)
    print("exported:", exported)
    meta = json.load(open(meta_path))
    meta.update({"names": names, "imgsz": imgsz, "task": getattr(model, "task", None), "weights": weights.rsplit("/", 1)[-1]})
    json.dump(meta, open(out_json, "w"), indent=1)
    open(out_path, "w").write(str(exported))


main()
