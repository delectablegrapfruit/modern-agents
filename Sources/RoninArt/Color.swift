#if os(WASI)
import WASILibc
#else
import Foundation
#endif
#if canImport(CoreGraphics)
import CoreGraphics
#endif

/// A colour kept as its components, so it can be mixed and dimmed without a trip through colour spaces.
public struct RGB: Equatable, Sendable {
    public var r: CGFloat
    public var g: CGFloat
    public var b: CGFloat

    public init(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) {
        self.r = r
        self.g = g
        self.b = b
    }

    public func mix(_ other: RGB, _ t: CGFloat) -> RGB { RGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t) }
    public func scaled(_ k: CGFloat) -> RGB { RGB(r * k, g * k, b * k) }

    public static let white = RGB(1, 1, 1)
    public static let black = RGB(0, 0, 0)
}

public enum Palette {
    public static let background = RGB(0.035, 0.025, 0.03)
    public static let header = RGB(0.06, 0.045, 0.05)
    public static let ink = RGB(0.95, 0.92, 0.88)
    public static let gold = RGB(0.93, 0.76, 0.42)
    public static let blood = RGB(0.86, 0.08, 0.1)
    public static let steel = RGB(0.9, 0.94, 1.0)
    /// The gourd of medicine, and the heart it gives back.
    public static let jade = RGB(0.35, 0.95, 0.62)
    public static let silhouette = RGB(0.025, 0.02, 0.03)
    /// The far-side limbs and gear, a little off the silhouette so the figure reads in depth, and cool, so that it stays
    /// a dark shape in the dusk and the moonlight rather than turning grey.
    public static let shade = RGB(0.075, 0.068, 0.085)
}
