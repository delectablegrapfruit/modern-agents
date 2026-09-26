// Renders the app icon set: a night-blue tile, a red enemy outpost top right, and three cyan chevrons of a fleet
// streaking at it from the bottom left.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let night = rgb(0.03, 0.04, 0.08)
let deep = rgb(0.08, 0.11, 0.22)
let cyan = rgb(0.16, 0.86, 1.0)
let red = rgb(1.0, 0.24, 0.30)

func glow(_ ctx: CGContext, at p: CGPoint, radius: CGFloat, color: NSColor, alpha: CGFloat) {
    let colors = [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
    guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
    ctx.drawRadialGradient(gradient, startCenter: p, startRadius: 0, endCenter: p, endRadius: radius, options: [])
}

func chevron(at p: CGPoint, size s: CGFloat, angle: CGFloat) -> NSBezierPath {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: s, y: 0))
    path.line(to: NSPoint(x: -s * 0.8, y: s * 0.62))
    path.line(to: NSPoint(x: -s * 0.35, y: 0))
    path.line(to: NSPoint(x: -s * 0.8, y: -s * 0.62))
    path.close()
    var t = AffineTransform(translationByX: p.x, byY: p.y)
    t.rotate(byRadians: angle)
    path.transform(using: t)
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
    ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.012), blur: px * 0.03, color: NSColor.black.withAlphaComponent(0.4).cgColor)
    night.setFill()
    tile.fill()
    ctx.restoreGState()
    NSGradient(colors: [deep, night])!.draw(in: tile, angle: -90)

    ctx.saveGState()
    tile.addClip()
    let w = rect.width
    let small = size <= 32
    // The enemy outpost, top right, ringed in red with its glow.
    let enemy = CGPoint(x: rect.minX + w * 0.72, y: rect.minY + w * 0.72)
    let r = w * (small ? 0.16 : 0.12)
    glow(ctx, at: enemy, radius: r * 3.2, color: red, alpha: 0.55)
    let ring = NSBezierPath(ovalIn: NSRect(x: enemy.x - r, y: enemy.y - r, width: 2 * r, height: 2 * r))
    rgb(0.22, 0.05, 0.08).setFill()
    ring.fill()
    red.setStroke()
    ring.lineWidth = max(1, w * 0.025)
    ring.stroke()
    // The fleet: a trail, then chevrons flying up and right.
    let angle = CGFloat.pi / 4
    let lead = CGPoint(x: rect.minX + w * 0.47, y: rect.minY + w * 0.47)
    glow(ctx, at: lead, radius: w * 0.3, color: cyan, alpha: 0.45)
    let offsets: [CGPoint] = small ? [.zero] : [.zero, CGPoint(x: -w * 0.16, y: -w * 0.03), CGPoint(x: -w * 0.03, y: -w * 0.16)]
    for (k, o) in offsets.enumerated() {
        let p = CGPoint(x: lead.x + o.x, y: lead.y + o.y)
        let trail = NSBezierPath()
        trail.move(to: p)
        trail.line(to: NSPoint(x: p.x - w * 0.22, y: p.y - w * 0.22))
        cyan.withAlphaComponent(0.25).setStroke()
        trail.lineWidth = w * 0.02
        trail.lineCapStyle = .round
        trail.stroke()
        (k == 0 ? NSColor.white.blended(withFraction: 0.35, of: cyan)! : cyan).setFill()
        chevron(at: p, size: w * (k == 0 ? (small ? 0.2 : 0.13) : 0.09), angle: angle).fill()
    }
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
