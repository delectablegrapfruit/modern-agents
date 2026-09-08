import AppKit
import SwiftUI
import BooksCore

/// Placing a cover by hand: the picture is dragged to move it, its corners to size it (keeping its shape), its
/// sides to stretch it one way. The box is outlined; what lies outside it is dimmed and will be cropped.
struct CoverEditor: View {
    let image: NSImage
    @Binding var frame: CoverFrame
    let box: CGSize
    var margin: CGFloat = 40
    @State private var start: CoverFrame?

    private enum Handle: CaseIterable {
        case topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left

        var isCorner: Bool { [.topLeft, .topRight, .bottomRight, .bottomLeft].contains(self) }

        /// Which way each edge moves: -1 the near edge (left or top), +1 the far one, 0 not at all.
        var sx: Double {
            switch self {
            case .topLeft, .left, .bottomLeft: return -1
            case .topRight, .right, .bottomRight: return 1
            case .top, .bottom: return 0
            }
        }
        var sy: Double {
            switch self {
            case .topLeft, .top, .topRight: return -1
            case .bottomLeft, .bottom, .bottomRight: return 1
            case .left, .right: return 0
            }
        }

        func point(in rect: CGRect) -> CGPoint {
            CGPoint(x: rect.midX + CGFloat(sx) * rect.width / 2, y: rect.midY + CGFloat(sy) * rect.height / 2)
        }
    }

    var body: some View {
        let area = CGSize(width: box.width + 2 * margin, height: box.height + 2 * margin)
        let boxRect = CGRect(x: margin, y: margin, width: box.width, height: box.height)
        let inBox = CoverLayout.rect(frame: frame, box: box)
        let rect = inBox.offsetBy(dx: boxRect.minX, dy: boxRect.minY)
        ZStack(alignment: .topLeading) {
            Color.black.opacity(0.82)
            // The whole picture, dimmed; then the part inside the box, bright.
            picture(rect).opacity(0.35)
            ZStack(alignment: .topLeading) {
                picture(inBox)
            }
            .frame(width: box.width, height: box.height)
            .clipped()
            .position(x: boxRect.midX, y: boxRect.midY)
            Rectangle()
                .strokeBorder(.white.opacity(0.9), lineWidth: 1)
                .frame(width: box.width, height: box.height)
                .position(x: boxRect.midX, y: boxRect.midY)
                .allowsHitTesting(false)
            // Dragging the picture moves it.
            Rectangle()
                .fill(Color.white.opacity(0.001))
                .frame(width: max(8, rect.width), height: max(8, rect.height))
                .position(x: rect.midX, y: rect.midY)
                .gesture(drag { s, t in
                    var f = s
                    f.x = s.x + Double(t.width / box.width)
                    f.y = s.y + Double(t.height / box.height)
                    return f
                })
            ForEach(Handle.allCases, id: \.self) { handle in
                let point = handle.point(in: rect)
                Circle()
                    .fill(.white)
                    .overlay(Circle().strokeBorder(.black.opacity(0.45), lineWidth: 1))
                    .frame(width: handle.isCorner ? 12 : 10, height: handle.isCorner ? 12 : 10)
                    .shadow(radius: 1.5)
                    .contentShape(Circle().inset(by: -6))
                    .position(x: min(max(point.x, 6), area.width - 6), y: min(max(point.y, 6), area.height - 6))
                    .gesture(drag { s, t in resize(s, by: t, handle: handle) })
                    .help(handle.isCorner ? "Drag to size the picture" : "Drag to stretch the picture")
            }
        }
        .frame(width: area.width, height: area.height)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func picture(_ rect: CGRect) -> some View {
        Image(nsImage: image)
            .resizable()
            .frame(width: max(1, rect.width), height: max(1, rect.height))
            .position(x: rect.midX, y: rect.midY)
    }

    private func drag(_ transform: @escaping (CoverFrame, CGSize) -> CoverFrame) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .local)
            .onChanged { value in
                if start == nil { start = frame }
                guard let s = start else { return }
                frame = CoverLayout.clamped(transform(s, value.translation))
            }
            .onEnded { _ in start = nil }
    }

    /// A corner keeps the picture's shape, sizing about the opposite corner; a side moves alone.
    private func resize(_ s: CoverFrame, by t: CGSize, handle: Handle) -> CoverFrame {
        var f = s
        let dx = Double(t.width / box.width), dy = Double(t.height / box.height)
        if handle.isCorner {
            let kx = (s.width + handle.sx * dx) / s.width, ky = (s.height + handle.sy * dy) / s.height
            let k = max(0.05, (kx + ky) / 2)
            f.width = s.width * k
            f.height = s.height * k
            if handle.sx < 0 { f.x = s.x + s.width - f.width }
            if handle.sy < 0 { f.y = s.y + s.height - f.height }
        } else if handle.sx < 0 {
            f.width = max(0.1, s.width - dx)
            f.x = s.x + s.width - f.width
        } else if handle.sx > 0 {
            f.width = max(0.1, s.width + dx)
        } else if handle.sy < 0 {
            f.height = max(0.1, s.height - dy)
            f.y = s.y + s.height - f.height
        } else {
            f.height = max(0.1, s.height + dy)
        }
        return f
    }
}
