import AppKit
import SidewaysCore

/// The parts of a track that never change, built into paths once per track: the road surface, the walls, the kerbs
/// on the inside of the tight bends, the street lamps along the verge, the minimap, and the track's two neons.
final class TrackArt {
    let id: String
    let surface: CGPath
    let leftWall: CGPath
    let rightWall: CGPath
    let kerbs: CGPath
    let lamps: [CGPoint]
    /// The centerline fitted into a unit square (aspect kept), for the minimap.
    let minimap: CGPath
    let minimapAspect: CGFloat
    let leftNeon: NSColor
    let rightNeon: NSColor
    let track: Track

    init(track: Track) {
        self.track = track
        id = track.info.id
        let left = track.leftEdge.map(CGPoint.init), right = track.rightEdge.map(CGPoint.init)

        let surface = CGMutablePath()
        surface.addLines(between: left)
        surface.closeSubpath()
        surface.addLines(between: right)
        surface.closeSubpath()
        self.surface = surface

        let leftWall = CGMutablePath()
        leftWall.addLines(between: left)
        leftWall.closeSubpath()
        self.leftWall = leftWall
        let rightWall = CGMutablePath()
        rightWall.addLines(between: right)
        rightWall.closeSubpath()
        self.rightWall = rightWall

        // Kerbs: striped blocks on the inside wall wherever the bend is tighter than a 150-unit radius.
        let kerbs = CGMutablePath()
        let n = track.count
        for i in 0..<n where abs(track.curvature[i]) > 1.0 / 150 && (i / 2) % 2 == 0 {
            let j = (i + 1) % n
            let side: Double = track.curvature[i] > 0 ? 1 : -1
            let a = track.points[i] + track.tangents[i].perp * (side * track.halfWidth)
            let b = track.points[j] + track.tangents[j].perp * (side * track.halfWidth)
            let a2 = track.points[i] + track.tangents[i].perp * (side * (track.halfWidth - 5))
            let b2 = track.points[j] + track.tangents[j].perp * (side * (track.halfWidth - 5))
            kerbs.addLines(between: [CGPoint(a), CGPoint(b), CGPoint(b2), CGPoint(a2)])
            kerbs.closeSubpath()
        }
        self.kerbs = kerbs

        // Street lamps every 110 units, alternating sides, a little way off the road.
        var lamps: [CGPoint] = []
        var s = 0.0, side = 1.0
        while s < track.length - 50 {
            let pose = track.pose(atS: s)
            lamps.append(CGPoint(pose.point + pose.tangent.perp * (side * (track.halfWidth + 16))))
            s += 110
            side = -side
        }
        self.lamps = lamps

        let b = track.bounds
        let span = max(b.size.x, b.size.y)
        let mini = CGMutablePath()
        mini.addLines(between: track.points.enumerated().compactMap { i, p in
            i % 3 == 0 ? CGPoint(x: (p.x - b.min.x) / span, y: (p.y - b.min.y) / span) : nil
        })
        mini.closeSubpath()
        minimap = mini
        minimapAspect = CGFloat(b.size.x / b.size.y)

        let hue = CGFloat(track.hue)
        leftNeon = NSColor(hue: hue, saturation: 0.82, brightness: 1, alpha: 1)
        rightNeon = NSColor(hue: (hue + 0.47).truncatingRemainder(dividingBy: 1), saturation: 0.78, brightness: 1, alpha: 1)
    }
}

extension CGPoint {
    init(_ v: Vec2) { self.init(x: v.x, y: v.y) }
}

extension NSColor {
    convenience init(_ paint: Paint) {
        self.init(srgbRed: paint.red, green: paint.green, blue: paint.blue, alpha: 1)
    }
}
