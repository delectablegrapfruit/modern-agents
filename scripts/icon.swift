// Renders the app icon set: a blood-red dusk behind a pale sun, a black horizon, and one white katana cut slashing
// across the tile.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let top = rgb(0.16, 0.02, 0.06)
let horizon = rgb(1.0, 0.36, 0.14)
let sun = rgb(1.0, 0.88, 0.6)
let ink = rgb(0.03, 0.02, 0.03)

func glow(_ ctx: CGContext, at p: CGPoint, radius: CGFloat, color: NSColor, alpha: CGFloat) {
    let colors = [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
    guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
    ctx.drawRadialGradient(gradient, startCenter: p, startRadius: 0, endCenter: p, endRadius: radius, options: [])
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
    ink.setFill()
    tile.fill()
    ctx.restoreGState()

    ctx.saveGState()
    tile.addClip()
    let w = rect.width
    let ground = rect.minY + w * 0.3
    NSGradient(colors: [horizon, top])!.draw(in: NSRect(x: rect.minX, y: ground, width: w, height: rect.maxY - ground), angle: 90)
    // The sun, low over the horizon.
    let centre = CGPoint(x: rect.midX, y: ground + w * 0.2)
    glow(ctx, at: centre, radius: w * 0.5, color: sun, alpha: 0.55)
    sun.setFill()
    NSBezierPath(ovalIn: NSRect(x: centre.x - w * 0.2, y: centre.y - w * 0.2, width: w * 0.4, height: w * 0.4)).fill()
    // Hills and the ground.
    let hills = NSBezierPath()
    hills.move(to: NSPoint(x: rect.minX, y: ground))
    hills.line(to: NSPoint(x: rect.minX, y: ground + w * 0.1))
    hills.line(to: NSPoint(x: rect.minX + w * 0.22, y: ground + w * 0.2))
    hills.line(to: NSPoint(x: rect.minX + w * 0.4, y: ground + w * 0.08))
    hills.line(to: NSPoint(x: rect.minX + w * 0.7, y: ground + w * 0.16))
    hills.line(to: NSPoint(x: rect.maxX, y: ground + w * 0.06))
    hills.line(to: NSPoint(x: rect.maxX, y: ground))
    hills.close()
    rgb(0.35, 0.05, 0.06).setFill()
    hills.fill()
    ink.setFill()
    NSRect(x: rect.minX, y: rect.minY, width: w, height: ground - rect.minY).fill()
    // The cut: a white crescent from low left to high right, with a red edge.
    let small = size <= 32
    let slash = NSBezierPath()
    slash.move(to: NSPoint(x: rect.minX + w * 0.12, y: rect.minY + w * 0.2))
    slash.curve(to: NSPoint(x: rect.minX + w * 0.9, y: rect.minY + w * 0.84),
                controlPoint1: NSPoint(x: rect.minX + w * 0.5, y: rect.minY + w * 0.26),
                controlPoint2: NSPoint(x: rect.minX + w * 0.78, y: rect.minY + w * 0.5))
    slash.curve(to: NSPoint(x: rect.minX + w * 0.12, y: rect.minY + w * 0.2),
                controlPoint1: NSPoint(x: rect.minX + w * 0.7, y: rect.minY + w * 0.56),
                controlPoint2: NSPoint(x: rect.minX + w * 0.45, y: rect.minY + w * (small ? 0.4 : 0.33)))
    slash.close()
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: w * 0.06, color: rgb(1, 0.15, 0.1).cgColor)
    rgb(1, 0.97, 0.94).setFill()
    slash.fill()
    ctx.restoreGState()
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
