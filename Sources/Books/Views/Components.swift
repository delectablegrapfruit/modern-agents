import AppKit
import SwiftUI
import BooksCore

/// A book's cover in its box. The box is `width` wide and `height` high — 2:3 when a height is given, the
/// picture's own shape when fitted and none is — and the picture lies in it as the book's cover style says:
/// fitted (centred in the box), filling it, stretched to it, or where it was placed by hand. How it looks follows
/// Settings ▸ Covers unless the caller chooses: in colour, in shades of grey with the art intact, or as a plain
/// lettered cover in place of the art. The progress plate and the Finished badge sit on the part of the picture
/// that shows, and keep their colour whatever the covers look like.
struct CoverView: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    let width: CGFloat
    var height: CGFloat? = nil
    var badges = false
    /// Draw the reading progress on the cover; widgets and lists that show progress elsewhere turn it off.
    var showsProgress = true
    /// How the cover looks; nil follows Settings ▸ Covers. Get Info's editor passes `.color`.
    var appearance: CoverAppearance? = nil

    var body: some View {
        let _ = model.coverVersion
        let look = appearance ?? model.settings.coverAppearance
        let image: NSImage? = look == .textOnly ? nil : model.cover(for: book)
        let style = book.coverStyle ?? CoverStyle()
        let box = CGSize(width: width, height: height ?? CoverLayout.naturalHeight(image: image?.size, width: width, style: style))
        let rect = image.map { CoverLayout.rect(image: $0.size, box: box, style: style) } ?? CGRect(origin: .zero, size: box)
        let shown = rect.intersection(CGRect(origin: .zero, size: box))
        let radius = Design.Radius.cover(width: width)
        let corners = Design.rounded(radius)
        let saturation: Double = look == .monochrome ? 0 : 1
        ZStack(alignment: .topLeading) {
            if let image {
                // The picture is rounded itself as well as the box, so a fitted one that stops short of the box's
                // corners still has soft corners of its own.
                Image(nsImage: image)
                    .resizable()
                    .saturation(saturation)
                    .frame(width: rect.width, height: rect.height)
                    .clipShape(corners)
                    .position(x: rect.midX, y: rect.midY)
            } else {
                LetteredCoverArt(book: book, size: box, tone: look == .textOnly ? .paper : .slate, radius: radius)
                    .saturation(saturation)
            }
            if !shown.isNull, !shown.isEmpty {
                // A hairline round the picture keeps a white cover's edge on a light page and a black one's on a
                // dark page, where the shadow alone would let them run into the background.
                corners
                    .strokeBorder(Color.primary.opacity(0.1), lineWidth: Design.Stroke.hairline)
                    .frame(width: shown.width, height: shown.height)
                    .overlay(alignment: .bottom) {
                        if showsProgress, !book.isFinished, book.hasStarted {
                            CoverProgressPlate(value: book.progress, width: shown.width)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if badges, book.isFinished {
                            finishedSeal(on: shown.width)
                        }
                    }
                    .position(x: shown.midX, y: shown.midY)
            }
        }
        .frame(width: box.width, height: box.height)
        .clipShape(corners)
        .shadow(Design.Shadow.cover(width: width))
    }

    /// The Finished badge: the sidebar's Finished symbol, white on the accent inside a thin white ring, so it holds
    /// its shape on a blue cover as well as on a white one. It grows a little with the cover.
    private func finishedSeal(on width: CGFloat) -> some View {
        let size = min(20, max(14, (width * 0.12).rounded()))
        return Image(systemName: "checkmark.circle.fill")
            .font(.system(size: size, weight: .semibold))
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, Color.accentColor)
            .background(Circle().fill(Color.white).padding(-1.5))
            .shadow(Design.Shadow.glyph)
            .padding(max(Design.Space.xs, (width * 0.04).rounded()))
            .accessibilityLabel("Finished")
    }
}

/// A plain cover set in type: the title in a serif, a short rule and the author under it, inside a thin frame. On
/// paper — paper white in light mode, graphite in dark — it stands in for the art when covers are Text Only; on
/// slate it stands in for a book that has no picture. Below 44 points wide there is no room for words, so the
/// title's first letter stands alone in the frame, set the same way, and a list's thumbnails still match the grid.
struct LetteredCoverArt: View {
    enum Tone { case paper, slate }

    @Environment(\.colorScheme) private var scheme
    let book: Book
    let size: CGSize
    var tone: Tone = .paper
    /// The cover's corner radius, so the inner frame follows it.
    var radius: CGFloat = 0

    var body: some View {
        let w = size.width
        let ink = inkColor
        let frameInset = max(Design.Space.xxs, (w * 0.05).rounded())
        ZStack {
            LinearGradient(colors: paperColors, startPoint: .top, endPoint: .bottom)
            Design.rounded(max(1, radius - frameInset))
                .strokeBorder(ink.opacity(0.18), lineWidth: Design.Stroke.hairline)
                .padding(frameInset)
            if w < 44 {
                Text(initial)
                    .font(.system(size: (w * 0.5).rounded(), weight: .semibold, design: .serif))
                    .foregroundStyle(ink)
            } else {
                VStack(spacing: (w * 0.06).rounded()) {
                    Text(book.title)
                        .font(.system(size: min(26, max(9, (w * 0.115).rounded())), weight: .semibold, design: .serif))
                        .multilineTextAlignment(.center)
                        .lineLimit(5)
                        .minimumScaleFactor(0.6)
                    Rectangle()
                        .fill(ink.opacity(0.35))
                        .frame(width: (w * 0.18).rounded(), height: 1)
                    if !book.author.isEmpty {
                        Text(book.author)
                            .font(.system(size: min(15, max(7, (w * 0.07).rounded())), design: .serif))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .opacity(0.7)
                    }
                }
                .foregroundStyle(ink)
                .padding(.horizontal, (w * 0.12).rounded())
                .offset(y: -(size.height * 0.04).rounded())
            }
        }
        .frame(width: size.width, height: size.height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(book.author.isEmpty ? book.title : "\(book.title), \(book.author)")
    }

    private var initial: String {
        book.title.first.map { String($0).uppercased() } ?? ""
    }

    private var paperColors: [Color] {
        switch tone {
        case .paper:
            if scheme == .dark { return [Self.rgb(44, 44, 46), Self.rgb(31, 31, 33)] }
            return [Self.rgb(244, 244, 242), Self.rgb(231, 231, 228)]
        case .slate:
            return [Color(nsColor: .systemGray).opacity(0.7), Color(nsColor: .systemGray)]
        }
    }

    private var inkColor: Color {
        switch tone {
        case .paper:
            return scheme == .dark ? Self.rgb(242, 242, 247) : Self.rgb(29, 29, 31)
        case .slate:
            return .white
        }
    }

    /// A colour from 0–255 components, kept out of the expressions above so each stays quick to type-check.
    private static func rgb(_ red: Double, _ green: Double, _ blue: Double) -> Color {
        Color(red: red / 255, green: green / 255, blue: blue / 255)
    }
}

/// Reading progress over a cover: a white bar on a white 35% track, both on a small dark, translucent plate with a
/// hairline edge and the glyph shadow. The plate carries the contrast, so the bar reads on a white cover, a black
/// one and a busy one alike; with Increase Contrast on, the plate is darker and its edge brighter. Everything is
/// sized from the width of the picture it sits on, from a 60-point cover to a 240-point one.
struct CoverProgressPlate: View {
    @Environment(\.colorSchemeContrast) private var contrast
    let value: Double
    let width: CGFloat

    var body: some View {
        let bar = min(5, max(3, (width / 40).rounded()))
        let inset = (bar * 0.75).rounded()
        let track = max(24, (width * 0.6).rounded())
        let filled = max(bar, track * CGFloat(min(1, max(0, value))))
        let strong = contrast == .increased
        ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.35))
            Capsule().fill(Color.white).frame(width: filled)
        }
        .frame(width: track, height: bar)
        .padding(inset)
        .background(Capsule().fill(Color.black.opacity(strong ? 0.75 : 0.55)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(strong ? 0.5 : 0.25), lineWidth: Design.Stroke.hairline))
        .shadow(Design.Shadow.glyph)
        .padding(.bottom, max(Design.Space.xs, (width * 0.06).rounded()))
        .accessibilityElement()
        .accessibilityLabel("\(whole(value * 100))% read")
    }
}

/// "NEW" on books never opened, like the store's badge but quieter. On a selected row it turns round — white with
/// the accent in its letters — so it keeps its shape on the selection's colour.
struct NewBadge: View {
    var onSelection = false

    var body: some View {
        Text("NEW")
            .font(Design.Fonts.indicator)
            .tracking(0.4)
            .padding(.horizontal, Design.Space.xs)
            .padding(.vertical, Design.Space.xxs)
            .foregroundStyle(onSelection ? Color.accentColor : Color.white)
            .background(onSelection ? Color.white : Color.accentColor, in: Capsule())
    }
}

/// What an empty library says wherever it shows: the kinds of file it takes, and a button to add some.
struct EmptyLibraryContent: View {
    @Environment(LibraryModel.self) private var model

    var body: some View {
        ContentUnavailableView {
            Label("No Books", systemImage: "books.vertical")
        } description: {
            Text("Add EPUB, Kindle (MOBI, AZW3), PDF and text files, or drop them on the window. Everything stays on this Mac.")
        } actions: {
            Button("Add Books…") { model.chooseFiles() }
                .buttonStyle(.borderedProminent)
        }
    }
}

extension View {
    /// Liquid Glass on macOS 26; the regular material with a hairline elsewhere. For floating controls over content.
    @ViewBuilder
    func glassCapsule() -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: .capsule)
        } else {
            self.background(.regularMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
        }
        #else
        self.background(.regularMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
        #endif
    }

    /// The same for floating cards and panels, at the card radius unless given another.
    @ViewBuilder
    func glassRounded(_ radius: CGFloat = Design.Radius.card) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: radius, style: .continuous))
        } else {
            self.background(.regularMaterial, in: Design.rounded(radius)).overlay(Design.rounded(radius).strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
        }
        #else
        self.background(.regularMaterial, in: Design.rounded(radius)).overlay(Design.rounded(radius).strokeBorder(.separator, lineWidth: Design.Stroke.hairline))
        #endif
    }
}

enum Display {
    static func timeLeft(_ book: Book) -> String? {
        guard let seconds = book.secondsLeft() else { return nil }
        return Format.duration(seconds: seconds) + " left"
    }

    static func added(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }
}
