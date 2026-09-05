// Renders the app icon set: a deep indigo tile with a small pile of books and an amber bookmark. A library rather
// than the orange open book of the system's own Books app, so the two are told apart at a glance in the Dock.
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

let indigoLight = rgb(0.45, 0.40, 0.95)
let indigoDark = rgb(0.16, 0.13, 0.44)
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
    indigoDark.setFill()
    tile.fill()
    ctx.restoreGState()
    NSGradient(colors: [indigoLight, indigoDark])!.draw(in: tile, angle: -90)
    ctx.saveGState()
    tile.addClip()
    let sheen = NSBezierPath(ovalIn: NSRect(x: rect.minX - rect.width * 0.25, y: rect.midY - rect.height * 0.02, width: rect.width * 1.5, height: rect.height * 0.95))
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.14), NSColor.white.withAlphaComponent(0)])!.draw(in: sheen, angle: -90)
    ctx.restoreGState()

    // Books lying on their sides in a loose pile, spines facing out. Small sizes get two thicker books so the
    // shape survives at 16 points.
    let w = rect.width, cx = rect.midX, cy = rect.midY
    let small = size <= 32
    let bookH = w * (small ? 0.24 : 0.165), gapY = w * (small ? 0.05 : 0.035)
    var books: [(width: CGFloat, shift: CGFloat, alpha: CGFloat)] = [
        (w * 0.64, -w * 0.02, 0.97),
        (w * 0.55, w * 0.05, 0.86),
        (w * 0.60, -w * 0.01, 0.97),
    ]
    if small { books.removeFirst() }
    let stackH = CGFloat(books.count) * bookH + CGFloat(books.count - 1) * gapY
    var y = cy - stackH / 2
    for (index, book) in books.enumerated() {
        let frame = NSRect(x: cx + book.shift - book.width / 2, y: y, width: book.width, height: bookH)
        let path = NSBezierPath(roundedRect: frame, xRadius: bookH * 0.2, yRadius: bookH * 0.2)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.006), blur: px * 0.018, color: NSColor.black.withAlphaComponent(0.3).cgColor)
        NSColor(calibratedWhite: 1, alpha: book.alpha).setFill()
        path.fill()
        ctx.restoreGState()

        ctx.saveGState()
        path.addClip()
        // The page block: a paler strip along the book's open end.
        rgb(0.84, 0.84, 0.93).setFill()
        NSRect(x: frame.maxX - frame.width * 0.09, y: frame.minY, width: frame.width * 0.09, height: frame.height).fill()
        // A title band on the spine.
        indigoLight.withAlphaComponent(0.4).setFill()
        NSRect(x: frame.minX + frame.width * 0.11, y: frame.minY + bookH * 0.3, width: frame.width * 0.2, height: bookH * 0.4).fill()
        ctx.restoreGState()

        if index == books.count - 1 {
            // The bookmark: an amber ribbon out of the top book's pages, with a notched end.
            let ribbonH = bookH * 0.42, ribbonY = frame.midY - ribbonH / 2
            let startX = frame.maxX - frame.width * 0.12, endX = frame.maxX + w * 0.11, notch = ribbonH * 0.45
            let ribbon = NSBezierPath()
            ribbon.move(to: NSPoint(x: startX, y: ribbonY))
            ribbon.line(to: NSPoint(x: endX, y: ribbonY))
            ribbon.line(to: NSPoint(x: endX - notch, y: ribbonY + ribbonH / 2))
            ribbon.line(to: NSPoint(x: endX, y: ribbonY + ribbonH))
            ribbon.line(to: NSPoint(x: startX, y: ribbonY + ribbonH))
            ribbon.close()
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 0, height: -px * 0.004), blur: px * 0.012, color: NSColor.black.withAlphaComponent(0.3).cgColor)
            amber.setFill()
            ribbon.fill()
            ctx.restoreGState()
        }
        y += bookH + gapY
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
