// Renders the app icon set: a night-blue tile with a bend of neon road — magenta on the outside, cyan on the
// inside — and a white car sliding through it, tail out, drawing two light trails.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: r, green: g, blue: b, alpha: a)
}

let top = rgb(0.16, 0.09, 0.32)
let bottom = rgb(0.03, 0.03, 0.07)
let magenta = rgb(1.0, 0.25, 0.68)
let cyan = rgb(0.22, 0.88, 1.0)

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
    bottom.setFill()
    tile.fill()
    ctx.restoreGState()
    NSGradient(colors: [top, bottom])!.draw(in: tile, angle: -90)

    ctx.saveGState()
    tile.addClip()
    let w = rect.width
    // The bend: a quarter circle about the bottom-right corner, road between two neon walls.
    let center = NSPoint(x: rect.maxX + w * 0.05, y: rect.minY - w * 0.05)
    let radius = w * 0.72, road = w * 0.30
    let small = size <= 32
    func arc(_ r: CGFloat) -> NSBezierPath {
        let path = NSBezierPath()
        path.appendArc(withCenter: center, radius: r, startAngle: 90, endAngle: 180)
        return path
    }
    let surface = arc(radius)
    surface.lineWidth = road
    rgb(0.09, 0.09, 0.14).setStroke()
    surface.stroke()
    for (r, color) in [(radius + road / 2, magenta), (radius - road / 2, cyan)] {
        let wall = arc(r)
        for (width, alpha) in [(w * 0.07, 0.18), (w * 0.035, 0.4), (w * (small ? 0.03 : 0.014), 1.0)] {
            wall.lineWidth = width
            color.withAlphaComponent(alpha).setStroke()
            wall.stroke()
        }
    }

    // Two light trails following the bend into the car's rear wheels. The car travels anticlockwise round the
    // bend, so at 135° it heads 225°; its nose is turned a further 34° into the bend.
    let heading: CGFloat = (225 + 34) * .pi / 180
    let onRoad = NSPoint(x: center.x + radius * cos(135 * .pi / 180), y: center.y + radius * sin(135 * .pi / 180))
    if !small {
        for side: CGFloat in [-1, 1] {
            let trail = NSBezierPath()
            trail.appendArc(withCenter: center, radius: radius + side * w * 0.04, startAngle: 100, endAngle: 128)
            trail.lineWidth = w * 0.018
            trail.lineCapStyle = .round
            NSColor.white.withAlphaComponent(0.55).setStroke()
            trail.stroke()
        }
    }

    // The car, tail out: rotated past the road's direction.
    ctx.saveGState()
    ctx.translateBy(x: onRoad.x, y: onRoad.y)
    ctx.rotate(by: heading)
    let length = w * (small ? 0.36 : 0.30), width = length * 0.5
    let body = NSBezierPath(roundedRect: NSRect(x: -length / 2, y: -width / 2, width: length, height: width),
                            xRadius: width * 0.3, yRadius: width * 0.3)
    ctx.setShadow(offset: .zero, blur: px * 0.05, color: magenta.withAlphaComponent(0.8).cgColor)
    rgb(0.95, 0.96, 0.99).setFill()
    body.fill()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    if !small {
        rgb(0.1, 0.1, 0.16, 0.8).setFill()
        NSBezierPath(roundedRect: NSRect(x: -length * 0.26, y: -width * 0.36, width: length * 0.46, height: width * 0.72),
                     xRadius: width * 0.14, yRadius: width * 0.14).fill()
        rgb(1, 0.15, 0.25).setFill()
        NSRect(x: -length / 2, y: width * 0.22, width: length * 0.06, height: width * 0.2).fill()
        NSRect(x: -length / 2, y: -width * 0.42, width: length * 0.06, height: width * 0.2).fill()
    }
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
