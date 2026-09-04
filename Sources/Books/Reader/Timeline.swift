import SwiftUI
import BooksCore

/// The book as a line: chapter ticks, bookmark dots, the thumb where you are. Hover to see which page is under the
/// pointer; drag to scrub — the label follows the thumb and the bar stays put until the mouse is released.
struct Timeline: View {
    @Bindable var session: ReaderSession
    @State private var hoverFraction: Double?

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let current = session.previewFraction ?? session.position.fraction
            let span = max(1, session.layout.total - (session.layout.mode == .paginated ? 1 : 0))
            ZStack(alignment: .leading) {
                Capsule().fill(.primary.opacity(0.14)).frame(height: session.timelineDragging ? 7 : 5)
                Capsule().fill(Color.accentColor).frame(width: max(0, width * current), height: session.timelineDragging ? 7 : 5)
                ForEach(session.layout.chapters.filter { $0.pos > 0 && $0.pos < span }, id: \.self) { mark in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(.primary.opacity(0.35))
                        .frame(width: 2, height: 11)
                        .offset(x: width * CGFloat(mark.pos / span) - 1)
                }
                ForEach(session.layout.bookmarks, id: \.self) { mark in
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 6, height: 6)
                        .overlay(Circle().strokeBorder(.background, lineWidth: 1.5))
                        .offset(x: width * CGFloat(min(1, mark.pos / span)) - 3, y: -11)
                }
                Circle()
                    .fill(.white)
                    .frame(width: 16, height: 16)
                    .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                    .overlay(Circle().strokeBorder(.black.opacity(0.15), lineWidth: 0.5))
                    .scaleEffect(session.timelineDragging ? 1.15 : 1)
                    .offset(x: width * CGFloat(current) - 8)
            }
            .frame(height: 28)
            .contentShape(Rectangle())
            .overlay(alignment: .topLeading) {
                if let f = session.timelineDragging ? session.previewFraction : hoverFraction {
                    Text(label(at: f, span: span))
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .glassCapsule()
                        .fixedSize()
                        .offset(x: min(max(0, width * CGFloat(f) - 80), max(0, width - 160)), y: -34)
                        .allowsHitTesting(false)
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let f = min(1, max(0, value.location.x / max(width, 1)))
                        if !session.timelineDragging { session.timelineDragging = true }
                        session.previewFraction = f
                        session.goToFraction(f)
                    }
                    .onEnded { _ in
                        session.timelineDragging = false
                        session.previewFraction = nil
                    }
            )
            .onContinuousHover { phase in
                switch phase {
                case .active(let point): hoverFraction = min(1, max(0, point.x / max(width, 1)))
                case .ended: hoverFraction = nil
                }
            }
        }
        .frame(height: 28)
        .accessibilityLabel("Book position")
        .accessibilityValue("\(Int(session.position.percent)) percent")
    }

    private func label(at fraction: Double, span: Double) -> String {
        let pos = fraction * span
        let chapter = session.layout.chapters.last { $0.pos <= pos + 0.5 }?.label ?? ""
        let where_: String
        if session.layout.mode == .paginated {
            let page = Int(pos.rounded()) + 1
            where_ = "Page \(min(page, Int(session.layout.total))) of \(Int(session.layout.total))"
        } else {
            where_ = "\(Int((fraction * 100).rounded()))%"
        }
        return chapter.isEmpty ? where_ : where_ + " · " + chapter
    }
}
