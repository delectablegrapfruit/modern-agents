import Foundation

/// A cell of a realm's map: pointy-top hexagons in "odd-r" offset coordinates, odd rows sitting half a cell to the
/// right, so a map of `columns × rows` cells is a compact rectangle.
public struct Hex: Hashable, Codable, Sendable {
    public var col: Int
    public var row: Int

    public init(_ col: Int, _ row: Int) {
        self.col = col
        self.row = row
    }

    private static let evenRowSteps = [(1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1)]
    private static let oddRowSteps = [(1, 0), (1, -1), (0, -1), (-1, 0), (0, 1), (1, 1)]

    /// The six cells around this one (some may lie off the map).
    public var neighbors: [Hex] {
        (row & 1 == 0 ? Hex.evenRowSteps : Hex.oddRowSteps).map { Hex(col + $0.0, row + $0.1) }
    }

    /// Steps from this cell to another.
    public func distance(to other: Hex) -> Int {
        let a = axial, b = other.axial
        let dq = a.q - b.q, dr = a.r - b.r
        return (abs(dq) + abs(dr) + abs(dq + dr)) / 2
    }

    private var axial: (q: Int, r: Int) { (col - (row - (row & 1)) / 2, row) }

    /// Centre of the cell for hexagons of circumradius `radius`, the centre of cell (0, 0) being the origin; y grows
    /// downwards, row by row.
    public func center(radius: Double) -> (x: Double, y: Double) {
        (radius * 3.0.squareRoot() * (Double(col) + 0.5 * Double(row & 1)), radius * 1.5 * Double(row))
    }

    /// Width and height of a map of `columns × rows` cells, edge to edge.
    public static func mapSize(columns: Int, rows: Int, radius: Double) -> (width: Double, height: Double) {
        let width = radius * 3.0.squareRoot() * (Double(columns) + (rows > 1 ? 0.5 : 0))
        let height = radius * (1.5 * Double(max(rows, 1) - 1) + 2)
        return (width, height)
    }
}
