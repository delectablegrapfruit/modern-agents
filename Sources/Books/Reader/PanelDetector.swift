import AppKit
import CoreML
import CoreVideo
import Vision
import PDFKit

/// A learned detector of comic panels and text — a YOLO model converted to Core ML by the build
/// (scripts/panel-detector.sh) and bundled as PanelDetector.mlmodelc, or one placed by hand in
/// ~/Library/Application Support/Books/Models. It runs on the Mac, on the Neural Engine where there is one; nothing
/// leaves the machine. Its boxes (and, from a segmentation model, its masks) steer the gutter analysis: they say
/// where the panels are and which panel a balloon belongs to, while the analysis keeps supplying exact outlines.
///
/// Two kinds of model are read: an end-to-end YOLO (YOLO26, YOLOv10) whose output is a table of boxes, scores,
/// classes and mask coefficients, with mask prototypes for a segmentation model; and an older detector exported with
/// Apple's NMS pipeline, read through Vision as recognised objects.
final class PanelDetector: @unchecked Sendable {
    struct Detection {
        enum Kind { case panel, text }
        let kind: Kind
        /// In the image's normalised coordinates, origin at the bottom left (as Vision reports).
        let rect: CGRect
        let confidence: Float
        /// The instance's shape from a segmentation model, when it has one.
        let mask: Mask?
    }

    /// A shape sampled over the whole image, normalised coordinates, row 0 at the top.
    struct Mask {
        let width: Int, height: Int
        let bits: [Bool]
        /// Whether the shape covers a point of the image (x, y normalised, y down from the top).
        func covers(x: Double, y: Double) -> Bool {
            let px = min(width - 1, max(0, Int(x * Double(width)))), py = min(height - 1, max(0, Int(y * Double(height))))
            return bits[py * width + px]
        }
    }

    /// The model's origin, for the Appearance popover.
    let name: String
    private let model: MLModel
    private let vision: VNCoreMLModel?
    private let inputName: String
    private let inputSize: (width: Int, height: Int)
    private let names: [Int: String]

    /// The detector the build bundled (or the user installed), loaded once; nil when there is none.
    static let shared: PanelDetector? = load()

    /// Where a model may be: the user's own first, then the build's.
    private static var candidates: [URL] {
        var urls: [URL] = []
        if let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            urls.append(support.appendingPathComponent("Books/Models/PanelDetector.mlmodelc"))
        }
        if let bundled = Bundle.main.url(forResource: "PanelDetector", withExtension: "mlmodelc") { urls.append(bundled) }
        return urls.filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// The name of the model that is there to load, without loading it (for the Appearance popover).
    static var bundledName: String? {
        guard let url = candidates.first else { return nil }
        return meta(beside: url)["repo"] as? String ?? "PanelDetector"
    }

    private static func meta(beside url: URL) -> [String: Any] {
        let file = url.deletingLastPathComponent().appendingPathComponent("PanelDetector.json")
        guard let data = try? Data(contentsOf: file), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return json
    }

    private static func load() -> PanelDetector? {
        let configuration = MLModelConfiguration()
        configuration.computeUnits = .all
        for url in candidates {
            guard let loaded = try? MLModel(contentsOf: url, configuration: configuration) else { continue }
            guard let input = loaded.modelDescription.inputDescriptionsByName.first(where: { $0.value.type == .image }),
                  let constraint = input.value.imageConstraint else { continue }
            let inputName = input.key
            let meta = meta(beside: url)
            var names: [Int: String] = [:]
            if let listed = meta["names"] as? [String: Any] {
                for (key, value) in listed { if let index = Int(key), let name = value as? String { names[index] = name } }
            }
            // A pipeline with Apple's NMS reports recognised objects; anything else is read as a table.
            let recognises = loaded.modelDescription.outputDescriptionsByName.keys.contains("coordinates")
            let vision = recognises ? try? VNCoreMLModel(for: loaded) : nil
            return PanelDetector(model: loaded, vision: vision, inputName: inputName, inputSize: (constraint.pixelsWide, constraint.pixelsHigh), names: names, name: meta["repo"] as? String ?? "PanelDetector")
        }
        return nil
    }

    private init(model: MLModel, vision: VNCoreMLModel?, inputName: String, inputSize: (width: Int, height: Int), names: [Int: String], name: String) {
        self.model = model
        self.vision = vision
        self.inputName = inputName
        self.inputSize = inputSize
        self.names = names
        self.name = name
    }

    /// Whether a class is panels or text, from its name (the model's, or the card's numbering: 0 panels, then text).
    private func kind(ofClass index: Int, label: String? = nil) -> Detection.Kind {
        let name = (label ?? names[index] ?? "").lowercased()
        if name.contains("panel") || name.contains("frame") || name.contains("border") { return .panel }
        if name.contains("text") || name.contains("bubble") || name.contains("balloon") || name.contains("caption") || name.contains("dialog") { return .text }
        return index == 0 ? .panel : .text
    }

    /// The panels and text the model sees in an image.
    func detect(in image: CGImage) -> [Detection] {
        if let vision { return detectRecognised(in: image, with: vision) }
        return detectTable(in: image)
    }

    /// The panels and text on a PDF page, in display space (page points, origin at the bottom left), with masks.
    func detect(page: PDFPage, size: CGSize) -> [Detection] {
        guard size.width > 0, size.height > 0 else { return [] }
        let width = CGFloat(max(inputSize.width, 1280))
        let height = (width * size.height / size.width).rounded()
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return [] }
        return detect(in: cg).map { d in
            Detection(kind: d.kind, rect: CGRect(x: d.rect.minX * size.width, y: d.rect.minY * size.height, width: d.rect.width * size.width, height: d.rect.height * size.height), confidence: d.confidence, mask: d.mask)
        }
    }

    // MARK: - Recognised objects (a detector with Apple's NMS pipeline)

    private func detectRecognised(in image: CGImage, with vision: VNCoreMLModel) -> [Detection] {
        let request = VNCoreMLRequest(model: vision)
        request.imageCropAndScaleOption = .scaleFit
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do { try handler.perform([request]) } catch { return [] }
        let observations = request.results as? [VNRecognizedObjectObservation] ?? []
        return observations.compactMap { observation in
            let label = observation.labels.max { $0.confidence < $1.confidence }
            let index = Int(label?.identifier ?? "") ?? (names.first { $0.value.lowercased() == label?.identifier.lowercased() }?.key ?? 0)
            let rect = observation.boundingBox
            guard rect.width > 0.005, rect.height > 0.005 else { return nil }
            return Detection(kind: kind(ofClass: index, label: label?.identifier), rect: rect, confidence: label?.confidence ?? observation.confidence, mask: nil)
        }
    }

    // MARK: - A table of boxes (an end-to-end model)

    /// The image letterboxed into the model's input: scaled to fit, centred on grey, as the model was trained.
    private func letterbox(_ image: CGImage) -> (buffer: CVPixelBuffer, scale: CGFloat, dx: CGFloat, dy: CGFloat)? {
        let w = inputSize.width, h = inputSize.height
        var buffer: CVPixelBuffer?
        let attributes: [CFString: Any] = [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true]
        guard CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA, attributes as CFDictionary, &buffer) == kCVReturnSuccess, let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer),
              let context = CGContext(data: base, width: w, height: h, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        context.setFillColor(CGColor(red: 114 / 255, green: 114 / 255, blue: 114 / 255, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: w, height: h))
        let scale = min(CGFloat(w) / CGFloat(image.width), CGFloat(h) / CGFloat(image.height))
        let drawn = CGSize(width: (CGFloat(image.width) * scale).rounded(), height: (CGFloat(image.height) * scale).rounded())
        let dx = ((CGFloat(w) - drawn.width) / 2).rounded(), dy = ((CGFloat(h) - drawn.height) / 2).rounded()
        context.interpolationQuality = .high
        // CGContext's origin is at the bottom left; dy measured from the top is the same, the picture being centred.
        context.draw(image, in: CGRect(x: dx, y: dy, width: drawn.width, height: drawn.height))
        return (buffer, scale, dx, dy)
    }

    private func detectTable(in image: CGImage) -> [Detection] {
        guard let box = letterbox(image) else { return [] }
        let provider: MLDictionaryFeatureProvider
        do { provider = try MLDictionaryFeatureProvider(dictionary: [inputName: MLFeatureValue(pixelBuffer: box.buffer)]) } catch { return [] }
        guard let output = try? model.prediction(from: provider) else { return [] }
        var table: MLMultiArray?, protos: MLMultiArray?
        for name in output.featureNames {
            guard let array = output.featureValue(for: name)?.multiArrayValue else { continue }
            let shape = array.shape.map { $0.intValue }
            if shape.count == 3, shape[2] >= 6 || shape[1] >= 6 { table = array }
            if shape.count == 4, shape[1] >= 8, shape[2] >= 16 { protos = array }
        }
        guard let table else { return [] }
        let values = floats(of: table)
        let shape = table.shape.map { $0.intValue }
        // Rows of boxes: (1, N, C); a transposed (1, C, N) table is read the other way.
        var rows = shape[1], columns = shape[2], rowStride = columns, columnStride = 1
        if shape[2] > shape[1] && shape[1] <= 64 { rows = shape[2]; columns = shape[1]; rowStride = 1; columnStride = shape[2] }
        let inputW = CGFloat(inputSize.width), inputH = CGFloat(inputSize.height)
        let imageW = CGFloat(image.width), imageH = CGFloat(image.height)
        var found: [Detection] = []
        let protoValues = protos.map(floats(of:))
        let protoShape = protos?.shape.map { $0.intValue } ?? []
        for r in 0..<rows {
            func at(_ c: Int) -> Float { values[r * rowStride + c * columnStride] }
            let score = at(4)
            guard score >= 0.25 else { continue }
            var x1 = CGFloat(at(0)), y1 = CGFloat(at(1)), x2 = CGFloat(at(2)), y2 = CGFloat(at(3))
            // Normalised outputs (a model exported that way) come in 0…1; pixels otherwise.
            if x2 <= 1.5, y2 <= 1.5 { x1 *= inputW; x2 *= inputW; y1 *= inputH; y2 *= inputH }
            let index = Int(at(5).rounded())
            // Back from the letterbox to the image, normalised, y down from the top.
            let left = max(0, min(1, (x1 - box.dx) / box.scale / imageW)), right = max(0, min(1, (x2 - box.dx) / box.scale / imageW))
            let top = max(0, min(1, (y1 - box.dy) / box.scale / imageH)), bottom = max(0, min(1, (y2 - box.dy) / box.scale / imageH))
            guard right - left > 0.005, bottom - top > 0.005 else { continue }
            let rect = CGRect(x: left, y: 1 - bottom, width: right - left, height: bottom - top)
            let kind = kind(ofClass: index)
            var mask: Mask?
            if kind == .panel, let protoValues, protoShape.count == 4, columns >= 6 + protoShape[1] {
                mask = self.mask(row: r, coefficientsFrom: 6, count: protoShape[1], values: values, rowStride: rowStride, columnStride: columnStride,
                                 protos: protoValues, protoShape: protoShape, box: (x1, y1, x2, y2), letterbox: box, image: (imageW, imageH))
            }
            found.append(Detection(kind: kind, rect: rect, confidence: score, mask: mask))
        }
        return found
    }

    /// The instance's mask from its coefficients and the prototypes: sigmoid of their product, over the box, sampled
    /// on a grid across the image.
    private func mask(row r: Int, coefficientsFrom first: Int, count nm: Int, values: [Float], rowStride: Int, columnStride: Int,
                      protos: [Float], protoShape: [Int], box: (CGFloat, CGFloat, CGFloat, CGFloat), letterbox: (buffer: CVPixelBuffer, scale: CGFloat, dx: CGFloat, dy: CGFloat), image: (CGFloat, CGFloat)) -> Mask? {
        let ph = protoShape[2], pw = protoShape[3]
        guard ph > 0, pw > 0 else { return nil }
        var coefficients = [Float](repeating: 0, count: nm)
        for i in 0..<nm { coefficients[i] = values[r * rowStride + (first + i) * columnStride] }
        // The grid: the image's own proportions, about the prototypes' resolution.
        let inputW = CGFloat(CVPixelBufferGetWidth(letterbox.buffer)), inputH = CGFloat(CVPixelBufferGetHeight(letterbox.buffer))
        let gridW = max(16, Int((image.0 * letterbox.scale / inputW * CGFloat(pw)).rounded())), gridH = max(16, Int((image.1 * letterbox.scale / inputH * CGFloat(ph)).rounded()))
        var bits = [Bool](repeating: false, count: gridW * gridH)
        // Only inside the box: the rest is not this instance.
        let bx0 = max(0, Int(((box.0 - letterbox.dx) / letterbox.scale / image.0 * CGFloat(gridW)).rounded(.down)))
        let bx1 = min(gridW, Int(((box.2 - letterbox.dx) / letterbox.scale / image.0 * CGFloat(gridW)).rounded(.up)))
        let by0 = max(0, Int(((box.1 - letterbox.dy) / letterbox.scale / image.1 * CGFloat(gridH)).rounded(.down)))
        let by1 = min(gridH, Int(((box.3 - letterbox.dy) / letterbox.scale / image.1 * CGFloat(gridH)).rounded(.up)))
        guard bx1 > bx0, by1 > by0 else { return nil }
        let plane = ph * pw
        for gy in by0..<by1 {
            // The grid point in the letterboxed input, then in the prototypes.
            let iy = (CGFloat(gy) + 0.5) / CGFloat(gridH) * image.1 * letterbox.scale + letterbox.dy
            let py = min(ph - 1, max(0, Int(iy / inputH * CGFloat(ph))))
            for gx in bx0..<bx1 {
                let ix = (CGFloat(gx) + 0.5) / CGFloat(gridW) * image.0 * letterbox.scale + letterbox.dx
                let px = min(pw - 1, max(0, Int(ix / inputW * CGFloat(pw))))
                var sum: Float = 0
                let at = py * pw + px
                for i in 0..<nm { sum += coefficients[i] * protos[i * plane + at] }
                bits[gy * gridW + gx] = sum > 0   // sigmoid(sum) > 0.5
            }
        }
        return Mask(width: gridW, height: gridH, bits: bits)
    }

    /// An IEEE half-precision value as a float (kept portable: no Float16 type on every Mac).
    private static func half(_ h: UInt16) -> Float {
        let sign: UInt32 = UInt32(h & 0x8000) << 16
        let exponent = Int((h >> 10) & 0x1F)
        let fraction = UInt32(h & 0x03FF)
        var bits: UInt32
        if exponent == 0 {
            if fraction == 0 {
                bits = sign
            } else {
                // Subnormal: normalise.
                var e = -1
                var f = fraction
                repeat { e += 1; f <<= 1 } while (f & 0x0400) == 0
                bits = sign | UInt32(127 - 15 - e) << 23 | (f & 0x03FF) << 13
            }
        } else if exponent == 31 {
            bits = sign | 0x7F80_0000 | fraction << 13
        } else {
            bits = sign | UInt32(exponent - 15 + 127) << 23 | fraction << 13
        }
        return Float(bitPattern: bits)
    }

    /// A multiarray's values as floats, whatever their storage type.
    private func floats(of array: MLMultiArray) -> [Float] {
        let count = array.count
        var out = [Float](repeating: 0, count: count)
        switch array.dataType {
        case .float32:
            let p = array.dataPointer.assumingMemoryBound(to: Float.self)
            for i in 0..<count { out[i] = p[i] }
        case .float16:
            let p = array.dataPointer.assumingMemoryBound(to: UInt16.self)
            for i in 0..<count { out[i] = PanelDetector.half(p[i]) }
        case .double:
            let p = array.dataPointer.assumingMemoryBound(to: Double.self)
            for i in 0..<count { out[i] = Float(p[i]) }
        case .int32:
            let p = array.dataPointer.assumingMemoryBound(to: Int32.self)
            for i in 0..<count { out[i] = Float(p[i]) }
        default:
            for i in 0..<count { out[i] = array[i].floatValue }
        }
        return out
    }
}
