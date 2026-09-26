// Renders the app icon set: a dark war-table tile with a cluster of seven hex territories — most under your gold
// banner, a crown on the seat in the middle, two still held by rival houses.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let gold = rgb(0xE9B949), crimson = rgb(0xC9443A), azure = rgb(0x3C78D8), slate = rgb(0x3B414C)

func hexagon(center: NSPoint, radius: CGFloat) -> NSBezierPath {
    let path = NSBezierPath()
    for i in 0..<6 {
        let angle = (CGFloat(i) * 60 + 90) * .pi / 180
        let p = NSPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
        if i == 0 { path.move(to: p) } else { path.line(to: p) }
    }
    path.close()
    path.lineJoinStyle = .round
    return path
}

func render(_ size: Int, scale: Int) {
    let px = CGFloat(size * scale)
    let image = NSImage(size: NSSize(width: px, height: px))
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else { image.unlockFocus(); return }
    let inset = px * 0.08
    let rect = NSRect(x: inset, y: inset, width: px - 2 * inset, height: px - 2 * inset)
    let tile = NSBezierPath(roundedRect: rect, xRadius: px * 0.185, yRadius: px * 0.185)

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.012), blur: px * 0.03, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    rgb(0x15171C).setFill()
    tile.fill()
    ctx.restoreGState()
    NSGradient(colors: [rgb(0x2B2F38), rgb(0x121418)])!.draw(in: tile, angle: -90)

    // Seven cells: the seat in the middle and a ring around it.
    let r = rect.width * (size <= 32 ? 0.2 : 0.17)
    let step = r * sqrt(3)
    let c = NSPoint(x: rect.midX, y: rect.midY)
    let ring: [NSColor] = [gold, gold, crimson, gold, azure, size <= 32 ? gold : slate]
    var cells: [(NSPoint, NSColor)] = [(c, gold)]
    for (i, color) in ring.enumerated() {
        let angle = CGFloat(i) * 60 * .pi / 180
        cells.append((NSPoint(x: c.x + step * cos(angle), y: c.y + step * sin(angle)), color))
    }
    for (center, color) in cells {
        let path = hexagon(center: center, radius: r * 0.93)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.006), blur: px * 0.015, color: NSColor.black.withAlphaComponent(0.4).cgColor)
        color.setFill()
        path.fill()
        ctx.restoreGState()
    }
    // The crown on the seat.
    if let crown = NSImage(systemSymbolName: "crown.fill", accessibilityDescription: nil)?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: r * 0.8, weight: .bold).applying(.init(paletteColors: [rgb(0x17191E)]))) {
        let s = crown.size
        crown.draw(in: NSRect(x: c.x - s.width / 2, y: c.y - s.height / 2, width: s.width, height: s.height))
    }
    image.unlockFocus()

    guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { return }
    let name = scale == 1 ? "icon_\(size)x\(size).png" : "icon_\(size)x\(size)@2x.png"
    try? png.write(to: URL(fileURLWithPath: out).appendingPathComponent(name))
}

for size in [16, 32, 128, 256, 512] {
    render(size, scale: 1)
    render(size, scale: 2)
}
