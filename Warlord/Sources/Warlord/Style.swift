import AppKit
import WarlordCore

/// Colours, type and symbols: a dark war-table, your banner in gold, the rival houses in heraldic colours.
enum Style {
    static func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }

    static let table = rgb(0x111318, 0.72)
    static let gold = rgb(0xE9B949)
    static let ink = rgb(0x17191E)
    static let text = NSColor(white: 0.93, alpha: 1)
    static let dim = NSColor(white: 0.62, alpha: 1)
    static let faint = NSColor(white: 1, alpha: 0.14)
    static let hairline = NSColor(white: 1, alpha: 0.09)
    static let good = rgb(0x74D38A)
    static let bad = rgb(0xEC6A5E)
    static let fair = rgb(0xF0B44C)

    /// Banner 0 is yours; 1–4 are the rival houses.
    static let banners = [gold, rgb(0xC9443A), rgb(0x3C78D8), rgb(0x3E9E62), rgb(0x8F5BD6)]

    static func banner(_ index: Int) -> NSColor {
        banners[min(max(index, 0), banners.count - 1)]
    }

    static func ground(_ terrain: Terrain) -> NSColor {
        switch terrain {
        case .plains: rgb(0x3B414C)
        case .forest: rgb(0x2E4337)
        case .hills: rgb(0x4A4536)
        case .mountains: rgb(0x55585F)
        case .city: rgb(0x4A4152)
        }
    }

    static func glyph(_ terrain: Terrain) -> String? {
        switch terrain {
        case .plains: nil
        case .forest: "tree.fill"
        case .hills: "mountain.2"
        case .mountains: "mountain.2.fill"
        case .city: "building.2.fill"
        }
    }

    /// Green for a sure thing, amber for a gamble, red for folly.
    static func odds(_ chance: Double) -> NSColor {
        chance >= 0.75 ? good : chance >= 0.4 ? fair : bad
    }

    static func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
        NSFont.systemFont(ofSize: size, weight: weight)
    }

    /// Rounded, fixed-width digits, so counts don't jitter as they change.
    static func digits(_ size: CGFloat, _ weight: NSFont.Weight = .semibold) -> NSFont {
        let base = NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
        guard let rounded = base.fontDescriptor.withDesign(.rounded) else { return base }
        return NSFont(descriptor: rounded, size: size) ?? base
    }

    private static var symbols: [String: NSImage] = [:]

    static func symbol(_ name: String, size: CGFloat, weight: NSFont.Weight = .semibold, color: NSColor) -> NSImage? {
        let key = "\(name)|\(size)|\(weight.rawValue)|\(color.description)"
        if let image = symbols[key] { return image }
        let configuration = NSImage.SymbolConfiguration(pointSize: size, weight: weight)
            .applying(NSImage.SymbolConfiguration(paletteColors: [color]))
        let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(configuration)
        symbols[key] = image
        return image
    }
}
