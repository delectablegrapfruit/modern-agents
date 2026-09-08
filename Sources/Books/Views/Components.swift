import SwiftUI
import BooksCore

/// A book's cover in its box. The box is `width` wide and `height` high — 2:3 when a height is given, the
/// picture's own shape when fitted and none is — and the picture lies in it as the book's cover style says:
/// fitted (standing on the floor of the box), filling it, stretched to it, or where it was placed by hand.
/// The progress bar and the New and Finished badges sit on the part of the picture that shows.
struct CoverView: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    let width: CGFloat
    var height: CGFloat? = nil
    var badges = false

    var body: some View {
        let _ = model.coverVersion
        let image = model.cover(for: book)
        let style = book.coverStyle ?? CoverStyle()
        let box = CGSize(width: width, height: height ?? CoverLayout.naturalHeight(image: image?.size, width: width, style: style))
        let rect = image.map { CoverLayout.rect(image: $0.size, box: box, style: style) } ?? CGRect(origin: .zero, size: box)
        let shown = rect.intersection(CGRect(origin: .zero, size: box))
        let radius = max(2, width * 0.025)
        ZStack(alignment: .topLeading) {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
            } else {
                placeholder(box)
            }
            if !shown.isNull, !shown.isEmpty {
                Color.clear
                    .frame(width: shown.width, height: shown.height)
                    .overlay(alignment: .bottom) {
                        if !book.isFinished, book.hasStarted {
                            ProgressView(value: book.progress)
                                .progressViewStyle(.linear)
                                .tint(.white)
                                .frame(width: shown.width * 0.6)
                                .padding(.bottom, 6)
                                .shadow(radius: 2)
                        }
                    }
                    .overlay(alignment: .topTrailing) { if badges, book.isNew { NewBadge().padding(6) } }
                    .overlay(alignment: .topLeading) {
                        if badges, book.isFinished {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.title3)
                                .foregroundStyle(.white, Color.accentColor)
                                .shadow(radius: 2)
                                .padding(6)
                        }
                    }
                    .position(x: shown.midX, y: shown.midY)
            }
        }
        .frame(width: box.width, height: box.height)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .shadow(color: .black.opacity(0.28), radius: width * 0.05, y: width * 0.03)
    }

    private func placeholder(_ box: CGSize) -> some View {
        ZStack {
            LinearGradient(colors: [Color(nsColor: .systemGray).opacity(0.7), Color(nsColor: .systemGray)], startPoint: .top, endPoint: .bottom)
            VStack(spacing: 6) {
                Text(book.title)
                    .font(.system(size: max(10, width * 0.11), weight: .semibold, design: .serif))
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                Text(book.author)
                    .font(.system(size: max(8, width * 0.07), design: .serif))
                    .lineLimit(2)
                    .opacity(0.8)
            }
            .foregroundStyle(.white)
            .padding(width * 0.08)
        }
        .frame(width: box.width, height: box.height)
    }
}

/// "NEW" ribbon on books never opened, like the store's badge but quieter.
struct NewBadge: View {
    var body: some View {
        Text("NEW")
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.accentColor, in: Capsule())
            .foregroundStyle(.white)
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
            self.background(.regularMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.separator, lineWidth: 0.5))
        }
        #else
        self.background(.regularMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.separator, lineWidth: 0.5))
        #endif
    }

    @ViewBuilder
    func glassRounded(_ radius: CGFloat = 12) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: radius))
        } else {
            self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(.separator, lineWidth: 0.5))
        }
        #else
        self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(.separator, lineWidth: 0.5))
        #endif
    }
}

/// A card on Home: white on light, elevated on dark, the way Books and Fitness draw theirs.
/// A Home widget: a rounded card with a small title row and its content, filling the frame it is given.
struct HomeCard<Content: View>: View {
    let title: String
    var subtitle: String?
    var symbol: String?
    var action: (() -> Void)?
    var actionLabel: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if let symbol { Image(systemName: symbol).font(.subheadline.weight(.semibold)).foregroundStyle(Color.accentColor) }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.headline)
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 8)
                if let action, let actionLabel {
                    Button(actionLabel, action: action).buttonStyle(.link).font(.caption)
                }
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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
