import AppKit
import SwiftUI

/// The measures the app draws with, shared by the library, Home, the reader's chrome and the sheets. Corners are
/// continuous; spaces sit on a 4-point grid; chrome moves in 0.2 s and changes of scale spring.
enum Design {
    static func rounded(_ radius: CGFloat) -> RoundedRectangle { RoundedRectangle(cornerRadius: radius, style: .continuous) }

    /// The width of the reader's popovers (Contents, Appearance, Search).
    static let popoverWidth: CGFloat = 360

    enum Radius {
        /// Heat-map cells, chart bars.
        static let mark: CGFloat = 3
        /// Calendar days and other cells inside a card: the card's radius less its inset, so the corners are concentric.
        static let cell: CGFloat = 6
        /// Fields, steppers, hover pills, the note editor.
        static let control: CGFloat = 8
        /// Wells and selections inside a window: a book card's selection, the cover editor.
        static let tile: CGFloat = 12
        /// Cards: Home widgets, the end card, the preparing HUD.
        static let card: CGFloat = 22
        /// A cover's corners at a width.
        static func cover(width: CGFloat) -> CGFloat { max(2, width * 0.025) }
    }

    enum Space {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 28
        /// The inset of Home and the shelves from the window's edges.
        static let page: CGFloat = 28
    }

    enum Motion {
        /// Hover highlights and things revealed on hover.
        static let quick: Animation = .easeOut(duration: 0.12)
        /// Chrome coming and going, floating titles, banners, cards.
        static let standard: Animation = .easeInOut(duration: 0.2)
        /// Changes of scale: a cover lifting, the timeline's thumb, widgets settling.
        static let spring: Animation = .spring(response: 0.35, dampingFraction: 0.86)
        /// Data filling in: a goal ring.
        static let data: Animation = .easeInOut(duration: 0.6)
        static let hoverScale: CGFloat = 1.03
        /// Zoom & Split's slide from screen to screen (Core Animation).
        static let pageTurn: CFTimeInterval = 0.3
        /// The pointer and full screen's chrome go after this long without movement.
        static let idle: TimeInterval = 1.5
    }

    enum Fonts {
        static let cardTitle: Font = .headline
        static let sectionTitle: Font = .subheadline.weight(.semibold)
        static let body: Font = .callout
        static let meta: Font = .caption
        static let micro: Font = .caption2
        static let metric: Font = .system(.title, design: .rounded).weight(.semibold)
        static let value: Font = .system(.callout, design: .rounded).weight(.semibold).monospacedDigit()
        /// The NEW badge, disclosure and sort chevrons.
        static let indicator: Font = .system(size: 9, weight: .bold)
        static let menuIcon: Font = .system(size: 14, weight: .medium)
        static func bookTitle(scale: CGFloat = 1) -> Font { .system(size: 13 * scale, weight: .medium) }
        static func bookMeta(scale: CGFloat = 1) -> Font { .system(size: 11 * scale) }
    }

    enum Fill {
        /// An empty day, an empty track.
        static let empty = Color.primary.opacity(0.07)
        static let track = Color.primary.opacity(0.12)
        static let selection = Color.accentColor.opacity(0.16)
        static let stripe = Color.primary.opacity(0.035)
    }

    enum Stroke {
        static let hairline: CGFloat = 0.5
    }

    struct Shadow {
        let color: Color
        let radius: CGFloat
        let y: CGFloat

        /// Under glyphs drawn on pictures: badges, the progress capsule.
        static let glyph = Shadow(color: .black.opacity(0.3), radius: 2, y: 1)
        /// Things floating over content: the floating group title, the full-screen bar.
        static let raised = Shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        static func cover(width: CGFloat) -> Shadow { Shadow(color: .black.opacity(0.28), radius: width * 0.05, y: width * 0.03) }
    }
}

extension View {
    func shadow(_ token: Design.Shadow) -> some View { shadow(color: token.color, radius: token.radius, x: 0, y: token.y) }
}
