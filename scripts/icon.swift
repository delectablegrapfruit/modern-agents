// Renders the app icon set: a warm gradient rounded square with an open book, in the spirit of the system apps.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func render(_ size: Int, scale: Int) {
    let px = CGFloat(size * scale)
    let image = NSImage(size: NSSize(width: px, height: px))
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else { image.unlockFocus(); return }
    let inset = px * 0.08
    let rect = NSRect(x: inset, y: inset, width: px - 2 * inset, height: px - 2 * inset)
    let shape = NSBezierPath(roundedRect: rect, xRadius: px * 0.185, yRadius: px * 0.185)
    // Soft shadow under the tile, as macOS icons have.
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.012), blur: px * 0.03, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    NSColor(calibratedRed: 0.98, green: 0.55, blue: 0.12, alpha: 1).setFill()
    shape.fill()
    ctx.restoreGState()
    let gradient = NSGradient(colors: [NSColor(calibratedRed: 1.0, green: 0.72, blue: 0.20, alpha: 1), NSColor(calibratedRed: 0.95, green: 0.40, blue: 0.10, alpha: 1)])!
    gradient.draw(in: shape, angle: -90)

    // The book: two pages with a spine, drawn as filled paths so it stays crisp at every size.
    let w = rect.width, cx = rect.midX, cy = rect.midY
    let pageW = w * 0.30, pageH = w * 0.40, gap = w * 0.025, tilt = w * 0.06
    let paper = NSColor(calibratedWhite: 1, alpha: 0.96)
    for side in [-1.0, 1.0] {
        let path = NSBezierPath()
        let x0 = cx + CGFloat(side) * gap
        let x1 = cx + CGFloat(side) * (gap + pageW)
        path.move(to: NSPoint(x: x0, y: cy - pageH / 2 + tilt * 0.4))
        path.line(to: NSPoint(x: x1, y: cy - pageH / 2 - tilt * 0.3))
        path.line(to: NSPoint(x: x1, y: cy + pageH / 2 - tilt * 0.3))
        path.line(to: NSPoint(x: x0, y: cy + pageH / 2 + tilt * 0.4))
        path.close()
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.006), blur: px * 0.02, color: NSColor.black.withAlphaComponent(0.25).cgColor)
        paper.setFill()
        path.fill()
        ctx.restoreGState()
        // Text lines.
        NSColor(calibratedRed: 0.95, green: 0.55, blue: 0.20, alpha: 0.55).setStroke()
        for i in 0..<4 {
            let line = NSBezierPath()
            let y = cy + pageH * 0.28 - CGFloat(i) * pageH * 0.16
            let xa = x0 + CGFloat(side) * pageW * 0.15, xb = x0 + CGFloat(side) * pageW * (i == 3 ? 0.55 : 0.85)
            line.lineWidth = max(1, px * 0.012)
            line.lineCapStyle = .round
            line.move(to: NSPoint(x: xa, y: y + tilt * 0.1 * CGFloat(side == -1 ? 1 : -1) * 0))
            line.line(to: NSPoint(x: xb, y: y))
            line.stroke()
        }
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
