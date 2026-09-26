// Renders Lull's icon set: a dusk-blue tile with a T piece floating above a low stack, its landing spot drawn as a
// dashed ghost — blocks that wait for you.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let top = rgb(0.23, 0.27, 0.42)
let bottom = rgb(0.07, 0.08, 0.13)
let accent = rgb(0.56, 0.70, 1.0)
let stackColors = [rgb(0.49, 0.85, 0.56), rgb(0.96, 0.76, 0.47), rgb(0.92, 0.44, 0.57), rgb(0.61, 0.81, 0.85)]

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
    accent.withAlphaComponent(0.55).setStroke()
    tile.lineWidth = max(1, px * 0.008)
    tile.stroke()

    let small = size <= 32
    let cell = rect.width / (small ? 5.2 : 7.0)
    let gap = small ? 0 : cell * 0.08
    let ox = rect.midX - cell * 1.5
    func block(_ x: CGFloat, _ y: CGFloat, _ color: NSColor) {
        let r = NSRect(x: ox + x * cell + gap / 2, y: rect.minY + y * cell + gap / 2 + rect.height * 0.1, width: cell - gap, height: cell - gap)
        let p = NSBezierPath(roundedRect: r, xRadius: cell * 0.16, yRadius: cell * 0.16)
        color.setFill()
        p.fill()
        if !small {
            NSColor.white.withAlphaComponent(0.22).setFill()
            NSBezierPath(roundedRect: NSRect(x: r.minX + r.width * 0.12, y: r.maxY - r.height * 0.3, width: r.width * 0.5, height: r.height * 0.14), xRadius: r.height * 0.07, yRadius: r.height * 0.07).fill()
        }
    }
    // The stack: a low floor with one T-shaped gap.
    if !small {
        let floor: [(CGFloat, CGFloat)] = [(-1.5, 0), (-0.5, 0), (1.5, 0), (2.5, 0), (3.5, 0), (-1.5, 1), (2.5, 1), (3.5, 1)]
        for (i, f) in floor.enumerated() { block(f.0, f.1, stackColors[i % stackColors.count].withAlphaComponent(0.9)) }
        // The ghost where the T would land.
        let dash = NSBezierPath()
        for (x, y) in [(-0.5, 1.0), (0.5, 1.0), (1.5, 1.0), (0.5, 0.0)] as [(CGFloat, CGFloat)] {
            dash.appendRoundedRect(NSRect(x: ox + x * cell + cell * 0.12, y: rect.minY + y * cell + cell * 0.12 + rect.height * 0.1, width: cell * 0.76, height: cell * 0.76), xRadius: cell * 0.12, yRadius: cell * 0.12)
        }
        dash.lineWidth = max(1, px * 0.008)
        dash.setLineDash([px * 0.02, px * 0.015], count: 2, phase: 0)
        accent.withAlphaComponent(0.8).setStroke()
        dash.stroke()
    }
    // The floating T, with a soft glow.
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: px * 0.05, color: accent.withAlphaComponent(0.7).cgColor)
    let ty: CGFloat = small ? 1.7 : 4.0
    for (x, y) in [(-0.5, ty), (0.5, ty), (1.5, ty), (0.5, ty + 1)] as [(CGFloat, CGFloat)] { block(x, y, accent) }
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
