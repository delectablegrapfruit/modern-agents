import SwiftUI
import BooksCore

/// A book cover at a given width, with the shadow and corner the system's book art has; a typographic
/// placeholder while there is none.
struct CoverView: View {
    @Environment(LibraryModel.self) private var model
    let book: Book
    let width: CGFloat

    var body: some View {
        Group {
            if let image = model.cover(for: book) {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                placeholder
            }
        }
        .frame(width: width)
        .frame(minHeight: width * 1.2, alignment: .bottom)
        .clipShape(RoundedRectangle(cornerRadius: max(2, width * 0.025), style: .continuous))
        .shadow(color: .black.opacity(0.28), radius: width * 0.05, y: width * 0.03)
        .overlay(alignment: .bottom) {
            if !book.isFinished, book.hasStarted {
                ProgressView(value: book.progress)
                    .progressViewStyle(.linear)
                    .tint(.white)
                    .frame(width: width * 0.6)
                    .padding(.bottom, 6)
                    .shadow(radius: 2)
            }
        }
    }

    private var placeholder: some View {
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
        .frame(width: width, height: width * 1.5)
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
struct HomeCard<Content: View>: View {
    let title: String
    var action: (() -> Void)?
    var actionLabel: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.title2.weight(.bold))
                Spacer()
                if let action, let actionLabel {
                    Button(actionLabel, action: action).buttonStyle(.link)
                }
            }
            content()
        }
        .padding(20)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
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
