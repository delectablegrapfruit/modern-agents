import AppKit
import PDFKit
import BooksCore

/// The panels of a comic, page by page, found once off the main thread and kept beside the PDF.
struct ComicPreparation: Codable, Sendable {
    static let currentVersion = 2

    /// A panel: where it is on the page and, when it is not simply its rectangle (a slanted panel, one with a
    /// balloon spilling out of it, one a neighbour's balloon spills into), its shape.
    struct Panel: Codable, Sendable {
        /// The panel's box in display space (page points, origin at the bottom left).
        let rect: CGRect
        /// The shape, when it is not the box: one entry per row of the analysis rendering, top row first, as
        /// `[row, start, end, start, end, …]` in that rendering's pixels. Rows without ink of this panel are absent.
        let runs: [[Int]]?
    }

    struct Page: Codable, Sendable {
        let size: CGSize
        /// The analysis rendering's pixel size — the scale of `Panel.runs`.
        let width: Int
        let height: Int
        /// The gutters' luminance, 0–255.
        let background: Int
        /// The panels in reading order, left to right within a row.
        let panels: [Panel]
        /// The same panels in the order read right to left, as indices into `panels`.
        let rightToLeft: [Int]
    }

    var version = ComicPreparation.currentVersion
    let pages: [Page]
    /// The detector model that steered the analysis, when one did.
    var detector: String? = nil

    /// Beside the PDF; the analysis with a detector model is kept apart from the one without.
    static func cacheURL(for pdf: URL, detector: Bool) -> URL {
        pdf.deletingLastPathComponent().appendingPathComponent(detector ? "comic-v\(currentVersion)-model.json" : "comic-v\(currentVersion).json")
    }
}

/// Finds the panels of comic pages, whatever their shape.
///
/// A page is rendered small and the colour of its border taken as the colour of the gutters. Everything the gutter
/// colour can reach from the page's edge without crossing ink is gutter; the rest — frames, what they enclose, and the
/// art and lettering attached to them — is panel material. That material is cut recursively along the bands that
/// cross it: rows first, then columns, then rows again within what those cuts leave. A band may be bridged by a
/// balloon or a figure spilling from one panel into the next; the cut still happens there, and the bridging thing
/// goes whole to the panel it reaches farther into — where it originates — and is taken out of the other one, so
/// the two are shown apart. What no straight band separates is looked at as connected shapes: two or more dense
/// closed shapes filling a region are panels a slanted or curved gutter divides, each kept in its own outline.
/// Small pieces (a caption beside a frame, a sound effect in the gutter) join the nearest panel; only page-number
/// sized strays far from every panel are left out. A page without gutters is one panel.
enum ComicAnalysis {
    /// The analysis, from the cache beside the PDF when that is newer than the PDF, else made and cached. With a
    /// detector, its boxes steer the analysis page by page.
    nonisolated static func prepare(url: URL, detector: PanelDetector? = nil) -> ComicPreparation? {
        let cache = ComicPreparation.cacheURL(for: url, detector: detector != nil)
        let cachedDate = try? cache.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        let sourceDate = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        if let cachedDate, let sourceDate, cachedDate >= sourceDate, let data = try? Data(contentsOf: cache),
           let stored = try? JSONDecoder().decode(ComicPreparation.self, from: data), stored.version == ComicPreparation.currentVersion {
            return stored
        }
        guard let made = analyse(url: url, detector: detector) else { return nil }
        if let data = try? JSONEncoder().encode(made) { try? data.write(to: cache, options: .atomic) }
        return made
    }

    nonisolated static func analyse(url: URL, detector: PanelDetector? = nil) -> ComicPreparation? {
        guard let document = PDFDocument(url: url), document.pageCount > 0 else { return nil }
        var pages: [ComicPreparation.Page] = []
        for i in 0..<document.pageCount {
            guard let page = document.page(at: i) else {
                let size = CGSize(width: 612, height: 792)
                let whole = ComicPreparation.Panel(rect: CGRect(origin: .zero, size: size), runs: nil)
                pages.append(ComicPreparation.Page(size: size, width: 1, height: 1, background: 255, panels: [whole], rightToLeft: [0]))
                continue
            }
            let size = PDFPresenter.displaySize(of: page)
            let detections = detector?.detect(page: page, size: size) ?? []
            pages.append(analyse(page: page, size: size, detections: detections))
        }
        return ComicPreparation(pages: pages, detector: detector?.name)
    }

    // MARK: - Pixels

    /// A rectangle of the rendering in pixels: columns x0..<x1, rows y0..<y1, rows counted from the top.
    struct Region: Equatable {
        var x0: Int, x1: Int, y0: Int, y1: Int
        var width: Int { x1 - x0 }
        var height: Int { y1 - y0 }
        var area: Int { max(0, width) * max(0, height) }
        func union(_ o: Region) -> Region { Region(x0: min(x0, o.x0), x1: max(x1, o.x1), y0: min(y0, o.y0), y1: max(y1, o.y1)) }
        func intersection(_ o: Region) -> Region { Region(x0: max(x0, o.x0), x1: min(x1, o.x1), y0: max(y0, o.y0), y1: min(y1, o.y1)) }
        /// The distance between two boxes, zero when they touch or overlap.
        func gap(to o: Region) -> Double {
            let dx = max(0, max(x0, o.x0) - min(x1, o.x1)), dy = max(0, max(y0, o.y0) - min(y1, o.y1))
            return (Double(dx * dx + dy * dy)).squareRoot()
        }
    }

    /// A bitmap the size of the rendering.
    struct Mask {
        let width: Int, height: Int
        var bits: [Bool]

        init(width: Int, height: Int, fill: Bool = false) {
            self.width = width
            self.height = height
            bits = [Bool](repeating: fill, count: width * height)
        }

        subscript(x: Int, y: Int) -> Bool {
            get { bits[y * width + x] }
            set { bits[y * width + x] = newValue }
        }

        var count: Int { bits.reduce(0) { $0 + ($1 ? 1 : 0) } }

        func inverted() -> Mask { var m = self; for i in m.bits.indices { m.bits[i].toggle() }; return m }

        /// Grown by `r` pixels in every direction (a square), in a pass along the rows and one down the columns.
        func dilated(by r: Int = 1) -> Mask {
            var across = Mask(width: width, height: height)
            for y in 0..<height {
                let row = y * width
                for (s, e) in runs(row: y, from: 0, to: width) {
                    for x in max(0, s - r)..<min(width, e + r) { across.bits[row + x] = true }
                }
            }
            var out = Mask(width: width, height: height)
            for x in 0..<width {
                for (s, e) in across.runs(column: x, from: 0, to: height) {
                    for y in max(0, s - r)..<min(height, e + r) { out.bits[y * width + x] = true }
                }
            }
            return out
        }

        /// The box of the set pixels within a region (the whole mask when nil).
        func bounds(in region: Region? = nil) -> Region? {
            let r = region ?? Region(x0: 0, x1: width, y0: 0, y1: height)
            var x0 = Int.max, x1 = Int.min, y0 = Int.max, y1 = Int.min
            for y in max(0, r.y0)..<min(height, r.y1) {
                let row = y * width
                for x in max(0, r.x0)..<min(width, r.x1) where bits[row + x] {
                    if x < x0 { x0 = x }
                    if x + 1 > x1 { x1 = x + 1 }
                    if y < y0 { y0 = y }
                    y1 = y + 1
                }
            }
            return x0 == Int.max ? nil : Region(x0: x0, x1: x1, y0: y0, y1: y1)
        }

        func count(in r: Region) -> Int {
            var n = 0
            for y in max(0, r.y0)..<min(height, r.y1) {
                let row = y * width
                for x in max(0, r.x0)..<min(width, r.x1) where bits[row + x] { n += 1 }
            }
            return n
        }

        mutating func formUnion(_ o: Mask) { for i in bits.indices where o.bits[i] { bits[i] = true } }
        mutating func subtract(_ o: Mask) { for i in bits.indices where o.bits[i] { bits[i] = false } }
        mutating func formIntersection(_ o: Mask) { for i in bits.indices where !o.bits[i] { bits[i] = false } }

        mutating func fill(_ r: Region, _ value: Bool = true) {
            for y in max(0, r.y0)..<min(height, r.y1) {
                let row = y * width
                for x in max(0, r.x0)..<min(width, r.x1) { bits[row + x] = value }
            }
        }

        /// The set pixels of a row within columns, as runs.
        func runs(row y: Int, from x0: Int, to x1: Int) -> [(Int, Int)] {
            var out: [(Int, Int)] = []
            let row = y * width
            var x = x0
            while x < x1 {
                if bits[row + x] {
                    let start = x
                    while x < x1, bits[row + x] { x += 1 }
                    out.append((start, x))
                } else {
                    x += 1
                }
            }
            return out
        }

        /// The set pixels of a column within rows, as runs.
        func runs(column x: Int, from y0: Int, to y1: Int) -> [(Int, Int)] {
            var out: [(Int, Int)] = []
            var y = y0
            while y < y1 {
                if bits[y * width + x] {
                    let start = y
                    while y < y1, bits[y * width + x] { y += 1 }
                    out.append((start, y))
                } else {
                    y += 1
                }
            }
            return out
        }
    }

    /// The connected pieces of a mask within a region: a label per pixel (-1 outside the pieces) and the pieces'
    /// pixel counts and boxes. Pieces touch along edges, or also at corners when `eight` is set.
    struct Components {
        var labels: [Int32]
        var count: Int
        var areas: [Int]
        var boxes: [Region]

        init(of mask: Mask, in region: Region? = nil, eight: Bool) {
            let w = mask.width, h = mask.height
            let r = region ?? Region(x0: 0, x1: w, y0: 0, y1: h)
            var raw = [Int32](repeating: -1, count: w * h)
            var parent: [Int32] = []
            func find(_ a: Int32) -> Int32 {
                var a = a
                while parent[Int(a)] != a {
                    parent[Int(a)] = parent[Int(parent[Int(a)])]
                    a = parent[Int(a)]
                }
                return a
            }
            func union(_ a: Int32, _ b: Int32) {
                let ra = find(a), rb = find(b)
                if ra != rb { if ra < rb { parent[Int(rb)] = ra } else { parent[Int(ra)] = rb } }
            }
            var previous: [(x0: Int, x1: Int, label: Int32)] = []
            let reach = eight ? 1 : 0
            for y in max(0, r.y0)..<min(h, r.y1) {
                var current: [(x0: Int, x1: Int, label: Int32)] = []
                for (x0, x1) in mask.runs(row: y, from: max(0, r.x0), to: min(w, r.x1)) {
                    let label = Int32(parent.count)
                    parent.append(label)
                    for p in previous where p.x1 > x0 - reach && p.x0 < x1 + reach { union(label, p.label) }
                    current.append((x0, x1, label))
                    let row = y * w
                    for x in x0..<x1 { raw[row + x] = label }
                }
                previous = current
            }
            // Compact the labels to 0..<count.
            var compact = [Int32](repeating: -1, count: parent.count)
            var n: Int32 = 0
            for i in 0..<parent.count {
                let root = find(Int32(i))
                if compact[Int(root)] < 0 { compact[Int(root)] = n; n += 1 }
                compact[i] = compact[Int(root)]
            }
            var areas = [Int](repeating: 0, count: Int(n))
            var boxes = [Region](repeating: Region(x0: Int.max, x1: Int.min, y0: Int.max, y1: Int.min), count: Int(n))
            for y in max(0, r.y0)..<min(h, r.y1) {
                let row = y * w
                for x in max(0, r.x0)..<min(w, r.x1) where raw[row + x] >= 0 {
                    let c = Int(compact[Int(raw[row + x])])
                    raw[row + x] = Int32(c)
                    areas[c] += 1
                    boxes[c].x0 = min(boxes[c].x0, x)
                    boxes[c].x1 = max(boxes[c].x1, x + 1)
                    boxes[c].y0 = min(boxes[c].y0, y)
                    boxes[c].y1 = max(boxes[c].y1, y + 1)
                }
            }
            self.labels = raw
            self.count = Int(n)
            self.areas = areas
            self.boxes = boxes
        }

        func label(x: Int, y: Int, width: Int) -> Int { Int(labels[y * width + x]) }

        /// The pixels of one piece.
        func mask(of piece: Int, width: Int, height: Int) -> Mask {
            var m = Mask(width: width, height: height)
            for i in m.bits.indices where labels[i] == Int32(piece) { m.bits[i] = true }
            return m
        }
    }

    /// The page rendered `width` pixels across, as luminance, top row first.
    nonisolated static func render(_ page: PDFPage, size: CGSize, width: Int) -> (width: Int, height: Int, luminance: [UInt8])? {
        let height = max(1, Int((CGFloat(width) * size.height / size.width).rounded()))
        let image = page.thumbnail(of: NSSize(width: width, height: height), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), rep.bitsPerSample == 8, !rep.isPlanar, let data = rep.bitmapData else { return nil }
        let w = rep.pixelsWide, h = rep.pixelsHigh, spp = rep.samplesPerPixel, rowBytes = rep.bytesPerRow
        let alphaFirst = rep.bitmapFormat.contains(.alphaFirst)
        let colorOffset = alphaFirst && rep.hasAlpha ? 1 : 0
        var luminance = [UInt8](repeating: 255, count: w * h)
        for y in 0..<h {
            let rowStart = data + y * rowBytes
            for x in 0..<w {
                let p = rowStart + x * spp
                let value: Int
                if spp - (rep.hasAlpha ? 1 : 0) >= 3 {
                    value = (Int(p[colorOffset]) * 299 + Int(p[colorOffset + 1]) * 587 + Int(p[colorOffset + 2]) * 114) / 1000
                } else {
                    value = Int(p[colorOffset])
                }
                let alpha = rep.hasAlpha ? Int(p[alphaFirst ? 0 : spp - 1]) : 255
                luminance[y * w + x] = UInt8(alpha < 40 ? 255 : min(255, max(0, value)))
            }
        }
        return (w, h, luminance)
    }

    // MARK: - Panels

    /// A panel while the page is analysed: its box and, once it is not simply its box, its pixels.
    private struct WorkPanel {
        var box: Region
        var mask: Mask?
        func pixels(width: Int, height: Int) -> Mask {
            if let mask { return mask }
            var m = Mask(width: width, height: height)
            m.fill(box)
            return m
        }
    }

    private indirect enum Node {
        case leaf([Int])
        case cut(horizontal: Bool, children: [Node])

        var panels: [Int] {
            switch self {
            case .leaf(let p): return p
            case .cut(_, let children): return children.flatMap(\.panels)
            }
        }
    }

    /// Something crossing a cut — a balloon, a figure — that belongs to the panel on one side.
    private struct Transfer {
        let region: Region
        let toChild: Int
        let fromChild: Int
        let horizontal: Bool
    }

    /// The panels of one page, in reading order, from a rendering about 640 pixels across — and, when a detector
    /// model has looked at the page, from where its boxes say the panels and the text are.
    nonisolated static func analyse(page: PDFPage, size: CGSize, width analysisWidth: Int = 640, detections: [PanelDetector.Detection] = []) -> ComicPreparation.Page {
        let whole = ComicPreparation.Panel(rect: CGRect(origin: .zero, size: size), runs: nil)
        guard size.width > 0, size.height > 0, let grey = render(page, size: size, width: analysisWidth) else {
            return ComicPreparation.Page(size: size, width: 1, height: 1, background: 255, panels: [whole], rightToLeft: [0])
        }
        let w = grey.width, h = grey.height
        let lum = grey.luminance
        // The gutters' colour: the median of the page's border.
        var border: [UInt8] = []
        let frame = max(2, min(w, h) / 50)
        for y in 0..<h {
            let edgeRow = y < frame || y >= h - frame
            for x in 0..<w where edgeRow || x < frame || x >= w - frame { border.append(lum[y * w + x]) }
        }
        border.sort()
        let background = border.isEmpty ? 255 : Int(border[border.count / 2])
        let tolerance = (background >= 200 || background <= 55) ? 48 : 30
        var ink = Mask(width: w, height: h)
        for i in ink.bits.indices where abs(Int(lum[i]) - background) > tolerance { ink.bits[i] = true }
        let sealed = ink.dilated()
        // Gutter: what the background reaches from the page's edge without crossing ink.
        let open = Components(of: sealed.inverted(), eight: false)
        var touchesEdge = [Bool](repeating: false, count: open.count)
        for x in 0..<w {
            for y in [0, h - 1] { let l = open.label(x: x, y: y, width: w); if l >= 0 { touchesEdge[l] = true } }
        }
        for y in 0..<h {
            for x in [0, w - 1] { let l = open.label(x: x, y: y, width: w); if l >= 0 { touchesEdge[l] = true } }
        }
        var inside = Mask(width: w, height: h, fill: true)
        for i in inside.bits.indices { let l = open.labels[i]; if l >= 0, touchesEdge[Int(l)] { inside.bits[i] = false } }
        let minGutter = max(3, Int((Double(min(w, h)) * 0.006).rounded()))
        let wideGutter = max(minGutter, Int((Double(w) * 0.025).rounded()))
        let pageArea = w * h

        // Small pieces do not shape the layout; they join a panel at the end.
        let clustered = inside.dilated(by: max(2, Int((Double(w) * 0.008).rounded())))
        let clusters = Components(of: clustered, eight: true)
        var clusterBoxes = [Region?](repeating: nil, count: clusters.count)
        for y in 0..<h {
            let row = y * w
            for x in 0..<w where inside.bits[row + x] {
                let l = Int(clusters.labels[row + x])
                guard l >= 0 else { continue }
                let pixel = Region(x0: x, x1: x + 1, y0: y, y1: y + 1)
                clusterBoxes[l] = clusterBoxes[l].map { $0.union(pixel) } ?? pixel
            }
        }
        var smallCluster = [Bool](repeating: false, count: clusters.count)
        for c in 0..<clusters.count where (clusterBoxes[c]?.area ?? 0) < Int(0.006 * Double(pageArea)) { smallCluster[c] = true }
        var small = Mask(width: w, height: h)
        for i in small.bits.indices { let l = clusters.labels[i]; if l >= 0, smallCluster[Int(l)], inside.bits[i] { small.bits[i] = true } }
        var major = inside
        major.subtract(small)
        // Background within drawn outlines — the insides of balloons.
        var enclosed = ink.inverted()
        enclosed.formIntersection(inside)

        func finish(_ panels: [WorkPanel], leftToRight: [Int], rightToLeft: [Int]) -> ComicPreparation.Page {
            let columnWidth = size.width / CGFloat(w), rowHeight = size.height / CGFloat(h)
            func made(_ p: WorkPanel) -> ComicPreparation.Panel {
                let b = p.box
                let rect = CGRect(x: CGFloat(b.x0) * columnWidth, y: size.height - CGFloat(b.y1) * rowHeight, width: CGFloat(b.width) * columnWidth, height: CGFloat(b.height) * rowHeight)
                guard let mask = p.mask, mask.count(in: b) < b.area else { return ComicPreparation.Panel(rect: rect, runs: nil) }
                var runs: [[Int]] = []
                for y in b.y0..<b.y1 {
                    let row = mask.runs(row: y, from: b.x0, to: b.x1)
                    guard !row.isEmpty else { continue }
                    var entry = [y]
                    for (s, e) in row { entry.append(s); entry.append(e) }
                    runs.append(entry)
                }
                return ComicPreparation.Panel(rect: rect, runs: runs)
            }
            let ordered = leftToRight.map { made(panels[$0]) }
            var position = [Int: Int]()
            for (i, p) in leftToRight.enumerated() { position[p] = i }
            return ComicPreparation.Page(size: size, width: w, height: h, background: background, panels: ordered, rightToLeft: rightToLeft.compactMap { position[$0] })
        }

        /// Reading order of boxes: rows top to bottom (a box joins a row it overlaps by more than half the smaller
        /// height), within a row left to right or right to left, a column of boxes top to bottom.
        func rowOrder(_ ids: [Int], boxes: [Region], rightToLeft: Bool) -> [Int] {
            let mine = ids.sorted { boxes[$0].y0 < boxes[$1].y0 }
            var rows: [[Int]] = []
            for id in mine {
                let b = boxes[id]
                if let row = rows.indices.first(where: { row in
                    let top = rows[row].map { boxes[$0].y0 }.min()!, bottom = rows[row].map { boxes[$0].y1 }.max()!
                    let overlap = min(bottom, b.y1) - max(top, b.y0)
                    return overlap * 2 > min(bottom - top, b.height)
                }) {
                    rows[row].append(id)
                } else {
                    rows.append([id])
                }
            }
            rows.sort { boxes[$0[0]].y0 < boxes[$1[0]].y0 }
            return rows.flatMap { row in
                row.sorted { a, b in
                    let x = boxes[a].x0, y = boxes[b].x0
                    if x == y { return boxes[a].y0 < boxes[b].y0 }
                    return rightToLeft ? x > y : x < y
                }
            }
        }

        // With a detector's boxes the panels are where it says. Every inked pixel goes to the panel box it lies in
        // (the smallest, for an inset); a piece reaching outside every box goes with the box holding most of it;
        // what a text box covers goes to the panel that box belongs to, so a balloon spilling into a neighbour
        // stays with its own panel and is taken out of the other. Ink no box touches is a panel the detector missed.
        let columnWidth = size.width / CGFloat(w), rowHeight = size.height / CGFloat(h)
        func region(of rect: CGRect, pad: Int) -> Region {
            let x0 = Int((rect.minX / columnWidth).rounded(.down)) - pad, x1 = Int((rect.maxX / columnWidth).rounded(.up)) + pad
            let y0 = Int(((size.height - rect.maxY) / rowHeight).rounded(.down)) - pad, y1 = Int(((size.height - rect.minY) / rowHeight).rounded(.up)) + pad
            return Region(x0: max(0, min(w, x0)), x1: max(0, min(w, x1)), y0: max(0, min(h, y0)), y1: max(0, min(h, y1)))
        }
        let panelDetections: [(box: Region, mask: PanelDetector.Mask?)] = detections.filter { $0.kind == .panel && $0.confidence >= 0.25 }.compactMap {
            let box = region(of: $0.rect, pad: max(2, w / 100))
            return box.area > 0 ? (box, $0.mask) : nil
        }
        let panelBoxes = panelDetections.map(\.box)
        if !panelBoxes.isEmpty {
            let textBoxes = detections.filter { $0.kind == .text && $0.confidence >= 0.25 }.map { region(of: $0.rect, pad: 2) }.filter { $0.area > 0 }
            var owner = [Int32](repeating: -1, count: w * h)
            let byArea = panelBoxes.indices.sorted(by: { panelBoxes[$0].area > panelBoxes[$1].area })
            for b in byArea {
                let r = panelBoxes[b]
                for y in r.y0..<r.y1 {
                    let row = y * w
                    for x in r.x0..<r.x1 where inside.bits[row + x] { owner[row + x] = Int32(b) }
                }
            }
            // A segmentation model's own shapes decide where boxes overlap: a pixel under a mask goes to that panel
            // (the smallest, where masks overlap too); the box alone decides only where no mask reaches.
            var byMask = [Int32](repeating: -1, count: w * h)
            for b in byArea {
                guard let mask = panelDetections[b].mask else { continue }
                let r = panelBoxes[b]
                for y in r.y0..<r.y1 {
                    let row = y * w
                    let ny = (Double(y) + 0.5) / Double(h)
                    for x in r.x0..<r.x1 where inside.bits[row + x] && mask.covers(x: (Double(x) + 0.5) / Double(w), y: ny) { byMask[row + x] = Int32(b) }
                }
            }
            for i in 0..<(w * h) where byMask[i] >= 0 { owner[i] = byMask[i] }
            let pieces = Components(of: inside, eight: true)
            var votes = [[Int]](repeating: [Int](repeating: 0, count: panelBoxes.count), count: pieces.count)
            for i in 0..<(w * h) {
                let l = pieces.labels[i]
                if l >= 0, owner[i] >= 0 { votes[Int(l)][Int(owner[i])] += 1 }
            }
            var pieceOwner = [Int](repeating: -1, count: pieces.count)
            var missed: [Int] = []
            for k in 0..<pieces.count {
                if let best = votes[k].indices.max(by: { votes[k][$0] < votes[k][$1] }), votes[k][best] > 0 { pieceOwner[k] = best } else { missed.append(k) }
            }
            for i in 0..<(w * h) {
                let l = pieces.labels[i]
                if l >= 0, owner[i] < 0, pieceOwner[Int(l)] >= 0 { owner[i] = Int32(pieceOwner[Int(l)]) }
            }
            for t in textBoxes {
                let cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2
                var home = panelBoxes.indices.filter { let b = panelBoxes[$0]; return cx >= b.x0 && cx < b.x1 && cy >= b.y0 && cy < b.y1 }.min { panelBoxes[$0].area < panelBoxes[$1].area }
                if home == nil, let most = panelBoxes.indices.max(by: { panelBoxes[$0].intersection(t).area < panelBoxes[$1].intersection(t).area }), panelBoxes[most].intersection(t).area > 0 { home = most }
                if home == nil { home = panelBoxes.indices.min { panelBoxes[$0].gap(to: t) < panelBoxes[$1].gap(to: t) } }
                guard let home else { continue }
                for y in t.y0..<t.y1 {
                    let row = y * w
                    for x in t.x0..<t.x1 where inside.bits[row + x] { owner[row + x] = Int32(home) }
                }
            }
            var found: [WorkPanel] = []
            for b in panelBoxes.indices {
                var mask = Mask(width: w, height: h)
                var count = 0
                for i in 0..<(w * h) where owner[i] == Int32(b) { mask.bits[i] = true; count += 1 }
                guard count > 0, let bounds = mask.bounds() else { continue }
                if count * 10 < panelBoxes[b].area * 4 {
                    // Sparse — borderless art, or a panel the analysis reads as gutter: the box itself, less what other panels own.
                    var box = Mask(width: w, height: h)
                    box.fill(panelBoxes[b])
                    for i in 0..<(w * h) where owner[i] >= 0 && owner[i] != Int32(b) { box.bits[i] = false }
                    found.append(WorkPanel(box: panelBoxes[b], mask: box))
                } else {
                    found.append(WorkPanel(box: bounds, mask: mask))
                }
            }
            func substantial(_ k: Int) -> Bool { pieces.areas[k] >= Int(0.006 * Double(pageArea)) && pieces.boxes[k].width >= w * 3 / 100 && pieces.boxes[k].height >= h * 3 / 100 }
            for k in missed where substantial(k) { found.append(WorkPanel(box: pieces.boxes[k], mask: pieces.mask(of: k, width: w, height: h))) }
            if !found.isEmpty {
                // Small pieces no box touched join the nearest panel; page-number-sized ones far from every panel are left out.
                var home = [Int](repeating: -1, count: pieces.count)
                for k in missed where !substantial(k) {
                    let box = pieces.boxes[k]
                    guard let nearest = found.indices.min(by: { found[$0].box.gap(to: box) < found[$1].box.gap(to: box) }) else { continue }
                    if box.area < Int(0.002 * Double(pageArea)), found[nearest].box.gap(to: box) > Double(w) * 0.015 { continue }
                    home[k] = nearest
                    found[nearest].box = found[nearest].box.union(box)
                }
                for i in 0..<(w * h) {
                    let l = pieces.labels[i]
                    if l >= 0, home[Int(l)] >= 0 { found[home[Int(l)]].mask?.bits[i] = true }
                }
                let ids = Array(found.indices), boxes = found.map(\.box)
                return finish(found, leftToRight: rowOrder(ids, boxes: boxes, rightToLeft: false), rightToLeft: rowOrder(ids, boxes: boxes, rightToLeft: true))
            }
        }

        guard let content = major.bounds() else {
            let box = inside.bounds() ?? Region(x0: 0, x1: w, y0: 0, y1: h)
            return finish([WorkPanel(box: box, mask: nil)], leftToRight: [0], rightToLeft: [0])
        }

        func trim(_ r: Region) -> Region? { r.width > 0 && r.height > 0 ? major.bounds(in: r) : nil }
        func substantial(_ r: Region) -> Bool { r.area >= Int(0.015 * Double(pageArea)) && r.width >= w * 3 / 100 && r.height >= h * 3 / 100 }
        func density(_ r: Region) -> Double { Double(major.count(in: r)) / Double(max(1, r.area)) }

        /// The region cut along the blank — or merely bridged — bands that cross it.
        func cut(_ r: Region, horizontal: Bool) -> (children: [Region?], transfers: [Transfer])? {
            let length = horizontal ? r.height : r.width
            let span = horizontal ? r.width : r.height
            guard length > minGutter * 3, span > 0 else { return nil }
            let blankMax = max(1, span / 200)
            // 0 solid, 1 clear, 2 bridged by at most two things covering no more than half the line.
            var status = [Int](repeating: 0, count: length)
            var lineRuns = [[(Int, Int)]](repeating: [], count: length)
            for i in 0..<length {
                let runs = horizontal ? major.runs(row: r.y0 + i, from: r.x0, to: r.x1) : major.runs(column: r.x0 + i, from: r.y0, to: r.y1)
                let count = runs.reduce(0) { $0 + $1.1 - $1.0 }
                if count <= blankMax { status[i] = 1; continue }
                lineRuns[i] = runs.map { ($0.0 - (horizontal ? r.x0 : r.y0), $0.1 - (horizontal ? r.x0 : r.y0)) }
                status[i] = (count * 2 <= span && runs.count <= 2) ? 2 : 0
            }
            var bands: [(Int, Int)] = []
            var i = 0
            while i < length {
                if status[i] != 0 {
                    let start = i
                    while i < length, status[i] != 0 { i += 1 }
                    if start > 0, i < length, i - start >= minGutter { bands.append((start, i)) }
                } else {
                    i += 1
                }
            }
            guard !bands.isEmpty else { return nil }
            func sub(_ from: Int, _ to: Int) -> Region { horizontal ? Region(x0: r.x0, x1: r.x1, y0: r.y0 + from, y1: r.y0 + to) : Region(x0: r.x0 + from, x1: r.x0 + to, y0: r.y0, y1: r.y1) }
            var cuts: [Int] = []
            var previous = 0
            for (s, e) in bands {
                guard let before = trim(sub(previous, s)), let after = trim(sub(e, length)) else { continue }
                guard substantial(before), substantial(after) else { continue }
                // Beside sparse (borderless) art only a wide band is a gutter; drawings have gaps of their own.
                let sparse = density(before) < 0.6 || density(after) < 0.6
                if sparse, e - s < wideGutter { continue }
                cuts.append((s + e) / 2)
                previous = e
            }
            guard !cuts.isEmpty else { return nil }
            var children: [Region?] = []
            var from = 0
            for c in cuts + [length] {
                children.append(trim(sub(from, c)))
                from = c
            }
            guard children.compactMap({ $0 }).count >= 2 else { return nil }
            var transfers: [Transfer] = []
            var pieces: Components?
            for (ci, c) in cuts.enumerated() {
                for (u, v) in lineRuns[c] {
                    // How far the bridging thing reaches to each side: for a balloon, its interior (the largest
                    // enclosed background piece the line crosses) and outline; for solid art, its sealed ink.
                    var before = 0, after = 0
                    var along = (u, v)
                    if pieces == nil { pieces = Components(of: enclosed, in: r, eight: true) }
                    var mine = -1
                    if let pieces {
                        for k in u..<v {
                            let l = pieces.label(x: horizontal ? r.x0 + k : r.x0 + c, y: horizontal ? r.y0 + c : r.y0 + k, width: w)
                            if l >= 0, mine < 0 || pieces.areas[l] > pieces.areas[mine] { mine = l }
                        }
                    }
                    if let pieces, mine >= 0, pieces.areas[mine] >= minGutter * minGutter {
                        var blob = pieces.mask(of: mine, width: w, height: h).dilated()
                        blob.formIntersection(major)
                        if let b = blob.bounds(in: r) {
                            before = horizontal ? c - (b.y0 - r.y0) : c - (b.x0 - r.x0)
                            after = horizontal ? (b.y1 - r.y0) - c : (b.x1 - r.x0) - c
                            along = horizontal ? (b.x0 - r.x0, b.x1 - r.x0) : (b.y0 - r.y0, b.y1 - r.y0)
                        }
                    } else {
                        for k in u..<v {
                            var a = 0, d = 0
                            if horizontal {
                                while c - 1 - a >= 0, sealed[r.x0 + k, r.y0 + c - 1 - a] { a += 1 }
                                while c + 1 + d < length, sealed[r.x0 + k, r.y0 + c + 1 + d] { d += 1 }
                            } else {
                                while c - 1 - a >= 0, sealed[r.x0 + c - 1 - a, r.y0 + k] { a += 1 }
                                while c + 1 + d < length, sealed[r.x0 + c + 1 + d, r.y0 + k] { d += 1 }
                            }
                            before = max(before, a)
                            after = max(after, d)
                        }
                    }
                    guard max(before, after) >= 3 * minGutter else { continue }
                    let originBefore = before >= after
                    let pad = 2
                    let lo = originBefore ? c : max(0, c - before - pad)
                    let hi = originBefore ? min(length, c + after + pad) : c
                    let cu = max(0, min(u, along.0) - pad), cv = min(span, max(v, along.1) + pad)
                    let region = horizontal ? Region(x0: r.x0 + cu, x1: r.x0 + cv, y0: r.y0 + lo, y1: r.y0 + hi) : Region(x0: r.x0 + lo, x1: r.x0 + hi, y0: r.y0 + cu, y1: r.y0 + cv)
                    transfers.append(Transfer(region: region, toChild: originBefore ? ci : ci + 1, fromChild: originBefore ? ci + 1 : ci, horizontal: horizontal))
                }
            }
            return (children, transfers)
        }

        var panels: [WorkPanel] = []

        /// One panel — or the bordered panels a slanted gutter separates: dense closed shapes together filling the leaf.
        func leaf(_ r: Region) -> Node {
            let pieces = Components(of: major, in: r, eight: true)
            var big: [Int] = []
            for k in 0..<pieces.count where pieces.areas[k] * 100 >= 15 * r.area && pieces.areas[k] * 100 >= 45 * pieces.boxes[k].area { big.append(k) }
            let coverage = big.reduce(0) { $0 + pieces.areas[$1] }
            guard big.count >= 2, coverage * 10 >= 7 * r.area else {
                panels.append(WorkPanel(box: r, mask: nil))
                return .leaf([panels.count - 1])
            }
            var made: [Int] = []
            for k in big {
                panels.append(WorkPanel(box: pieces.boxes[k], mask: pieces.mask(of: k, width: w, height: h)))
                made.append(panels.count - 1)
            }
            for k in 0..<pieces.count where !big.contains(k) {
                let box = pieces.boxes[k]
                guard let nearest = made.min(by: { panels[$0].box.gap(to: box) < panels[$1].box.gap(to: box) }), panels[nearest].box.gap(to: box) <= Double(w) * 0.04 else { continue }
                panels[nearest].mask?.formUnion(pieces.mask(of: k, width: w, height: h))
                panels[nearest].box = panels[nearest].box.union(box)
            }
            return .leaf(made)
        }

        func apply(_ t: Transfer, to toPanels: [Int], from fromPanels: [Int]) {
            guard !toPanels.isEmpty, !fromPanels.isEmpty else { return }
            func overlap(_ i: Int) -> Int {
                let b = panels[i].box
                return t.horizontal ? min(b.x1, t.region.x1) - max(b.x0, t.region.x0) : min(b.y1, t.region.y1) - max(b.y0, t.region.y0)
            }
            let to = toPanels.max { overlap($0) < overlap($1) }!, from = fromPanels.max { overlap($0) < overlap($1) }!
            var region = Mask(width: w, height: h)
            region.fill(t.region)
            var gained = region
            gained.formIntersection(inside)
            var toMask = panels[to].pixels(width: w, height: h)
            toMask.formUnion(gained)
            panels[to].mask = toMask
            if let gb = gained.bounds() { panels[to].box = panels[to].box.union(gb) }
            var fromMask = panels[from].pixels(width: w, height: h)
            fromMask.subtract(region)
            panels[from].mask = fromMask
            if let fb = fromMask.bounds() { panels[from].box = fb }
        }

        func node(for r: Region, rowsFirst: Bool, depth: Int) -> Node {
            if depth < 12 {
                for horizontal in [rowsFirst, !rowsFirst] {
                    guard let result = cut(r, horizontal: horizontal) else { continue }
                    let (children, transfers) = result
                    var nodes: [Node?] = []
                    var childPanels: [[Int]] = []
                    for child in children {
                        guard let child else { nodes.append(nil); childPanels.append([]); continue }
                        let n = node(for: child, rowsFirst: !horizontal, depth: depth + 1)
                        nodes.append(n)
                        childPanels.append(n.panels)
                    }
                    for t in transfers { apply(t, to: childPanels[t.toChild], from: childPanels[t.fromChild]) }
                    return .cut(horizontal: horizontal, children: nodes.compactMap { $0 })
                }
            }
            return leaf(r)
        }

        let root = node(for: content, rowsFirst: true, depth: 0)

        // Small pieces and panels too small to be panels join the nearest panel; only page-number-sized strays far
        // from every panel are left out.
        func isSmall(_ b: Region) -> Bool { b.area < Int(0.015 * Double(pageArea)) || b.width < w * 3 / 100 || b.height < h * 3 / 100 }
        var kept = Set(panels.indices.filter { !isSmall(panels[$0].box) })
        if kept.isEmpty { kept = Set(panels.indices) }
        func absorb(_ piece: Mask, _ box: Region) {
            guard let best = kept.min(by: { panels[$0].box.gap(to: box) < panels[$1].box.gap(to: box) }) else { return }
            let gap = panels[best].box.gap(to: box)
            if box.area < Int(0.002 * Double(pageArea)), gap > Double(w) * 0.015 { return }
            var m = panels[best].pixels(width: w, height: h)
            m.formUnion(piece)
            panels[best].mask = m
            panels[best].box = panels[best].box.union(box)
        }
        for i in panels.indices where !kept.contains(i) { absorb(panels[i].pixels(width: w, height: h), panels[i].box) }
        let strays = Components(of: small, eight: true)
        var home = [Int](repeating: -1, count: strays.count)
        for k in 0..<strays.count {
            let box = strays.boxes[k]
            guard let best = kept.min(by: { panels[$0].box.gap(to: box) < panels[$1].box.gap(to: box) }) else { continue }
            if box.area < Int(0.002 * Double(pageArea)), panels[best].box.gap(to: box) > Double(w) * 0.015 { continue }
            home[k] = best
            if panels[best].mask == nil { panels[best].mask = panels[best].pixels(width: w, height: h) }
            panels[best].box = panels[best].box.union(box)
        }
        for i in 0..<(w * h) {
            let l = Int(strays.labels[i])
            if l >= 0, home[l] >= 0 { panels[home[l]].mask?.bits[i] = true }
        }

        /// Reading order: rows top to bottom; within a row left to right, or right to left for manga.
        func order(_ n: Node, rightToLeft: Bool) -> [Int] {
            switch n {
            case .leaf(let ids):
                return rowOrder(ids.filter { kept.contains($0) }, boxes: panels.map(\.box), rightToLeft: rightToLeft)
            case .cut(let horizontal, let children):
                let kids = (!horizontal && rightToLeft) ? Array(children.reversed()) : children
                return kids.flatMap { order($0, rightToLeft: rightToLeft) }
            }
        }
        let leftToRight = order(root, rightToLeft: false), rightToLeftOrder = order(root, rightToLeft: true)
        guard !leftToRight.isEmpty else { return finish([WorkPanel(box: content, mask: nil)], leftToRight: [0], rightToLeft: [0]) }
        return finish(panels, leftToRight: leftToRight, rightToLeft: rightToLeftOrder)
    }
}
