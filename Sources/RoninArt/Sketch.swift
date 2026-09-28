import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif

/// A colour with its opacity.
public struct Paint: Equatable, Sendable {
    public var rgb: RGB
    public var alpha: CGFloat

    public init(_ rgb: RGB, _ alpha: CGFloat = 1) {
        self.rgb = rgb
        self.alpha = alpha
    }
}

/// A path as a list of pen moves, in pixels with y up.
public struct Path: Sendable {
    public enum Segment: Sendable {
        case move(CGPoint)
        case line(CGPoint)
        case quad(CGPoint, control: CGPoint)
        case close
    }

    public var segments: [Segment] = []

    public init() {}

    public init(polygon points: [CGPoint]) {
        guard let first = points.first else { return }
        segments.append(.move(first))
        for p in points.dropFirst() { segments.append(.line(p)) }
        segments.append(.close)
    }

    public mutating func move(_ p: CGPoint) { segments.append(.move(p)) }
    public mutating func line(_ p: CGPoint) { segments.append(.line(p)) }
    public mutating func quad(_ p: CGPoint, control: CGPoint) { segments.append(.quad(p, control: control)) }
    public mutating func close() { segments.append(.close) }

    /// Every point the path touches (control points included), for bounds checks.
    public var points: [CGPoint] {
        segments.flatMap { segment -> [CGPoint] in
            switch segment {
            case .move(let p), .line(let p): return [p]
            case .quad(let p, let c): return [p, c]
            case .close: return []
            }
        }
    }
}

/// One filled or stroked shape.
public struct Shape: Sendable {
    public enum Kind: Sendable {
        case path(Path)
        case ellipse(CGRect)
    }

    public var kind: Kind
    public var fill: Paint?
    public var stroke: Paint?
    public var width: CGFloat = 0
    public var round = false

    public var points: [CGPoint] {
        switch kind {
        case .path(let path): return path.points
        case .ellipse(let r): return [CGPoint(x: r.minX, y: r.minY), CGPoint(x: r.maxX, y: r.maxY)]
        }
    }

    /// The shape in one colour: its fill and its stroke both.
    func inked(_ paint: Paint) -> Shape {
        var out = self
        if fill != nil { out.fill = paint }
        if stroke != nil { out.stroke = paint }
        return out
    }

    /// The shape moved by `f`, point by point (an ellipse by its centre).
    func mapped(_ f: (CGPoint) -> CGPoint) -> Shape {
        var out = self
        switch kind {
        case .ellipse(let r):
            let c = f(CGPoint(x: r.midX, y: r.midY))
            out.kind = .ellipse(CGRect(x: c.x - r.width / 2, y: c.y - r.height / 2, width: r.width, height: r.height))
        case .path(let path):
            var moved = Path()
            moved.segments = path.segments.map { segment in
                switch segment {
                case .move(let p): return .move(f(p))
                case .line(let p): return .line(f(p))
                case .quad(let p, let c): return .quad(f(p), control: f(c))
                case .close: return .close
                }
            }
            out.kind = .path(moved)
        }
        return out
    }
}

/// A picture as shapes: the figure itself (drawn as one, with a thin rim of light around it), an underlay drawn first
/// without the rim (a smear: the body's echoes and the limbs and blade repeated along a swing), and an overlay drawn on
/// top without the rim (the bright trail of a swing). Rendered with Core Graphics in the app and as SVG for previews.
public struct Sketch: Sendable {
    public var width: Int
    public var height: Int
    public var underlay: [Shape] = []
    public var body: [Shape] = []
    public var overlay: [Shape] = []
    /// The rim of light: its colour and how far it spreads, in pixels. Faint and cool, moonlight on an edge, so a
    /// figure stays a dark silhouette on any sky (a warm, strong rim haloes it pale against the night and the snow).
    public var rim = Paint(RGB(0.7, 0.72, 0.8), 0.3)
    public var rimRadius: CGFloat = 1.4

    public init(width: Int, height: Int) {
        self.width = width
        self.height = height
    }

    public var isEmpty: Bool { body.isEmpty && overlay.isEmpty }

    /// The sketch with every point moved by `f` (a turn, a shift). Ellipses move by their centres.
    public func mapped(_ f: (CGPoint) -> CGPoint) -> Sketch {
        var out = self
        out.underlay = underlay.map { $0.mapped(f) }
        out.body = body.map { $0.mapped(f) }
        out.overlay = overlay.map { $0.mapped(f) }
        return out
    }

    /// The box around everything drawn (control points included, so a little generous), grown by `margin` and kept
    /// to the canvas, on whole pixels.
    public func bounds(margin: CGFloat) -> CGRect {
        var minX = CGFloat.infinity, minY = CGFloat.infinity, maxX = -CGFloat.infinity, maxY = -CGFloat.infinity
        for shape in underlay + body + overlay {
            let grow = shape.stroke == nil ? 0 : shape.width / 2
            for p in shape.points {
                minX = min(minX, p.x - grow)
                minY = min(minY, p.y - grow)
                maxX = max(maxX, p.x + grow)
                maxY = max(maxY, p.y + grow)
            }
        }
        guard minX <= maxX else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let x0 = max(0, (minX - margin).rounded(.down)), y0 = max(0, (minY - margin).rounded(.down))
        let x1 = min(CGFloat(width), (maxX + margin).rounded(.up)), y1 = min(CGFloat(height), (maxY + margin).rounded(.up))
        return CGRect(x: x0, y: y0, width: max(1, x1 - x0), height: max(1, y1 - y0))
    }

    /// Whether every shape keeps within the canvas (with a little room for the rim).
    public func fits(margin: CGFloat = 0) -> Bool {
        let all = (underlay + body + overlay).flatMap(\.points)
        return all.allSatisfy { $0.x >= -margin && $0.y >= -margin && $0.x <= CGFloat(width) + margin && $0.y <= CGFloat(height) + margin }
    }
}

/// Records drawing into a sketch, in the manner of a graphics context.
public struct Pen {
    public private(set) var sketch: Sketch
    private var overlaying = false

    public init(width: Int, height: Int) { sketch = Sketch(width: width, height: height) }

    private mutating func add(_ shape: Shape) {
        if overlaying { sketch.overlay.append(shape) } else { sketch.body.append(shape) }
    }

    public mutating func fill(_ points: [CGPoint], _ paint: Paint) {
        add(Shape(kind: .path(Path(polygon: points)), fill: paint))
    }

    public mutating func fill(_ path: Path, _ paint: Paint) {
        add(Shape(kind: .path(path), fill: paint))
    }

    public mutating func ellipse(_ rect: CGRect, _ paint: Paint) {
        add(Shape(kind: .ellipse(rect), fill: paint))
    }

    public mutating func stroke(_ path: Path, _ paint: Paint, width: CGFloat, round: Bool = false) {
        add(Shape(kind: .path(path), stroke: paint, width: width, round: round))
    }

    public mutating func line(_ a: CGPoint, _ b: CGPoint, _ paint: Paint, width: CGFloat, round: Bool = false) {
        var path = Path()
        path.move(a)
        path.line(b)
        stroke(path, paint, width: width, round: round)
    }

    /// Everything drawn inside `body` goes on top, outside the rim of light.
    public mutating func overlay(_ body: (inout Pen) -> Void) {
        overlaying = true
        body(&self)
        overlaying = false
    }

    /// Shapes laid under everything, outside the rim of light.
    public mutating func underlay(_ shapes: [Shape]) {
        sketch.underlay += shapes
    }
}

// MARK: SVG, for previews

extension Sketch {
    private static func number(_ v: CGFloat) -> String { String(format: "%.1f", Double(v)) }

    private static func colour(_ p: Paint) -> String {
        func c(_ v: CGFloat) -> Int { Int((max(0, min(1, v)) * 255).rounded()) }
        return "rgb(\(c(p.rgb.r)),\(c(p.rgb.g)),\(c(p.rgb.b)))"
    }

    private func d(_ path: Path) -> String {
        let h = CGFloat(height)
        func xy(_ p: CGPoint) -> String { "\(Sketch.number(p.x)) \(Sketch.number(h - p.y))" }
        return path.segments.map { segment -> String in
            switch segment {
            case .move(let p): return "M\(xy(p))"
            case .line(let p): return "L\(xy(p))"
            case .quad(let p, let c): return "Q\(xy(c)) \(xy(p))"
            case .close: return "Z"
            }
        }.joined(separator: " ")
    }

    private func element(_ shape: Shape, outline: Paint? = nil, outlineWidth: CGFloat = 0) -> String {
        var style = ""
        if let outline {
            style = "fill=\"none\" stroke=\"\(Sketch.colour(outline))\" stroke-opacity=\"\(String(format: "%.2f", Double(outline.alpha)))\" stroke-width=\"\(Sketch.number(outlineWidth + shape.width))\" stroke-linejoin=\"round\" stroke-linecap=\"round\""
        } else {
            if let fill = shape.fill {
                style += "fill=\"\(Sketch.colour(fill))\" fill-opacity=\"\(String(format: "%.3f", Double(fill.alpha)))\""
            } else {
                style += "fill=\"none\""
            }
            if let stroke = shape.stroke {
                style += " stroke=\"\(Sketch.colour(stroke))\" stroke-opacity=\"\(String(format: "%.3f", Double(stroke.alpha)))\" stroke-width=\"\(Sketch.number(shape.width))\""
                style += shape.round ? " stroke-linecap=\"round\" stroke-linejoin=\"round\"" : " stroke-linejoin=\"miter\""
            }
        }
        switch shape.kind {
        case .path(let path):
            return "<path d=\"\(d(path))\" \(style)/>"
        case .ellipse(let r):
            let h = CGFloat(height)
            return "<ellipse cx=\"\(Sketch.number(r.midX))\" cy=\"\(Sketch.number(h - r.midY))\" rx=\"\(Sketch.number(r.width / 2))\" ry=\"\(Sketch.number(r.height / 2))\" \(style)/>"
        }
    }

    /// The sketch as SVG elements (no document wrapper), offset by `x`, `y` and scaled by `scale`.
    public func svg(x: CGFloat = 0, y: CGFloat = 0, scale: CGFloat = 1) -> String {
        var out = "<g transform=\"translate(\(Sketch.number(x)) \(Sketch.number(y))) scale(\(String(format: "%.3f", Double(scale))))\">"
        for shape in underlay { out += element(shape) }
        // The rim: every body shape outlined in the rim colour first, the shapes over it.
        for shape in body { out += element(shape, outline: rim, outlineWidth: rimRadius * 2) }
        for shape in body { out += element(shape) }
        for shape in overlay { out += element(shape) }
        return out + "</g>"
    }
}
