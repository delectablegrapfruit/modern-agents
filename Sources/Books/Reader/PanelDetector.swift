import AppKit
import CoreML
import Vision
import PDFKit

/// A learned detector of comic panels and text — a YOLO model converted to Core ML by the build
/// (scripts/panel-detector.sh) and bundled as PanelDetector.mlmodelc, or one placed by hand in
/// ~/Library/Application Support/Books/Models. It runs on the Mac through Vision, on the Neural Engine where there
/// is one; nothing leaves the machine. Its boxes steer the gutter analysis: they say where the panels are and which
/// panel a balloon belongs to, while the analysis keeps supplying the exact outlines.
final class PanelDetector: @unchecked Sendable {
    struct Detection {
        enum Kind { case panel, text }
        let kind: Kind
        /// In the image's normalised coordinates, origin at the bottom left (as Vision reports).
        let rect: CGRect
        let confidence: Float
    }

    /// The model's origin, for the Appearance popover.
    let name: String
    private let model: VNCoreMLModel

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
        return name(beside: url)
    }

    private static func name(beside url: URL) -> String {
        let meta = url.deletingLastPathComponent().appendingPathComponent("PanelDetector.json")
        if let data = try? Data(contentsOf: meta), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let repo = json["repo"] as? String {
            return repo
        }
        return "PanelDetector"
    }

    private init(model: VNCoreMLModel, name: String) {
        self.model = model
        self.name = name
    }

    private static func load() -> PanelDetector? {
        let configuration = MLModelConfiguration()
        configuration.computeUnits = .all
        for url in candidates {
            guard let loaded = try? MLModel(contentsOf: url, configuration: configuration), let vision = try? VNCoreMLModel(for: loaded) else { continue }
            return PanelDetector(model: vision, name: name(beside: url))
        }
        return nil
    }

    /// The panels and text the model sees in an image.
    func detect(in image: CGImage) -> [Detection] {
        let request = VNCoreMLRequest(model: model)
        request.imageCropAndScaleOption = .scaleFit
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do { try handler.perform([request]) } catch { return [] }
        let observations = request.results as? [VNRecognizedObjectObservation] ?? []
        return observations.compactMap { observation in
            let label = observation.labels.max { $0.confidence < $1.confidence }
            let name = label?.identifier.lowercased() ?? ""
            let kind: Detection.Kind
            if name.contains("panel") || name.contains("frame") || name.contains("border") {
                kind = .panel
            } else if name.contains("text") || name.contains("bubble") || name.contains("balloon") || name.contains("caption") || name.contains("dialog") {
                kind = .text
            } else if let index = Int(name) {
                // Unnamed classes, as the model's author numbers them: 0 panels, the rest text.
                kind = index == 0 ? .panel : .text
            } else {
                kind = .panel
            }
            let rect = observation.boundingBox
            guard rect.width > 0.005, rect.height > 0.005 else { return nil }
            return Detection(kind: kind, rect: rect, confidence: label?.confidence ?? observation.confidence)
        }
    }

    /// The panels and text on a PDF page, in display space (page points, origin at the bottom left).
    func detect(page: PDFPage, size: CGSize) -> [Detection] {
        guard size.width > 0, size.height > 0 else { return [] }
        let width: CGFloat = 1280
        let height = (width * size.height / size.width).rounded()
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return [] }
        return detect(in: cg).map { d in
            Detection(kind: d.kind, rect: CGRect(x: d.rect.minX * size.width, y: d.rect.minY * size.height, width: d.rect.width * size.width, height: d.rect.height * size.height), confidence: d.confidence)
        }
    }
}
