// Renders the app icon set: a night tile, a crimson star-hulled boss at the top throwing a ring of bullets, and a
// cyan interceptor rising from the bottom with its shots streaking up.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let night = rgb(0.02, 0.025, 0.05)
let deep = rgb(0.09, 0.05, 0.14)
let cyan = rgb(0.16, 0.9, 1.0)
let red = rgb(1.0, 0.22, 0.3)
let gold = rgb(1.0, 0.8, 0.28)

func glow(_ ctx: CGContext, at p: CGPoint, radius: CGFloat, color: NSColor, alpha: CGFloat) {
    let colors = [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
    guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
    ctx.drawRadialGradient(gradient, startCenter: p, startRadius: 0, endCenter: p, endRadius: radius, options: [])
}

func star(at c: CGPoint, points: Int, outer: CGFloat, inner: CGFloat) -> NSBezierPath {
    let path = NSBezierPath()
    for k in 0..<(points * 2) {
        let a = CGFloat.pi / 2 + CGFloat(k) * .pi / CGFloat(points)
        let r = k % 2 == 0 ? outer : inner
        let p = NSPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
        if k == 0 { path.move(to: p) } else { path.line(to: p) }
    }
    path.close()
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
    // The boss.
    let boss = CGPoint(x: rect.midX, y: rect.minY + w * 0.7)
    let r = w * (small ? 0.2 : 0.14)
    glow(ctx, at: boss, radius: r * 3.4, color: red, alpha: 0.55)
    let hull = star(at: boss, points: 6, outer: r * 1.12, inner: r * 0.8)
    rgb(0.25, 0.04, 0.08).setFill()
    hull.fill()
    red.setStroke()
    hull.lineWidth = max(1, w * 0.02)
    hull.stroke()
    glow(ctx, at: boss, radius: r * 0.7, color: rgb(1, 0.85, 0.8), alpha: 1)
    // Its ring of bullets.
    if !small {
        for k in 0..<12 {
            let a = CGFloat(k) * .pi / 6 + 0.13
            let p = CGPoint(x: boss.x + cos(a) * r * 2.3, y: boss.y + sin(a) * r * 2.3)
            glow(ctx, at: p, radius: w * 0.035, color: red, alpha: 0.9)
            NSColor.white.setFill()
            NSBezierPath(ovalIn: NSRect(x: p.x - w * 0.011, y: p.y - w * 0.011, width: w * 0.022, height: w * 0.022)).fill()
        }
    }
    // The interceptor and its shots.
    let ship = CGPoint(x: rect.midX, y: rect.minY + w * 0.2)
    let s = w * (small ? 0.2 : 0.13)
    glow(ctx, at: ship, radius: s * 2.6, color: cyan, alpha: 0.5)
    if !small {
        for dx in [-0.35, 0.35] as [CGFloat] {
            let x = ship.x + dx * s
            let bolt = NSBezierPath()
            bolt.move(to: NSPoint(x: x, y: ship.y + s * 1.3))
            bolt.line(to: NSPoint(x: x, y: ship.y + s * 2.6))
            cyan.withAlphaComponent(0.9).setStroke()
            bolt.lineWidth = w * 0.014
            bolt.lineCapStyle = .round
            bolt.stroke()
        }
    }
    let body = NSBezierPath()
    body.move(to: NSPoint(x: ship.x, y: ship.y + s))
    body.line(to: NSPoint(x: ship.x + s * 0.36, y: ship.y + s * 0.02))
    body.line(to: NSPoint(x: ship.x + s * 0.9, y: ship.y - s * 0.7))
    body.line(to: NSPoint(x: ship.x + s * 0.28, y: ship.y - s * 0.5))
    body.line(to: NSPoint(x: ship.x, y: ship.y - s * 0.85))
    body.line(to: NSPoint(x: ship.x - s * 0.28, y: ship.y - s * 0.5))
    body.line(to: NSPoint(x: ship.x - s * 0.9, y: ship.y - s * 0.7))
    body.line(to: NSPoint(x: ship.x - s * 0.36, y: ship.y + s * 0.02))
    body.close()
    cyan.blended(withFraction: 0.6, of: night)!.setFill()
    body.fill()
    NSColor.white.blended(withFraction: 0.3, of: cyan)!.setStroke()
    body.lineWidth = max(1, w * 0.018)
    body.lineJoinStyle = .round
    body.stroke()
    if !small { glow(ctx, at: CGPoint(x: ship.x, y: ship.y + s * 0.1), radius: w * 0.03, color: gold, alpha: 0.9) }
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
