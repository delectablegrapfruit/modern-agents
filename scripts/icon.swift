// Renders the app icon set: a graphite tile with a row of rising volume bars under an amber ceiling line. The bars
// stop at the line and the loud end above it is only a ghost — the range the app sets aside.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let graphiteLight = rgb(0.30, 0.33, 0.40)
let graphiteDark = rgb(0.09, 0.10, 0.13)
let tealLight = rgb(0.55, 0.95, 0.88)
let teal = rgb(0.16, 0.72, 0.68)
let amber = rgb(1.0, 0.72, 0.22)

func render(_ size: Int, scale: Int) {
    let px = CGFloat(size * scale)
    let image = NSImage(size: NSSize(width: px, height: px))
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else { image.unlockFocus(); return }
    let inset = px * 0.08
    let rect = NSRect(x: inset, y: inset, width: px - 2 * inset, height: px - 2 * inset)
    let tile = NSBezierPath(roundedRect: rect, xRadius: px * 0.185, yRadius: px * 0.185)

    // The tile, with the soft drop shadow macOS icons carry, a vertical gradient and a sheen across the top.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.012), blur: px * 0.03, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    graphiteDark.setFill()
    tile.fill()
    ctx.restoreGState()
    NSGradient(colors: [graphiteLight, graphiteDark])!.draw(in: tile, angle: -90)
    ctx.saveGState()
    tile.addClip()
    let sheen = NSBezierPath(ovalIn: NSRect(x: rect.minX - rect.width * 0.25, y: rect.midY - rect.height * 0.02, width: rect.width * 1.5, height: rect.height * 0.95))
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.12), NSColor.white.withAlphaComponent(0)])!.draw(in: sheen, angle: -90)
    ctx.restoreGState()

    // Bars rising left to right. Small sizes get fewer, wider bars so the shape survives at 16 points.
    let w = rect.width
    let small = size <= 32
    let count = small ? 4 : 6
    let areaX = rect.minX + w * 0.17, areaW = w * 0.66
    let baseY = rect.minY + w * 0.18, tallest = w * 0.58
    let gap = areaW * (small ? 0.16 : 0.1) / CGFloat(count - 1)
    let barW = (areaW - gap * CGFloat(count - 1)) / CGFloat(count)
    let ceilingY = baseY + tallest * 0.56
    let radius = barW * 0.3

    for index in 0..<count {
        let height = tallest * (0.22 + 0.78 * CGFloat(index) / CGFloat(count - 1))
        let frame = NSRect(x: areaX + CGFloat(index) * (barW + gap), y: baseY, width: barW, height: height)
        let bar = NSBezierPath(roundedRect: frame, xRadius: radius, yRadius: radius)
        // The part above the ceiling: a ghost.
        NSColor.white.withAlphaComponent(0.13).setFill()
        bar.fill()
        // The part below: lit.
        ctx.saveGState()
        NSRect(x: frame.minX, y: frame.minY, width: frame.width, height: min(frame.height, ceilingY - frame.minY)).clip()
        NSGradient(colors: [tealLight, teal])!.draw(in: bar, angle: -90)
        ctx.restoreGState()
    }

    // The ceiling: an amber line across the bars, a little wider than they are.
    let lineH = w * (small ? 0.06 : 0.04)
    let line = NSBezierPath(roundedRect: NSRect(x: areaX - w * 0.05, y: ceilingY - lineH / 2, width: areaW + w * 0.1, height: lineH),
                            xRadius: lineH / 2, yRadius: lineH / 2)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.004), blur: px * 0.012, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    amber.setFill()
    line.fill()
    ctx.restoreGState()
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
