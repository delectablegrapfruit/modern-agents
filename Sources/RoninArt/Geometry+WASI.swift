// The WebAssembly build's Foundation (FoundationEssentials, without ICU) has no Core Graphics types: the few the art
// uses, as plain values. Every other platform takes them from Foundation or Core Graphics, and this file is empty.
#if os(WASI)
import WASILibc

public typealias CGFloat = Double

public struct CGPoint: Hashable, Sendable {
    public var x: CGFloat
    public var y: CGFloat

    public init() { x = 0; y = 0 }
    public init(x: CGFloat, y: CGFloat) {
        self.x = x
        self.y = y
    }

    public static let zero = CGPoint()
}

public struct CGSize: Hashable, Sendable {
    public var width: CGFloat
    public var height: CGFloat

    public init() { width = 0; height = 0 }
    public init(width: CGFloat, height: CGFloat) {
        self.width = width
        self.height = height
    }

    public static let zero = CGSize()
}

public struct CGRect: Hashable, Sendable {
    public var origin: CGPoint
    public var size: CGSize

    public init() { origin = .zero; size = .zero }
    public init(origin: CGPoint, size: CGSize) {
        self.origin = origin
        self.size = size
    }
    public init(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
        origin = CGPoint(x: x, y: y)
        size = CGSize(width: width, height: height)
    }

    public static let zero = CGRect()

    public var width: CGFloat { abs(size.width) }
    public var height: CGFloat { abs(size.height) }
    public var minX: CGFloat { min(origin.x, origin.x + size.width) }
    public var maxX: CGFloat { max(origin.x, origin.x + size.width) }
    public var minY: CGFloat { min(origin.y, origin.y + size.height) }
    public var maxY: CGFloat { max(origin.y, origin.y + size.height) }
    public var midX: CGFloat { (minX + maxX) / 2 }
    public var midY: CGFloat { (minY + maxY) / 2 }
}
#endif
