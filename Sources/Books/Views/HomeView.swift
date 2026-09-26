import AppKit
import SwiftUI
import UniformTypeIdentifiers
import BooksCore

/// Home: widgets as Apple draws them on the Mac desktop and the iPad. They sit on a grid of square units in four
/// sizes — small one unit, medium two across, large two by two, extra large four by two — each a plain card whose
/// whole face is its click target, deep-linked to the book or shelf it shows. Right-click a widget for its sizes and
/// Remove Widget; Edit Widgets… puts a remove badge on each, lets them be dragged into order and opens the gallery of
/// every widget at the foot of the window. Home starts with Continue Reading, Reading Goals, Activity and Recently
/// Added; a book widget with nothing to show stays out of the way until Home is edited.
struct HomeView: View {
    @Environment(LibraryModel.self) private var model
    /// Books whose deletion waits on the confirmation dialog.
    @State private var confirmDelete: [Book] = []
    /// The widget being dragged onto another while Home is edited.
    @State private var dragging: HomeElement?
    /// A widget just added from the gallery, to be scrolled into view.
    @State private var scrollTarget: HomeElement?

    var body: some View {
        GeometryReader { geo in
            let available = max(200, geo.size.width - 2 * Design.Space.page)
            let columns = HomeGrid.columns(forWidth: Double(available))
            let metrics = WidgetMetrics(columns: columns, unit: CGFloat(HomeGrid.unit(forWidth: Double(available), columns: columns)))
            let placements = HomeGrid.place(items, columns: columns)
            ScrollViewReader { proxy in
                ScrollView {
                    page(placements, metrics: metrics, minHeight: geo.size.height)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if model.editingHome, !model.books.isEmpty {
                        WidgetGallery(width: geo.size.width, height: min(340, (geo.size.height * 0.45).rounded()), reveal: { scrollTarget = $0 })
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .onChange(of: scrollTarget) { _, target in
                    guard let target else { return }
                    withAnimation(WidgetTokens.motion) { proxy.scrollTo(target, anchor: .center) }
                    scrollTarget = nil
                }
            }
            .environment(\.homeWidgetMetrics, metrics)
        }
        .background(WidgetTokens.page)
        .environment(\.homeDeleteRequest, { confirmDelete = $0 })
        .confirmationDialog(deleteTitle, isPresented: Binding(get: { !confirmDelete.isEmpty }, set: { if !$0 { confirmDelete = [] } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                model.delete(confirmDelete.map(\.id))
                confirmDelete = []
            }
        } message: {
            Text("The book and its highlights, notes and bookmarks will be removed from this Mac.")
        }
        .onChange(of: model.editingHome) { _, editing in
            if !editing { dragging = nil }
        }
        .onDisappear {
            // Opening a book or another shelf ends the editing, as leaving the desktop does.
            if model.editingHome { model.editingHome = false }
        }
    }

    /// The visible widgets at their chosen sizes. Outside edit mode a book widget with nothing to show is left out.
    private var items: [(HomeElement, WidgetSize)] {
        let home = model.settings.home
        return home.visible.filter { model.editingHome || hasContent($0) }.map { ($0, home.size(of: $0)) }
    }

    private func hasContent(_ element: HomeElement) -> Bool {
        switch element {
        case .continueReading: return !model.continueReading.isEmpty || !model.recentlyAdded.isEmpty
        case .pickUpAgain: return !model.pickUpAgain.isEmpty
        case .forYou: return !model.forYou.isEmpty
        case .recentlyAdded: return !model.recentlyAdded.isEmpty
        case .recentlyFinished: return !model.recentlyFinished.isEmpty
        case .goals, .progress, .calendar, .activity, .statistics: return true
        }
    }

    private var deleteTitle: String {
        confirmDelete.count == 1 ? "Delete “\(confirmDelete[0].title)”?" : "Delete \(confirmDelete.count) books?"
    }

    private var hiddenDescription: String {
        model.settings.home.visible.isEmpty ? "All of Home’s widgets are switched off." : "Home’s widgets have nothing to show yet."
    }

    /// The grid, or what stands in for it, on a page at least as tall as the view, so a click on the empty page
    /// below the widgets ends the editing.
    private func page(_ placements: [HomePlacement], metrics: WidgetMetrics, minHeight: CGFloat) -> some View {
        let grid = WidgetGridLayout(metrics: metrics)
        return VStack(spacing: 0) {
            if model.books.isEmpty {
                ContentUnavailableView {
                    Label("Your Library Is Empty", systemImage: "books.vertical")
                } description: {
                    Text("Add EPUB, Kindle (MOBI, AZW3), PDF and text files, or drop them on the window. Everything stays on this Mac.")
                } actions: {
                    Button("Add Books…") { model.chooseFiles() }
                        .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, minHeight: 420)
            } else if placements.isEmpty && model.editingHome {
                ContentUnavailableView("No Widgets", systemImage: "square.grid.2x2", description: Text("Click a widget in the gallery to add it to Home."))
                    .frame(maxWidth: .infinity, minHeight: 320)
            } else if placements.isEmpty {
                ContentUnavailableView {
                    Label("Home Is Hidden", systemImage: "house")
                } description: {
                    Text(hiddenDescription)
                } actions: {
                    Button("Edit Widgets…") { withAnimation(WidgetTokens.motion) { model.editingHome = true } }
                }
                .frame(maxWidth: .infinity, minHeight: 320)
            } else {
                grid {
                    ForEach(placements) { placement in
                        HomeWidgetView(element: placement.element, family: placement.size)
                            .modifier(WidgetReorder(element: placement.element, dragging: $dragging))
                            .id(placement.element)
                            .transition(.scale(scale: 0.85).combined(with: .opacity))
                            .layoutValue(key: WidgetPlacementKey.self, value: placement)
                    }
                }
                .animation(WidgetTokens.motion, value: placements)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, Design.Space.page)
        .padding(.top, Design.Space.xl)
        .padding(.bottom, Design.Space.xxxl)
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .top)
        .background {
            if model.editingHome {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { withAnimation(WidgetTokens.motion) { model.editingHome = false } }
            }
        }
    }
}

extension LibraryModel {
    /// Shows a widget chosen in the gallery at a size: a hidden one joins at the end of Home, a shown one takes the size.
    func addHomeWidget(_ element: HomeElement, size: WidgetSize) { settings.home.add(element, size: size) }

    /// Puts a widget in another's place, while one is dragged over another in edit mode.
    func moveHomeWidget(_ element: HomeElement, to target: HomeElement) { settings.home.move(element, to: target) }
}

// MARK: - Measures

/// Apple's widget colours and the few measures that are not the grid's: white cards on a light grey page in light
/// mode, #2C2C2E cards on #1C1C1E in dark mode, a hairline, and no heavy shadow.
enum WidgetTokens {
    /// The small widget Apple's measures are given for; type and margins scale from it.
    static let referenceUnit: CGFloat = 170
    /// Home's page, behind the widgets.
    static let page = color(light: 0xF2F2F7, dark: 0x1C1C1E)
    /// A widget's face.
    static let fill = color(light: 0xFFFFFF, dark: 0x2C2C2E)
    private static let hairline = color(light: 0x000000, 0.06, dark: 0xFFFFFF, 0.07)
    /// Accent opacities for the four quarters of the busiest day, on the calendar and the heat map.
    static let heat: [Double] = [0.28, 0.5, 0.75, 1.0]
    /// The gap between heat-map cells and between chart bars.
    static let cellGap: CGFloat = 3
    /// A faint ambient shadow in light mode, as on the Mac desktop; none in dark mode, where the fill carries it.
    static let lightShadow = Design.Shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    static let noShadow = Design.Shadow(color: .clear, radius: 0, y: 0)
    /// Under the gallery panel where there is no Liquid Glass to lift it.
    static let panelShadow = Design.Shadow(color: .black.opacity(0.18), radius: 24, y: 8)
    /// The remove badge in edit mode: Apple's light grey disc in Light Mode, a dark grey one in Dark Mode, lifted
    /// off the card by a soft shadow, and a hit area well beyond the disc.
    static let badgeFill = color(light: 0xE2E2E7, dark: 0x4A4A4E)
    static let badgeShadow = Design.Shadow(color: .black.opacity(0.22), radius: 3, y: 1)
    static let badgeDiameter: CGFloat = 22
    static let badgeHitSize: CGFloat = 36

    /// Widgets move with a spring, or a plain fade when Reduce Motion is on.
    @MainActor static var motion: Animation {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? Design.Motion.standard : Design.Motion.spring
    }

    /// The widget's outline: a hairline, stronger with Increase Contrast.
    static func stroke(_ contrast: ColorSchemeContrast) -> Color {
        contrast == .increased ? Color.primary.opacity(0.25) : hairline
    }

    /// The empty part of a ring or a bar.
    static func track(_ contrast: ColorSchemeContrast) -> Color {
        contrast == .increased ? Color.primary.opacity(0.25) : Design.Fill.track
    }

    /// The accent's opacity for a heat level of 1 to 4; 0 for none.
    static func heatOpacity(_ level: Int) -> Double {
        level <= 0 ? 0 : heat[min(heat.count, level) - 1]
    }

    private static func color(light: UInt32, _ lightAlpha: CGFloat = 1, dark: UInt32, _ darkAlpha: CGFloat = 1) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? WidgetTokens.rgb(dark, darkAlpha) : WidgetTokens.rgb(light, lightAlpha)
        })
    }

    private static func rgb(_ value: UInt32, _ alpha: CGFloat) -> NSColor {
        let red = CGFloat((value >> 16) & 0xFF) / 255
        let green = CGFloat((value >> 8) & 0xFF) / 255
        let blue = CGFloat(value & 0xFF) / 255
        return NSColor(srgbRed: red, green: green, blue: blue, alpha: alpha)
    }
}

/// Widgets built of text take the standard margin; those made of a graphic, like the calendar, the tight one.
enum WidgetMargins {
    case standard, tight
}

/// The measures of Home's widgets at the grid's current unit. Corners, margins and type follow Apple's at a small
/// widget of 170 points and grow more slowly than the boxes, so a wide window gets bigger widgets, not louder ones.
struct WidgetMetrics: Equatable {
    var columns: Int
    var unit: CGFloat

    var gap: CGFloat { CGFloat(HomeGrid.gap) }
    var scale: CGFloat { min(1.2, max(0.94, unit / WidgetTokens.referenceUnit)) }
    /// The continuous corner: 22 points at a unit of 170, 27 at 208.
    var radius: CGFloat { min(28, max(18, (unit * 0.13).rounded())) }
    /// Apple's 16-point margin at 170, 20 at 208.
    var margin: CGFloat { min(20, max(14, (unit * 0.094).rounded())) }
    /// Apple's 11-point margin for graphic layouts.
    var tightMargin: CGFloat { (margin * 0.69).rounded() }
    var gridWidth: CGFloat { CGFloat(columns) * unit + CGFloat(max(0, columns - 1)) * gap }

    func size(_ family: WidgetSize) -> CGSize {
        let span = family.span
        return CGSize(width: CGFloat(span.columns) * unit + CGFloat(span.columns - 1) * gap,
                      height: CGFloat(span.rows) * unit + CGFloat(span.rows - 1) * gap)
    }

    func inset(_ margins: WidgetMargins) -> CGFloat { margins == .tight ? tightMargin : margin }

    /// The room inside a widget's margins.
    func inner(_ family: WidgetSize, _ margins: WidgetMargins = .standard) -> CGSize {
        let whole = size(family)
        let edge = inset(margins)
        return CGSize(width: whole.width - 2 * edge, height: whole.height - 2 * edge)
    }

    /// A type size at this scale, never under Apple's 11-point floor for widgets.
    func points(_ base: CGFloat) -> CGFloat { max(11, (base * scale).rounded()) }

    /// The height a line of that type takes, a little generous, for fitting things into a widget.
    func line(_ base: CGFloat) -> CGFloat { (points(base) * 1.25).rounded(.up) }

    func font(_ base: CGFloat, _ weight: Font.Weight = .regular, rounded: Bool = false) -> Font {
        let design: Font.Design = rounded ? .rounded : .default
        return .system(size: points(base), weight: weight, design: design)
    }

    /// A space token at this scale.
    func space(_ base: CGFloat) -> CGFloat { (base * scale).rounded() }

    /// The tallest cover that fits under a widget's header with what goes under it: a progress bar, and a title
    /// and a line.
    func coverHeight(_ inner: CGSize, captions: Bool, capsule: CGFloat?) -> CGFloat {
        var below: CGFloat = 0
        if let capsule { below += Design.Space.s + capsule }
        if captions { below += Design.Space.s + line(13) + Design.Space.xxs + line(12) }
        return max(36, (inner.height - line(13) - Design.Space.s - below).rounded(.down))
    }

    /// The cover height at which four covers of 2:3 fill the width with the gaps between them.
    func fourAcross(_ inner: CGSize) -> CGFloat {
        (1.5 * (inner.width - 3 * Design.Space.xl) / 4).rounded(.down)
    }

    /// How far in from the top and the leading edge the middle of the corner's curve lies: where the remove badge
    /// is centred, so half of it hangs outside the card.
    var cornerInset: CGFloat { (radius * 0.29).rounded() }

    /// One line or two for a title of this size in a column this wide, reckoning its letters at a little over
    /// half the type size each.
    func titleLines(_ title: String, size: CGFloat, width: CGFloat) -> Int {
        let length = CGFloat(title.count) * points(size) * 0.58
        return length > width ? 2 : 1
    }

    /// The least height of a book's row that holds the title, the author and the widget's line beside its cover,
    /// with the progress bar of a book begun, and room to spare; shorter rows take the list's two lines.
    func cardHeight(progress: Bool) -> CGFloat {
        let text: CGFloat = line(15) + 2 * line(12) + 3 * Design.Space.xs
        let bar: CGFloat = progress ? 6 + Design.Space.xs : 0
        return text + bar + Design.Space.m
    }

    /// The lines of a book's description that fit a column this tall beside its cover, under the widget's name
    /// when it is shown there, the title and the author, and over the progress bar and the widget's line: none
    /// when fewer than two fit, since one cut-off line says little, and eight at most.
    func blurbLines(height: CGFloat, titleSize: CGFloat, titleLines: Int, header: Bool, progress: Bool) -> Int {
        var used: CGFloat = line(titleSize) * CGFloat(titleLines)
        used += 2 * line(12) + 5 * Design.Space.xs
        if header { used += line(13) + Design.Space.xs + Design.Space.xxs }
        if progress { used += 6 + Design.Space.xs }
        let room = height - used - Design.Space.xs
        guard room > 0 else { return 0 }
        let lines = Int(room / line(12))
        return lines >= 2 ? min(8, lines) : 0
    }
}

private struct WidgetMetricsKey: EnvironmentKey {
    static let defaultValue = WidgetMetrics(columns: 4, unit: WidgetTokens.referenceUnit)
}

private struct WidgetPreviewKey: EnvironmentKey {
    static let defaultValue = false
}

private struct HomeDeleteRequestKey: EnvironmentKey {
    static let defaultValue: (([Book]) -> Void)? = nil
}

extension EnvironmentValues {
    /// The measures of Home's widgets, set by Home from the width it has.
    var homeWidgetMetrics: WidgetMetrics {
        get { self[WidgetMetricsKey.self] }
        set { self[WidgetMetricsKey.self] = newValue }
    }

    /// True in the gallery's previews, which draw a widget without its menu, badge or links.
    var homeWidgetIsPreview: Bool {
        get { self[WidgetPreviewKey.self] }
        set { self[WidgetPreviewKey.self] = newValue }
    }

    /// Where a widget sends books to be deleted, so Home can ask first.
    var homeDeleteRequest: (([Book]) -> Void)? {
        get { self[HomeDeleteRequestKey.self] }
        set { self[HomeDeleteRequestKey.self] = newValue }
    }
}

// MARK: - Grid

private struct WidgetPlacementKey: LayoutValueKey {
    static let defaultValue: HomePlacement? = nil
}

/// Places each widget at its column and row of the square grid, at its family's size. Rows are a unit tall; the
/// grid is as wide as its columns and no wider, so a wide window centres it rather than stretch the widgets.
struct WidgetGridLayout: Layout {
    let metrics: WidgetMetrics

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = HomeGrid.rows(subviews.compactMap { $0[WidgetPlacementKey.self] })
        let height = rows == 0 ? 0 : CGFloat(rows) * metrics.unit + CGFloat(rows - 1) * metrics.gap
        return CGSize(width: metrics.gridWidth, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for subview in subviews {
            guard let placement = subview[WidgetPlacementKey.self] else { continue }
            let origin = CGPoint(x: bounds.minX + CGFloat(placement.column) * (metrics.unit + metrics.gap),
                                 y: bounds.minY + CGFloat(placement.row) * (metrics.unit + metrics.gap))
            subview.place(at: origin, anchor: .topLeading, proposal: ProposedViewSize(metrics.size(placement.size)))
        }
    }
}

/// While Home is edited a widget can be dragged onto another to take its place, the grid reflowing as it goes.
private struct WidgetReorder: ViewModifier {
    @Environment(LibraryModel.self) private var model
    let element: HomeElement
    @Binding var dragging: HomeElement?

    @ViewBuilder
    func body(content: Content) -> some View {
        if model.editingHome {
            content
                .onDrag {
                    dragging = element
                    return NSItemProvider(object: "widget:\(element.rawValue)" as NSString)
                }
                .onDrop(of: [.plainText], isTargeted: Binding(get: { false }, set: { entered in
                    guard entered, let moving = dragging, moving != element else { return }
                    withAnimation(WidgetTokens.motion) { model.moveHomeWidget(moving, to: element) }
                })) { _ in
                    let wasDragging = dragging != nil
                    dragging = nil
                    return wasDragging
                }
        } else {
            content
        }
    }
}

// MARK: - The widget

/// Where a click on a widget goes. A small widget, and a larger one about a single thing, is one button (Apple's
/// "fill" style); a larger one holding books opens each from its cover, and a click anywhere else opens the shelf.
enum WidgetLink {
    case plain
    case whole(() -> Void)
    case background(() -> Void)

    var wholeAction: (() -> Void)? {
        if case .whole(let open) = self { return open }
        return nil
    }

    var backgroundAction: (() -> Void)? {
        if case .background(let open) = self { return open }
        return nil
    }
}

/// A widget's card: a continuous rounded rectangle filled as Apple's are, with a hairline and the content inside
/// the margins, never scrolling. It is its own click target, dims when pressed, has the desktop's right-click menu,
/// and in edit mode goes inert under a remove badge.
struct WidgetShell<Content: View>: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.homeWidgetIsPreview) private var isPreview
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast
    let element: HomeElement
    let family: WidgetSize
    var margins: WidgetMargins = .standard
    var link: WidgetLink = .plain
    @ViewBuilder let content: () -> Content

    var body: some View {
        let shape = Design.rounded(metrics.radius)
        let size = metrics.size(family)
        let editing = model.editingHome && !isPreview
        let inert = editing || isPreview
        let card = content()
            .padding(metrics.inset(margins))
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .allowsHitTesting(!inert)
            .clipShape(shape)
            .background {
                shape.fill(WidgetTokens.fill)
                    .shadow(colorScheme == .dark ? WidgetTokens.noShadow : WidgetTokens.lightShadow)
            }
            .overlay {
                shape.strokeBorder(WidgetTokens.stroke(contrast), lineWidth: Design.Stroke.hairline)
                    .allowsHitTesting(false)
            }
            .contentShape(shape)
            .geometryGroup()
        Group {
            if !inert, let open = link.wholeAction {
                Button(action: open) { card }
                    .buttonStyle(WidgetPressStyle())
            } else if !inert, let open = link.backgroundAction {
                card.onTapGesture(perform: open)
            } else {
                card
            }
        }
        .overlay(alignment: .topLeading) {
            if editing {
                // Centred on the middle of the corner's curve: the hit area's centre moved there from its own
                // top-left corner.
                let shift = metrics.cornerInset - WidgetTokens.badgeHitSize / 2
                WidgetRemoveBadge(name: element.label) {
                    withAnimation(WidgetTokens.motion) { model.setHomeElement(element, shown: false) }
                }
                .offset(x: shift, y: shift)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .widgetContextMenu(element, enabled: !isPreview)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(element.label)
    }
}

/// A click on a widget: a slight give and a dim, the way the desktop's widgets answer before the app opens.
struct WidgetPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .brightness(configuration.isPressed ? -0.03 : 0)
            .animation(reduceMotion ? Design.Motion.standard : Design.Motion.spring, value: configuration.isPressed)
    }
}

/// A click on a cover or a row inside a widget: it fades a little while held.
private struct WidgetItemPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(Design.Motion.quick, value: configuration.isPressed)
    }
}

/// A row or a hero inside a widget lights up under the pointer, in a rounded rectangle concentric with the widget.
private struct WidgetHoverHighlight: ViewModifier {
    @Environment(\.homeWidgetMetrics) private var metrics
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .background {
                Design.rounded(max(Design.Radius.cell, metrics.radius - metrics.margin) + Design.Space.xs)
                    .fill(Color.primary.opacity(hovering ? 0.05 : 0))
                    .padding(-Design.Space.xs)
            }
            .onHover { hovering = $0 }
            .animation(Design.Motion.quick, value: hovering)
    }
}

/// The round (−) Apple puts on a widget's top-left corner in edit mode: a 22-point disc centred on the corner's
/// curve, half of it outside the card, with a bold minus, in a hit area well beyond the disc.
private struct WidgetRemoveBadge: View {
    /// The widget's name, for VoiceOver.
    let name: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "minus")
                .font(.system(size: 12, weight: .bold))
                .frame(width: WidgetTokens.badgeDiameter, height: WidgetTokens.badgeDiameter)
        }
        .buttonStyle(WidgetBadgeStyle())
        .help("Remove Widget")
        .accessibilityLabel("Remove \(name)")
    }
}

/// The remove badge's disc under its minus, darkening a little while pressed, and the generous round hit area
/// around it.
private struct WidgetBadgeStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Color.primary)
            .widgetBadgeBackground()
            .brightness(configuration.isPressed ? -0.08 : 0)
            .frame(width: WidgetTokens.badgeHitSize, height: WidgetTokens.badgeHitSize)
            .contentShape(Circle())
    }
}

/// The desktop's widget menu: the sizes the widget comes in with its own checked, Edit “Name”… for widgets with
/// settings, Remove Widget, and Edit Widgets….
struct WidgetMenu: View {
    @Environment(LibraryModel.self) private var model
    let element: HomeElement

    var body: some View {
        if element.families.count > 1 {
            Picker("Size", selection: Binding(get: { model.settings.home.size(of: element) }, set: { size in
                withAnimation(WidgetTokens.motion) { model.setHomeSize(size, for: element) }
            })) {
                ForEach(element.families, id: \.self) { family in
                    Text(family.label).tag(family)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            Divider()
        }
        if element.isConfigurable {
            Button("Edit “\(element.label)”…") { model.editingGoals = true }
        }
        Button("Remove Widget") {
            withAnimation(WidgetTokens.motion) { model.setHomeElement(element, shown: false) }
        }
        Divider()
        Button("Edit Widgets…") {
            withAnimation(WidgetTokens.motion) { model.editingHome = true }
        }
    }
}

extension View {
    @ViewBuilder
    fileprivate func widgetContextMenu(_ element: HomeElement, enabled: Bool) -> some View {
        if enabled {
            self.contextMenu { WidgetMenu(element: element) }
        } else {
            self
        }
    }

    /// A book inside a widget: dragged to a collection in the sidebar, named in a tooltip, and right-clicked for
    /// the book's actions followed by the widget's.
    fileprivate func widgetBookActions(_ book: Book, element: HomeElement, requestDelete: (([Book]) -> Void)?) -> some View {
        let payload = BookDrag.payload(book.id)
        let tip = "\(book.title) — \(book.author)"
        return self
            .draggable(payload)
            .help(tip)
            .contextMenu {
                BookContextMenu(books: [book], collection: nil, requestDelete: requestDelete)
                Divider()
                WidgetMenu(element: element)
            }
    }

    /// The remove badge's disc: an opaque grey, light in Light Mode and dark in Dark Mode, with a hairline and a
    /// soft shadow, on every system. Clear Liquid Glass all but vanished over a white card, so the disc is drawn
    /// as Apple's desktop draws it.
    fileprivate func widgetBadgeBackground() -> some View {
        self.background { Circle().fill(WidgetTokens.badgeFill) }
            .overlay { Circle().strokeBorder(Color.primary.opacity(0.1), lineWidth: Design.Stroke.hairline) }
            .compositingGroup()
            .shadow(WidgetTokens.badgeShadow)
    }

    /// The gallery panel: Liquid Glass on macOS 26; the regular material with a hairline and a soft shadow before.
    @ViewBuilder
    fileprivate func widgetGalleryBackground(radius: CGFloat) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: Design.rounded(radius))
        } else {
            self.widgetGalleryFallback(radius: radius)
        }
        #else
        self.widgetGalleryFallback(radius: radius)
        #endif
    }

    fileprivate func widgetGalleryFallback(radius: CGFloat) -> some View {
        self.background(.regularMaterial, in: Design.rounded(radius))
            .overlay { Design.rounded(radius).strokeBorder(.separator, lineWidth: Design.Stroke.hairline) }
            .shadow(WidgetTokens.panelShadow)
    }

    /// The prominent Done button: glass on macOS 26, bordered before.
    @ViewBuilder
    fileprivate func widgetProminentButton() -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.buttonStyle(.glassProminent)
        } else {
            self.buttonStyle(.borderedProminent)
        }
        #else
        self.buttonStyle(.borderedProminent)
        #endif
    }
}

/// One widget at one size, as Home and the gallery draw it.
struct HomeWidgetView: View {
    let element: HomeElement
    let family: WidgetSize

    var body: some View {
        switch element {
        case .continueReading: ContinueReadingWidget(family: family)
        case .pickUpAgain, .forYou, .recentlyAdded, .recentlyFinished: BookCollectionWidget(element: element, family: family)
        case .goals: GoalsWidget(family: family)
        case .progress: PagesWidget(family: family)
        case .calendar: CalendarWidget(family: family)
        case .activity: ActivityWidget(family: family)
        case .statistics: StatisticsWidget(family: family)
        }
    }
}

// MARK: - Building blocks

/// A widget's name with its symbol, in the accent, as the plain header of larger widgets.
private struct WidgetHeader: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let element: HomeElement

    var body: some View {
        HStack(spacing: Design.Space.xs) {
            Image(systemName: element.symbol).font(metrics.font(12, .semibold))
            Text(element.label).font(metrics.font(13, .semibold)).lineLimit(1)
        }
        .foregroundStyle(Color.accentColor)
        .accessibilityElement(children: .combine)
    }
}

/// The small uppercase line over a widget's content, as Calendar's weekday and month.
private struct WidgetEyebrow: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let text: String
    var color: Color = .accentColor

    var body: some View {
        Text(text.uppercased())
            .font(metrics.font(11, .semibold))
            .tracking(0.6)
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// A big rounded number with its unit, baseline to baseline, as Fitness and Screen Time show theirs.
private struct WidgetHero: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let value: String
    var unit: String? = nil
    let size: CGFloat

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Design.Space.xxs) {
            Text(value)
                .font(metrics.font(size, .semibold, rounded: true))
                .monospacedDigit()
                .contentTransition(.numericText())
            if let unit {
                Text(unit)
                    .font(metrics.font(13, .semibold, rounded: true))
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}

/// A progress bar: the accent on a faint track, green when the goal is met, never shorter than a dot once begun.
private struct WidgetCapsule: View {
    @Environment(\.colorSchemeContrast) private var contrast
    let value: Double
    let height: CGFloat
    var done = false

    var body: some View {
        let share = min(1, max(0, value))
        Capsule()
            .fill(WidgetTokens.track(contrast))
            .overlay(alignment: .leading) {
                GeometryReader { geo in
                    Capsule()
                        .fill(done ? Color.green : Color.accentColor)
                        .frame(width: share > 0 ? min(geo.size.width, max(height, geo.size.width * CGFloat(share))) : 0)
                }
            }
            .frame(height: height)
            .animation(Design.Motion.data, value: share)
    }
}

/// A ring filling clockwise from the top with round ends, as Activity's and Reading Goals' are, around whatever
/// is put in its middle.
private struct WidgetRing<Center: View>: View {
    @Environment(\.colorSchemeContrast) private var contrast
    let value: Double
    var done = false
    let lineWidth: CGFloat
    @ViewBuilder let center: () -> Center

    var body: some View {
        let share = min(1, max(0, value))
        ZStack {
            Circle()
                .stroke(WidgetTokens.track(contrast), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: CGFloat(share))
                .stroke(done ? Color.green : Color.accentColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(Design.Motion.data, value: share)
            center()
        }
        .padding(lineWidth / 2)
    }
}

extension WidgetRing where Center == EmptyView {
    init(value: Double, done: Bool = false, lineWidth: CGFloat) {
        self.init(value: value, done: done, lineWidth: lineWidth, center: { EmptyView() })
    }
}

/// A book's cover in a widget: 2:3, looking as Settings ▸ Cover Appearance says, with its progress drawn beside or
/// below it rather than over the art.
private struct WidgetCover: View {
    let book: Book
    let height: CGFloat

    static func width(for height: CGFloat) -> CGFloat { (height * 2 / 3).rounded() }

    var body: some View {
        CoverView(book: book, width: WidgetCover.width(for: height), height: height, showsProgress: false)
    }
}

/// A book as a widget shows it: the short line goes under a cover or in a small widget, the row line in a list.
private struct WidgetBook: Identifiable {
    let book: Book
    let line: String
    let rowLine: String
    var progress: Double? = nil
    var id: UUID { book.id }

    /// The line at the foot of a book shown at length, beside its cover: the short line, with how far in for a
    /// book begun ("Last read 3 weeks ago · 30%").
    var detailLine: String {
        guard let progress else { return line }
        return "\(line) · \(whole(progress * 100))%"
    }
}

/// A book in a widget's list: a small cover, the title and a line, and for books in progress a small ring.
private struct WidgetBookRow: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.homeDeleteRequest) private var requestDelete
    let element: HomeElement
    let item: WidgetBook
    let coverHeight: CGFloat
    var showsRing = false

    var body: some View {
        Button { model.open(item.book) } label: {
            HStack(spacing: Design.Space.m) {
                WidgetCover(book: item.book, height: coverHeight)
                VStack(alignment: .leading, spacing: Design.Space.xxs) {
                    Text(item.book.title)
                        .font(metrics.font(13, .semibold))
                        .lineLimit(1)
                    Text(item.rowLine)
                        .font(metrics.font(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if showsRing, let progress = item.progress {
                    WidgetRing(value: progress, lineWidth: 3)
                        .frame(width: 20, height: 20)
                }
            }
            .frame(height: coverHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(WidgetItemPressStyle())
        .modifier(WidgetHoverHighlight())
        .widgetBookActions(item.book, element: element, requestDelete: requestDelete)
    }
}

/// A cover in a row, with a progress bar and captions under it when the widget has room for them.
private struct WidgetCoverTile: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.homeDeleteRequest) private var requestDelete
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let element: HomeElement
    let item: WidgetBook
    let coverHeight: CGFloat
    var capsule: CGFloat? = nil
    var captions = false
    @State private var hovering = false

    var body: some View {
        Button { model.open(item.book) } label: {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                WidgetCover(book: item.book, height: coverHeight)
                    .scaleEffect(hovering && !reduceMotion ? Design.Motion.hoverScale : 1)
                    .animation(Design.Motion.spring, value: hovering)
                if let capsule {
                    // Books not yet begun keep the bar's room, so the captions of a row stay in line.
                    WidgetCapsule(value: item.progress ?? 0, height: capsule)
                        .opacity(item.progress == nil ? 0 : 1)
                }
                if captions {
                    VStack(alignment: .leading, spacing: Design.Space.xxs) {
                        Text(item.book.title)
                            .font(metrics.font(13, .semibold))
                            .lineLimit(1)
                        Text(item.line)
                            .font(metrics.font(12))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            .frame(width: WidgetCover.width(for: coverHeight), alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(WidgetItemPressStyle())
        .onHover { hovering = $0 }
        .widgetBookActions(item.book, element: element, requestDelete: requestDelete)
    }
}

/// Covers side by side across the width, as tall as `coverHeight` allows: as many as fill the row, shrunk a
/// little when one more then ends it at the trailing edge, so a full row runs edge to edge with even gaps. Three
/// or more covers that do not fill it are spread evenly across it; one or two start at the leading edge.
private struct WidgetCoverRow: View {
    let element: HomeElement
    let items: [WidgetBook]
    let width: CGFloat
    let coverHeight: CGFloat
    var capsule: CGFloat? = nil
    var captions = false
    var minimumGap: CGFloat = Design.Space.xl

    var body: some View {
        let fitted = WidgetCoverRow.fit(count: items.count, width: width, tallest: coverHeight, gap: minimumGap)
        let shown = Array(items.prefix(fitted.count))
        HStack(alignment: .top, spacing: fitted.spacing) {
            ForEach(shown) { item in
                WidgetCoverTile(element: element, item: item, coverHeight: fitted.height, capsule: capsule, captions: captions)
            }
            if fitted.leading { Spacer(minLength: 0) }
        }
        .frame(width: width, alignment: .leading)
    }

    /// How many covers the row shows, how tall, how far apart, and whether they start at the leading edge rather
    /// than spread across the width.
    static func fit(count: Int, width: CGFloat, tallest: CGFloat, gap: CGFloat) -> (count: Int, height: CGFloat, spacing: CGFloat, leading: Bool) {
        let widest = WidgetCover.width(for: tallest)
        let slots = max(1, Int(((width + gap) / (widest + gap)).rounded()))
        let shown = max(1, min(count, slots))
        let gaps = CGFloat(shown - 1) * gap
        var height = tallest
        if CGFloat(shown) * widest + gaps > width {
            let each = (width - gaps) / CGFloat(shown)
            height = (each * 1.5).rounded(.down)
        }
        let coverWidth = WidgetCover.width(for: height)
        guard shown > 1, shown >= min(slots, 3) else { return (shown, height, gap, true) }
        let spread = ((width - CGFloat(shown) * coverWidth) / CGFloat(shown - 1)).rounded(.down)
        return (shown, height, max(0, spread), false)
    }
}

/// A book at length: its cover and beside it the title, the author, as much of its description as `blurbLines`
/// allows, and at the foot the progress of a book begun over the widget's line. When the book has the widget to
/// itself the widget's name heads the column.
private struct WidgetBookSpread: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let element: HomeElement
    let item: WidgetBook
    let coverHeight: CGFloat
    var showsHeader = false
    var titleSize: CGFloat = 15
    var blurbLines = 0

    var body: some View {
        let blurb = blurbLines > 0 ? Display.widgetBlurb(item.book) : ""
        let authorSize: CGFloat = titleSize >= 17 ? 13 : 12
        HStack(alignment: .top, spacing: metrics.space(Design.Space.l)) {
            WidgetCover(book: item.book, height: coverHeight)
            VStack(alignment: .leading, spacing: Design.Space.xs) {
                if showsHeader {
                    WidgetHeader(element: element)
                        .padding(.bottom, Design.Space.xxs)
                }
                Text(item.book.title)
                    .font(metrics.font(titleSize, .semibold))
                    .lineLimit(2)
                Text(item.book.author)
                    .font(metrics.font(authorSize))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if !blurb.isEmpty {
                    Text(blurb)
                        .font(metrics.font(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(blurbLines)
                        .padding(.top, Design.Space.xs)
                }
                Spacer(minLength: 0)
                if let progress = item.progress {
                    WidgetCapsule(value: progress, height: 6)
                }
                Text(item.detailLine)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(height: coverHeight)
    }
}

/// A book given a tall row of its own when a widget holds only a few: the spread, a click on which opens the book.
private struct WidgetBookCard: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.homeDeleteRequest) private var requestDelete
    let element: HomeElement
    let item: WidgetBook
    let height: CGFloat
    let width: CGFloat

    var body: some View {
        let titleSize: CGFloat = height >= metrics.space(130) ? 17 : 15
        let textWidth = width - WidgetCover.width(for: height) - metrics.space(Design.Space.l)
        let titleLines = metrics.titleLines(item.book.title, size: titleSize, width: textWidth)
        let lines = metrics.blurbLines(height: height, titleSize: titleSize, titleLines: titleLines, header: false, progress: item.progress != nil)
        Button { model.open(item.book) } label: {
            WidgetBookSpread(element: element, item: item, coverHeight: height, titleSize: titleSize, blurbLines: lines)
                .contentShape(Rectangle())
        }
        .buttonStyle(WidgetItemPressStyle())
        .modifier(WidgetHoverHighlight())
        .widgetBookActions(item.book, element: element, requestDelete: requestDelete)
    }
}

/// What an empty widget shows in edit mode: its symbol, faint, and one line.
private struct WidgetEmpty: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let symbol: String
    let text: String

    var body: some View {
        VStack(spacing: Design.Space.s) {
            Image(systemName: symbol)
                .font(.system(size: (22 * metrics.scale).rounded()))
                .foregroundStyle(.tertiary)
            Text(text)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// A number in a statistics tile: the value, an optional unit and what it counts.
private struct WidgetStat: Identifiable {
    let value: String
    var unit: String? = nil
    let label: String
    var id: String { label }
}

private struct WidgetStatTile: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let stat: WidgetStat

    var body: some View {
        VStack(alignment: .leading, spacing: Design.Space.xxs) {
            HStack(alignment: .firstTextBaseline, spacing: Design.Space.xxs) {
                Text(stat.value)
                    .font(metrics.font(22, .semibold, rounded: true))
                    .monospacedDigit()
                if let unit = stat.unit {
                    Text(unit)
                        .font(metrics.font(13, .semibold, rounded: true))
                        .foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            Text(stat.label)
                .font(metrics.font(11, .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Continue Reading

/// The book you are reading, as Apple Books' Reading Now widget shows it: the cover with the progress beside or
/// below it, and at larger sizes what comes next. With nothing begun it offers the newest books to start.
private struct ContinueReadingWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.homeDeleteRequest) private var requestDelete
    let family: WidgetSize

    var body: some View {
        let reading = model.continueReading
        let starting = reading.isEmpty
        let books = starting ? model.recentlyAdded : reading
        if let first = books.first {
            switch family {
            case .small: small(first, starting: starting)
            case .medium: medium(first, starting: starting)
            case .large: large(first, starting: starting)
            case .extraLarge: extraLarge(books, starting: starting)
            }
        } else {
            WidgetShell(element: .continueReading, family: family) {
                WidgetEmpty(symbol: "book", text: "Nothing in progress")
            }
        }
    }

    private func widgetBook(_ book: Book) -> WidgetBook {
        if book.hasStarted {
            return WidgetBook(book: book, line: Display.progressLine(book), rowLine: "\(book.author) · \(whole(book.progress * 100))%", progress: book.progress)
        }
        return WidgetBook(book: book, line: "New", rowLine: "\(book.author) · New")
    }

    /// The books after the first: the others in progress, then the newest not yet opened.
    private func upNext(after first: Book, starting: Bool) -> [WidgetBook] {
        let others: [Book] = starting ? [] : model.continueReading.filter { $0.id != first.id }
        let fresh = model.recentlyAdded.filter { $0.id != first.id }
        return ContinueReadingWidget.unique(others + fresh).map { widgetBook($0) }
    }

    /// Each book once, where it first comes: one both begun and never opened is in both lists, and the rows and
    /// covers are identified by the book.
    private static func unique(_ books: [Book]) -> [Book] {
        var seen = Set<UUID>()
        return books.filter { seen.insert($0.id).inserted }
    }

    private func small(_ book: Book, starting: Bool) -> some View {
        let inner = metrics.inner(.small)
        let ring = (inner.height * 0.26).rounded()
        let percent = whole(book.progress * 100)
        let line = starting ? "New" : (Display.timeLeft(book) ?? book.author)
        return WidgetShell(element: .continueReading, family: .small, link: .whole({ model.open(book) })) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    WidgetCover(book: book, height: (inner.height * 0.56).rounded())
                    Spacer(minLength: Design.Space.s)
                    if starting {
                        WidgetEyebrow(text: "Start")
                    } else {
                        WidgetRing(value: book.progress, lineWidth: (5 * metrics.scale).rounded()) {
                            Text(String(percent))
                                .font(metrics.font(12, .semibold, rounded: true))
                                .monospacedDigit()
                                .minimumScaleFactor(0.6)
                        }
                        .frame(width: ring, height: ring)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(percent) percent read")
                    }
                }
                Spacer(minLength: Design.Space.xs)
                Text(book.title)
                    .font(metrics.font(13, .semibold))
                    .lineLimit(2)
                Text(line)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private func medium(_ book: Book, starting: Bool) -> some View {
        WidgetShell(element: .continueReading, family: .medium, link: .whole({ model.open(book) })) {
            ReadingHero(book: book, starting: starting, height: metrics.inner(.medium).height)
        }
    }

    private func large(_ book: Book, starting: Bool) -> some View {
        let inner = metrics.inner(.large)
        let rest = upNext(after: book, starting: starting)
        let rowGap = Design.Space.s
        let divider: CGFloat = Design.Space.m + Design.Stroke.hairline
        let eyebrow: CGFloat = Design.Space.s + metrics.line(11) + Design.Space.s
        // Up Next takes as many rows as fit under a hero of at least 46% of the height and shares out the room, so
        // the list reaches the foot; with only a row or two the hero takes what they leave.
        let room = inner.height - (inner.height * 0.46).rounded() - divider - eyebrow
        let shortest = (34 * metrics.scale).rounded()
        let count = max(0, min(4, rest.count, Int((room + rowGap) / (shortest + rowGap))))
        let gaps = CGFloat(max(0, count - 1)) * rowGap
        let shared: CGFloat = count > 0 ? ((room - gaps) / CGFloat(count)).rounded(.down) : 0
        let rowHeight = min((44 * metrics.scale).rounded(), shared)
        let rowsHeight = CGFloat(count) * rowHeight + gaps
        let below = divider + eyebrow + rowsHeight
        let heroHeight = rest.isEmpty ? (inner.height * 0.7).rounded() : (inner.height - below).rounded(.down)
        return WidgetShell(element: .continueReading, family: .large, link: .background({ model.sidebarSelection = .all })) {
            VStack(alignment: .leading, spacing: 0) {
                if rest.isEmpty { Spacer(minLength: 0) }
                Button { model.open(book) } label: {
                    ReadingHero(book: book, starting: starting, height: heroHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(WidgetItemPressStyle())
                .modifier(WidgetHoverHighlight())
                .widgetBookActions(book, element: .continueReading, requestDelete: requestDelete)
                if rest.isEmpty {
                    Spacer(minLength: 0)
                } else {
                    Rectangle()
                        .fill(Color.primary.opacity(0.08))
                        .frame(height: Design.Stroke.hairline)
                        .padding(.top, Design.Space.m)
                    WidgetEyebrow(text: "Up Next", color: .secondary)
                        .padding(.top, Design.Space.s)
                    VStack(alignment: .leading, spacing: rowGap) {
                        ForEach(rest.prefix(count)) { item in
                            WidgetBookRow(element: .continueReading, item: item, coverHeight: rowHeight, showsRing: true)
                        }
                    }
                    .padding(.top, Design.Space.s)
                }
            }
        }
    }

    private func extraLarge(_ books: [Book], starting: Bool) -> some View {
        let inner = metrics.inner(.extraLarge)
        let extra: [Book] = starting ? [] : model.recentlyAdded
        let items = ContinueReadingWidget.unique(books + extra).map { widgetBook($0) }
        let coverHeight = min(metrics.coverHeight(inner, captions: true, capsule: 4), metrics.fourAcross(inner))
        return WidgetShell(element: .continueReading, family: .extraLarge, link: .background({ model.sidebarSelection = .all })) {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                WidgetHeader(element: .continueReading)
                WidgetCoverRow(element: .continueReading, items: items, width: inner.width, coverHeight: coverHeight, capsule: 4, captions: true)
            }
        }
    }
}

/// The medium Continue Reading, and the top of the large one: the cover at full height, and beside it the title,
/// the author and the progress with the time left.
private struct ReadingHero: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let book: Book
    let starting: Bool
    let height: CGFloat

    var body: some View {
        let eyebrow = starting ? "Start Reading" : "Continue Reading"
        HStack(alignment: .top, spacing: metrics.space(Design.Space.l)) {
            WidgetCover(book: book, height: height)
            VStack(alignment: .leading, spacing: Design.Space.xs) {
                WidgetEyebrow(text: eyebrow)
                Text(book.title)
                    .font(metrics.font(15, .semibold))
                    .lineLimit(2)
                Text(book.author)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if !starting {
                    WidgetCapsule(value: book.progress, height: 6)
                    HStack(spacing: 0) {
                        Text("\(whole(book.progress * 100))%")
                            .font(metrics.font(12, .semibold, rounded: true))
                            .monospacedDigit()
                        if let left = Display.timeLeft(book) {
                            Text(" · \(left)")
                                .font(metrics.font(12))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(height: height)
    }
}

// MARK: - Book collections

/// Pick Up Again, For You, Recently Added and Recently Finished, laid out for the books they hold so no size is
/// left with holes. Small shows the first book. A single book at any larger size is drawn at length: its cover
/// as big as the widget allows with the title, the author and the widget's line beside it, and the description
/// where there is room. Two share a medium widget as rows, and more fill it with a row of covers edge to edge.
/// Large gives a few books a tall row each and more the rows of a list; extra large gives two or three a row each
/// and four or more a row of big captioned covers.
private struct BookCollectionWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let element: HomeElement
    let family: WidgetSize

    var body: some View {
        let items = self.items
        if let first = items.first {
            switch family {
            case .small:
                small(first)
            case .medium:
                if items.count == 1 {
                    WidgetBookHero(element: element, item: first, family: .medium)
                } else if items.count == 2 {
                    list(items, family: .medium)
                } else {
                    medium(items)
                }
            case .large:
                if items.count == 1 {
                    WidgetBookHero(element: element, item: first, family: .large)
                } else {
                    list(items, family: .large)
                }
            case .extraLarge:
                if items.count == 1 {
                    WidgetBookHero(element: element, item: first, family: .extraLarge)
                } else if items.count < 4 {
                    list(items, family: .extraLarge)
                } else {
                    extraLarge(items)
                }
            }
        } else {
            WidgetShell(element: element, family: family) {
                WidgetEmpty(symbol: element.symbol, text: emptyText)
            }
        }
    }

    /// The shelf a click beside the books opens: the Finished shelf for Recently Finished, All for the rest.
    private var shelf: SidebarItem { element == .recentlyFinished ? .finished : .all }

    /// Books begun keep their progress in view.
    private var capsule: CGFloat? { element == .pickUpAgain ? 3 : nil }

    private var emptyText: String {
        switch element {
        case .pickUpAgain: return "Nothing to pick up again"
        case .forYou: return "No suggestions yet"
        case .recentlyFinished: return "No books finished yet"
        default: return "No new books"
        }
    }

    private var items: [WidgetBook] {
        switch element {
        case .pickUpAgain:
            return model.pickUpAgain.prefix(12).map { (book: Book) -> WidgetBook in
                let line = "Last read \(Display.ago(book.lastOpenedAt ?? book.addedAt))"
                return WidgetBook(book: book, line: line, rowLine: "\(line) · \(whole(book.progress * 100))%", progress: book.progress)
            }
        case .forYou:
            return model.forYou.prefix(12).map { (suggestion: Suggestion) -> WidgetBook in
                WidgetBook(book: suggestion.book, line: suggestion.reason, rowLine: "\(suggestion.book.author) · \(suggestion.reason)")
            }
        case .recentlyFinished:
            return model.recentlyFinished.prefix(12).map { (book: Book) -> WidgetBook in
                let line = "Finished \(Display.monthDay(book.finishedAt ?? book.addedAt))"
                return WidgetBook(book: book, line: line, rowLine: "\(book.author) · \(line)")
            }
        default:
            return model.recentlyAdded.prefix(12).map { (book: Book) -> WidgetBook in
                let line = "Added \(Display.ago(book.addedAt))"
                return WidgetBook(book: book, line: line, rowLine: "\(book.author) · \(line)")
            }
        }
    }

    private func small(_ first: WidgetBook) -> some View {
        let inner = metrics.inner(.small)
        return WidgetShell(element: element, family: .small, link: .whole({ model.open(first.book) })) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    WidgetCover(book: first.book, height: (inner.height * 0.56).rounded())
                    Spacer(minLength: Design.Space.s)
                    Image(systemName: element.symbol)
                        .font(metrics.font(14, .semibold))
                        .foregroundStyle(Color.accentColor)
                }
                Spacer(minLength: Design.Space.xs)
                Text(first.book.title)
                    .font(metrics.font(13, .semibold))
                    .lineLimit(2)
                Text(first.line)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private func medium(_ items: [WidgetBook]) -> some View {
        let inner = metrics.inner(.medium)
        let coverHeight = metrics.coverHeight(inner, captions: false, capsule: capsule)
        return WidgetShell(element: element, family: .medium, link: .background({ model.sidebarSelection = shelf })) {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                WidgetHeader(element: element)
                WidgetCoverRow(element: element, items: items, width: inner.width, coverHeight: coverHeight, capsule: capsule, minimumGap: Design.Space.m)
            }
        }
    }

    /// Books one under another under the widget's name, sharing out the whole height: up to five, as many as fit
    /// at the list's least row height. Rows tall enough get the title, the author, the description where there is
    /// room and the widget's line beside a big cover; shorter ones the list's two lines and a small cover.
    private func list(_ items: [WidgetBook], family: WidgetSize) -> some View {
        let inner = metrics.inner(family)
        let gap = Design.Space.m
        let available = inner.height - metrics.line(13) - Design.Space.s
        let shortest = (44 * metrics.scale).rounded()
        let fit = max(1, Int((available + gap) / (shortest + gap)))
        let count = max(1, min(5, items.count, fit))
        let gaps = CGFloat(count - 1) * gap
        let rowHeight = ((available - gaps) / CGFloat(count)).rounded(.down)
        let spacious = rowHeight >= metrics.cardHeight(progress: capsule != nil)
        let coverGap = spacious ? metrics.space(Design.Space.l) : Design.Space.m
        let separatorInset = WidgetCover.width(for: rowHeight) + coverGap
        let rows = Array(items.prefix(count))
        return WidgetShell(element: element, family: family, link: .background({ model.sidebarSelection = shelf })) {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                WidgetHeader(element: element)
                VStack(alignment: .leading, spacing: gap) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { index, item in
                        Group {
                            if spacious {
                                WidgetBookCard(element: element, item: item, height: rowHeight, width: inner.width)
                            } else {
                                WidgetBookRow(element: element, item: item, coverHeight: rowHeight, showsRing: item.progress != nil)
                            }
                        }
                        .overlay(alignment: .top) {
                            if index > 0 {
                                Rectangle()
                                    .fill(Color.primary.opacity(0.08))
                                    .frame(height: Design.Stroke.hairline)
                                    .padding(.leading, separatorInset)
                                    .offset(y: -gap / 2)
                                    .allowsHitTesting(false)
                            }
                        }
                    }
                }
            }
        }
    }

    private func extraLarge(_ items: [WidgetBook]) -> some View {
        let inner = metrics.inner(.extraLarge)
        let bar: CGFloat? = capsule == nil ? nil : 4
        let coverHeight = min(metrics.coverHeight(inner, captions: true, capsule: bar), metrics.fourAcross(inner))
        return WidgetShell(element: element, family: .extraLarge, link: .background({ model.sidebarSelection = shelf })) {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                WidgetHeader(element: element)
                WidgetCoverRow(element: element, items: items, width: inner.width, coverHeight: coverHeight, capsule: bar, captions: true)
            }
        }
    }
}

/// A book widget with a single book, as Apple Books draws the book you are reading: the cover as big as the widget
/// allows and beside it the widget's name, the title, the author and the widget's line. Large adds the book's
/// description under the two, extra large beside them; a click anywhere opens the book.
private struct WidgetBookHero: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let element: HomeElement
    let item: WidgetBook
    let family: WidgetSize

    var body: some View {
        let book = item.book
        WidgetShell(element: element, family: family, link: .whole({ model.open(book) })) {
            layout
        }
    }

    @ViewBuilder
    private var layout: some View {
        let inner = metrics.inner(family)
        switch family {
        case .small, .medium:
            spread(coverHeight: inner.height, width: inner.width, titleSize: 15)
        case .large:
            let blurb = Display.widgetBlurb(item.book)
            if blurb.isEmpty {
                // No description: the cover as tall as half the width lets it be, the two in the middle.
                let coverHeight = min(inner.height, (inner.width * 0.75).rounded(.down))
                spread(coverHeight: coverHeight, width: inner.width, titleSize: 17)
                    .frame(width: inner.width, height: inner.height)
            } else {
                large(inner, blurb: blurb)
            }
        case .extraLarge:
            spread(coverHeight: inner.height, width: inner.width, titleSize: 20)
        }
    }

    /// The cover at a height and the book beside it, with as much of the description as fits the column.
    private func spread(coverHeight: CGFloat, width: CGFloat, titleSize: CGFloat) -> some View {
        let textWidth = width - WidgetCover.width(for: coverHeight) - metrics.space(Design.Space.l)
        let titleLines = metrics.titleLines(item.book.title, size: titleSize, width: textWidth)
        let lines = metrics.blurbLines(height: coverHeight, titleSize: titleSize, titleLines: titleLines, header: true, progress: item.progress != nil)
        return WidgetBookSpread(element: element, item: item, coverHeight: coverHeight, showsHeader: true, titleSize: titleSize, blurbLines: lines)
    }

    /// The cover and the book beside it over the top three fifths, the description across the width below.
    private func large(_ inner: CGSize, blurb: String) -> some View {
        let coverHeight = (inner.height * 0.6).rounded()
        let gap = Design.Space.m
        let lines = max(1, Int((inner.height - coverHeight - gap) / metrics.line(12)))
        return VStack(alignment: .leading, spacing: gap) {
            WidgetBookSpread(element: element, item: item, coverHeight: coverHeight, showsHeader: true, titleSize: 17)
            Text(blurb)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
                .lineLimit(lines)
                .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }
}

// MARK: - Reading Goals

/// What the goals widget shows, read from the library once for a drawing.
private struct GoalsSnapshot {
    let minutes: Int
    let goalMinutes: Int
    let share: Double
    let done: Bool
    let streak: Int
    let monthDone: Int
    let monthGoal: Int
    let yearDone: Int
    let yearGoal: Int
    let year: Int
    /// The books finished this year, in the order they were finished.
    let finished: [Book]
}

/// Reading Goals as Apple Books' widget draws them: today's minutes as a ring, the streak, the books of the month
/// and the year, and at the large size a shelf of this year's books with room for the rest of the goal.
private struct GoalsWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let family: WidgetSize

    var body: some View {
        let goals = snapshot
        WidgetShell(element: .goals, family: family, link: .whole({ model.editingGoals = true })) {
            switch family {
            case .small: small(goals)
            case .medium: summary(goals, height: metrics.inner(.medium).height)
            case .large, .extraLarge: large(goals)
            }
        }
    }

    private var snapshot: GoalsSnapshot {
        let goals = model.settings.goals
        let today = model.stats.todaySeconds
        let goalSeconds = max(60, goals.dailyMinutes * 60)
        let calendar = Calendar.current
        let now = Date()
        let year = calendar.component(.year, from: now)
        let month = calendar.component(.month, from: now)
        let finished = model.books
            .filter { $0.finishedAt.map { calendar.component(.year, from: $0) == year } ?? false }
            .sorted { ($0.finishedAt ?? .distantPast) < ($1.finishedAt ?? .distantPast) }
        let thisMonth = finished.filter { $0.finishedAt.map { calendar.component(.month, from: $0) == month } ?? false }
        return GoalsSnapshot(minutes: today / 60, goalMinutes: goals.dailyMinutes, share: Double(today) / Double(goalSeconds),
                             done: today >= goalSeconds, streak: model.stats.streak(goalMinutes: goals.dailyMinutes),
                             monthDone: thisMonth.count, monthGoal: goals.monthlyBooks, yearDone: finished.count,
                             yearGoal: goals.yearlyBooks, year: year, finished: finished)
    }

    private func small(_ goals: GoalsSnapshot) -> some View {
        let inner = metrics.inner(.small)
        let diameter = (inner.height * 0.48).rounded()
        let caption = goals.done ? "Goal reached" : "Goal \(goals.goalMinutes) min"
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                WidgetRing(value: goals.share, done: goals.done, lineWidth: (diameter * 0.13).rounded()) {
                    if goals.done {
                        Image(systemName: "checkmark")
                            .font(.system(size: (diameter * 0.25).rounded(), weight: .bold))
                            .foregroundStyle(.green)
                    }
                }
                .frame(width: diameter, height: diameter)
                Spacer(minLength: Design.Space.xs)
                if goals.streak > 0 { WidgetStreak(count: goals.streak) }
            }
            Spacer(minLength: 0)
            WidgetHero(value: String(goals.minutes), unit: "min", size: 30)
            Text(caption)
                .font(metrics.font(12, goals.done ? .semibold : .regular))
                .foregroundStyle(goals.done ? Color.green : Color.secondary)
                .lineLimit(1)
        }
    }

    /// The medium widget, and the top of the large one: the ring with today's minutes, the month's and the year's
    /// books, and the streak.
    private func summary(_ goals: GoalsSnapshot, height: CGFloat) -> some View {
        let lineWidth = (14 * metrics.scale).rounded()
        let caption = goals.done ? "min" : "of \(goals.goalMinutes) min"
        return HStack(alignment: .center, spacing: metrics.space(Design.Space.xl)) {
            WidgetRing(value: goals.share, done: goals.done, lineWidth: lineWidth) {
                VStack(spacing: 0) {
                    Text(String(goals.minutes))
                        .font(metrics.font(30, .semibold, rounded: true))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .minimumScaleFactor(0.6)
                    HStack(spacing: Design.Space.xxs) {
                        if goals.done { Image(systemName: "checkmark").font(metrics.font(11, .bold)) }
                        Text(caption).font(metrics.font(11, .medium))
                    }
                    .foregroundStyle(goals.done ? Color.green : Color.secondary)
                    .lineLimit(1)
                }
            }
            .frame(width: height, height: height)
            // The month, the year and the streak spread evenly down the ring's height, as Fitness spreads its three
            // rings' figures, rather than two bunched at the top over a gap.
            VStack(alignment: .leading, spacing: 0) {
                WidgetGoalBar(label: "This Month", done: goals.monthDone, goal: goals.monthGoal)
                Spacer(minLength: metrics.space(Design.Space.s))
                WidgetGoalBar(label: "This Year", done: goals.yearDone, goal: goals.yearGoal)
                Spacer(minLength: metrics.space(Design.Space.s))
                if goals.streak > 0 {
                    Label("\(goals.streak)-day streak", systemImage: "flame.fill")
                        .font(metrics.font(12, .semibold))
                        .foregroundStyle(.orange)
                        .lineLimit(1)
                } else {
                    Text("No streak yet")
                        .font(metrics.font(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(height: height)
    }

    private func large(_ goals: GoalsSnapshot) -> some View {
        let inner = metrics.inner(.large)
        let top = (inner.height * 0.42).rounded()
        let gap = Design.Space.s
        let slotWidth = ((inner.width - 5 * gap) / 6).rounded(.down)
        let slotHeight = (slotWidth * 1.5).rounded(.down)
        let remaining = inner.height - top - Design.Space.m - metrics.line(11) - Design.Space.s
        let rows = max(1, Int((remaining + gap) / (slotHeight + gap)))
        let slots = rows * 6
        let total = max(goals.yearGoal, goals.finished.count)
        let heading = "Books Read in \(String(goals.year))"
        let count = "\(goals.yearDone) of \(goals.yearGoal)"
        return VStack(alignment: .leading, spacing: 0) {
            summary(goals, height: top)
            HStack(alignment: .firstTextBaseline) {
                WidgetEyebrow(text: heading)
                Spacer(minLength: Design.Space.s)
                Text(count)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
            }
            .padding(.top, Design.Space.m)
            VStack(alignment: .leading, spacing: gap) {
                ForEach(0..<rows, id: \.self) { row in
                    HStack(spacing: gap) {
                        ForEach(0..<6, id: \.self) { column in
                            slot(row * 6 + column, goals: goals, slots: slots, total: total, width: slotWidth, height: slotHeight)
                        }
                    }
                }
            }
            .padding(.top, Design.Space.s)
        }
    }

    /// One place on the year's shelf: a book finished, the room for one still to read, or how many more there are.
    @ViewBuilder
    private func slot(_ index: Int, goals: GoalsSnapshot, slots: Int, total: Int, width: CGFloat, height: CGFloat) -> some View {
        let shape = Design.rounded(Design.Radius.cover(width: width))
        if total > slots && index == slots - 1 {
            shape.fill(Design.Fill.empty)
                .frame(width: width, height: height)
                .overlay {
                    Text("+\(total - slots + 1)")
                        .font(metrics.font(13, .semibold, rounded: true))
                        .foregroundStyle(.secondary)
                }
        } else if index < goals.finished.count {
            WidgetCover(book: goals.finished[index], height: height)
                .frame(width: width, height: height)
                .help(goals.finished[index].title)
        } else {
            shape.strokeBorder(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .frame(width: width, height: height)
        }
    }
}

/// Books finished against a goal: the label, the count and a bar, with a checkmark once the goal is met so the
/// colour is not the only sign.
private struct WidgetGoalBar: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let label: String
    let done: Int
    let goal: Int

    var body: some View {
        let met = goal > 0 && done >= goal
        VStack(alignment: .leading, spacing: Design.Space.xs) {
            HStack(alignment: .firstTextBaseline, spacing: Design.Space.xs) {
                Text(label)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: Design.Space.xs)
                if met {
                    Image(systemName: "checkmark")
                        .font(metrics.font(11, .bold))
                        .foregroundStyle(.green)
                }
                Text("\(done) of \(goal)")
                    .font(metrics.font(13, .semibold, rounded: true))
                    .monospacedDigit()
                    .lineLimit(1)
            }
            WidgetCapsule(value: goal > 0 ? Double(done) / Double(goal) : 0, height: 6, done: met)
        }
    }
}

/// The streak in the corner of the small goals widget: a flame and the days.
private struct WidgetStreak: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let count: Int

    var body: some View {
        HStack(spacing: Design.Space.xxs) {
            Image(systemName: "flame.fill")
                .font(metrics.font(12, .semibold))
            Text(String(count))
                .font(metrics.font(13, .semibold, rounded: true))
                .monospacedDigit()
        }
        .foregroundStyle(.orange)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(count)-day streak")
        .help("\(count)-day streak")
    }
}

// MARK: - Pages & Chapters

/// What the pages widget shows for the goals' period.
private struct PagesSnapshot {
    let period: GoalPeriod
    let pages: Int
    let pageGoal: Int
    let chapters: Int
    let chapterGoal: Int
    let seconds: Int
    let days: Int
}

/// Pages and chapters read in the goals' period against the goals, with the pace so far. The period is chosen with
/// the goals, which a click on the widget opens.
private struct PagesWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let family: WidgetSize

    var body: some View {
        let pages = snapshot
        WidgetShell(element: .progress, family: family, link: .whole({ model.editingGoals = true })) {
            if family == .small {
                small(pages)
            } else {
                medium(pages)
            }
        }
    }

    private var snapshot: PagesSnapshot {
        let goals = model.settings.goals
        let now = Date()
        let totals = model.stats.totals(in: goals.period, containing: now)
        let start = goals.period.interval(containing: now).start
        let days = max(1, (Calendar.current.dateComponents([.day], from: start, to: now).day ?? 0) + 1)
        return PagesSnapshot(period: goals.period, pages: totals.pages, pageGoal: goals.pages, chapters: totals.chapters,
                             chapterGoal: goals.chapters, seconds: totals.seconds, days: days)
    }

    /// A count a day so far, with a decimal while it is small.
    static func pace(_ count: Int, days: Int) -> String {
        let perDay = Double(count) / Double(max(1, days))
        return perDay >= 10 ? String(Int(perDay.rounded())) : String(format: "%.1f", perDay)
    }

    private func small(_ p: PagesSnapshot) -> some View {
        let pace = PagesWidget.pace(p.pages, days: p.days)
        let line = p.pageGoal > 0 ? "of \(p.pageGoal.formatted()) · \(pace) a day" : "\(pace) a day"
        return VStack(alignment: .leading, spacing: Design.Space.xs) {
            WidgetEyebrow(text: p.period.thisLabel)
            Spacer(minLength: 0)
            WidgetHero(value: p.pages.formatted(), unit: p.pages == 1 ? "page" : "pages", size: 34)
            if p.pageGoal > 0 {
                WidgetCapsule(value: Double(p.pages) / Double(p.pageGoal), height: 6, done: p.pages >= p.pageGoal)
            }
            Text(line)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func medium(_ p: PagesSnapshot) -> some View {
        let read = p.seconds >= 60 ? "\(Format.duration(seconds: p.seconds)) read" : "Nothing read yet"
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                WidgetEyebrow(text: p.period.thisLabel)
                Spacer(minLength: Design.Space.s)
                Text(read)
                    .font(metrics.font(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: Design.Space.s)
            HStack(alignment: .bottom, spacing: metrics.space(Design.Space.xl)) {
                WidgetCountColumn(label: "Pages", count: p.pages, goal: p.pageGoal, days: p.days)
                WidgetCountColumn(label: "Chapters", count: p.chapters, goal: p.chapterGoal, days: p.days)
            }
        }
    }
}

/// Pages or chapters: the count, a bar against the goal when there is one, and the goal with the pace.
private struct WidgetCountColumn: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let label: String
    let count: Int
    let goal: Int
    let days: Int

    var body: some View {
        let pace = PagesWidget.pace(count, days: days)
        let line = goal > 0 ? "of \(goal.formatted()) · \(pace) a day" : "\(pace) a day"
        VStack(alignment: .leading, spacing: Design.Space.xs) {
            Text(label)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
            WidgetHero(value: count.formatted(), size: 28)
            if goal > 0 {
                WidgetCapsule(value: Double(count) / Double(goal), height: 6, done: count >= goal)
            }
            Text(line)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Reading Calendar

/// This month as the calendar widget draws it.
private struct MonthSnapshot {
    let weeks: [[DailyReading?]]
    let symbols: [String]
    let peak: Int
    let todayKey: String
    let monthName: String
    let year: String
    let readDays: Int
    let seconds: Int

    init(stats: ReadingStats, date: Date = Date(), calendar: Calendar = .current) {
        let grid = stats.monthWeeks(containing: date, calendar: calendar)
        let days = grid.flatMap { $0 }.compactMap { $0 }
        weeks = grid
        symbols = MonthSnapshot.weekdaySymbols(calendar)
        peak = max(1, days.map(\.seconds).max() ?? 1)
        todayKey = ReadingStats.dayKey(date, calendar: calendar)
        monthName = date.formatted(.dateTime.month(.wide))
        year = date.formatted(.dateTime.year())
        readDays = days.filter { $0.seconds > 0 || $0.pages > 0 }.count
        seconds = days.reduce(0) { $0 + $1.seconds }
    }

    /// The weekdays' initials, the calendar's first weekday first.
    static func weekdaySymbols(_ calendar: Calendar) -> [String] {
        let all = calendar.veryShortStandaloneWeekdaySymbols
        guard !all.isEmpty else { return [] }
        let first = max(0, min(all.count - 1, calendar.firstWeekday - 1))
        return Array(all[first...]) + Array(all[..<first])
    }
}

/// The month as Apple's Calendar widget draws it: only this month, each day read on marked with a disc, darker the
/// more was read, and today in bold. Days carry their reading in a tooltip.
private struct CalendarWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let family: WidgetSize

    var body: some View {
        let month = MonthSnapshot(stats: model.stats)
        switch family {
        case .small:
            WidgetShell(element: .calendar, family: .small, margins: .tight) {
                WidgetMonthGrid(month: month)
            }
        case .medium:
            medium(month)
        case .large, .extraLarge:
            WidgetShell(element: .calendar, family: .large) {
                large(month)
            }
        }
    }

    private func medium(_ month: MonthSnapshot) -> some View {
        let inner = metrics.inner(.medium, .tight)
        let read = month.seconds >= 60 ? Format.duration(seconds: month.seconds) : "0 min"
        return WidgetShell(element: .calendar, family: .medium, margins: .tight) {
            HStack(alignment: .top, spacing: metrics.space(Design.Space.l)) {
                WidgetMonthGrid(month: month)
                    .frame(width: inner.height, height: inner.height)
                VStack(alignment: .leading, spacing: Design.Space.xxs) {
                    WidgetHero(value: String(month.readDays), unit: month.readDays == 1 ? "day" : "days", size: 34)
                    Text("with reading in \(month.monthName)")
                        .font(metrics.font(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Text(read)
                        .font(metrics.font(15, .semibold, rounded: true))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text("read this month")
                        .font(metrics.font(12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.vertical, metrics.margin - metrics.tightMargin)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }

    private func large(_ month: MonthSnapshot) -> some View {
        let inner = metrics.inner(.large)
        let gap = Design.Space.xs
        let rows = max(1, month.weeks.count)
        let header: CGFloat = metrics.line(17) + Design.Space.s + metrics.line(11) + Design.Space.xs
        let footerRoom: CGFloat = metrics.line(12) + Design.Space.s
        let gridHeight = inner.height - header - footerRoom
        let cellHeight = ((gridHeight - CGFloat(rows - 1) * gap) / CGFloat(rows)).rounded(.down)
        let cellWidth = ((inner.width - 6 * gap) / 7).rounded(.down)
        let showsMinutes = min(cellWidth, cellHeight) >= 44
        let read = month.seconds >= 60 ? Format.duration(seconds: month.seconds) : "0 min"
        let footer = "\(Format.plural(month.readDays, "day")) · \(read)"
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: Design.Space.xs) {
                Text(month.monthName)
                    .font(metrics.font(17, .bold))
                Text(month.year)
                    .font(metrics.font(17))
                    .foregroundStyle(.secondary)
            }
            .lineLimit(1)
            HStack(spacing: gap) {
                ForEach(Array(month.symbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol)
                        .font(metrics.font(11, .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: cellWidth)
                }
            }
            .padding(.top, Design.Space.s)
            VStack(alignment: .leading, spacing: gap) {
                ForEach(Array(month.weeks.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: gap) {
                        ForEach(Array(week.enumerated()), id: \.offset) { _, day in
                            WidgetCalendarCell(day: day, month: month, width: cellWidth, height: cellHeight, showsMinutes: showsMinutes)
                        }
                    }
                }
            }
            .padding(.top, Design.Space.xs)
            Spacer(minLength: 0)
            Text(footer)
                .font(metrics.font(12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

/// The small calendar's month: its name, the weekdays' initials and the days, sharing out the height.
private struct WidgetMonthGrid: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let month: MonthSnapshot

    var body: some View {
        // The grid takes the tight margin, but the month's name sits at the standard one, level with the names of
        // the widgets beside it and over the first column's initial.
        let offset = metrics.margin - metrics.tightMargin
        VStack(alignment: .leading, spacing: Design.Space.xxs) {
            WidgetEyebrow(text: month.monthName)
                .padding(.leading, offset)
                .padding(.top, offset)
            HStack(spacing: 0) {
                ForEach(Array(month.symbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol)
                        .font(metrics.font(11, .semibold))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(month.weeks.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 0) {
                        ForEach(Array(week.enumerated()), id: \.offset) { _, day in
                            cell(day)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ day: DailyReading?) -> some View {
        if let day {
            let level = ReadingStats.heatLevel(seconds: day.seconds, pages: day.pages, peak: month.peak)
            let today = day.day == month.todayKey
            Text(Display.dayNumber(day.day))
                .font(metrics.font(11, today ? .bold : .medium))
                .monospacedDigit()
                .foregroundStyle(level >= 3 ? Color.white : Color.primary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background {
                    Circle()
                        .fill(level > 0 ? Color.accentColor.opacity(WidgetTokens.heatOpacity(level)) : Color.clear)
                        .padding(1)
                }
                .overlay {
                    if today && level == 0 {
                        Circle()
                            .strokeBorder(Color.accentColor, lineWidth: 1.5)
                            .padding(1)
                    }
                }
                .help(Display.dayTip(day))
        } else {
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// A day of the large calendar: a rounded cell filled by the reading, its number at the top and, where there is
/// room, the minutes read at the bottom.
private struct WidgetCalendarCell: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let day: DailyReading?
    let month: MonthSnapshot
    let width: CGFloat
    let height: CGFloat
    let showsMinutes: Bool

    var body: some View {
        let shape = Design.rounded((Design.Radius.control * metrics.scale).rounded())
        if let day {
            let level = ReadingStats.heatLevel(seconds: day.seconds, pages: day.pages, peak: month.peak)
            let future = day.day > month.todayKey
            let today = day.day == month.todayKey
            let fill: Color = future ? Color.clear : (level > 0 ? Color.accentColor.opacity(WidgetTokens.heatOpacity(level)) : Design.Fill.empty)
            let ink: Color = future ? Color.secondary : (level >= 3 ? Color.white : Color.primary)
            ZStack(alignment: .topLeading) {
                shape.fill(fill)
                VStack(alignment: .leading, spacing: 0) {
                    Text(Display.dayNumber(day.day))
                        .font(metrics.font(12, today ? .bold : .medium))
                        .monospacedDigit()
                        .foregroundStyle(ink)
                    Spacer(minLength: 0)
                    if showsMinutes && day.seconds >= 60 {
                        Text(Display.shortDuration(day.seconds))
                            .font(metrics.font(11, .medium))
                            .foregroundStyle(level >= 3 ? Color.white.opacity(0.85) : Color.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(Design.Space.xs + Design.Space.xxs)
            }
            .frame(width: width, height: height)
            .overlay {
                if today {
                    shape.strokeBorder(Color.accentColor, lineWidth: 1.5)
                }
            }
            .help(Display.dayTip(day))
        } else {
            Color.clear
                .frame(width: width, height: height)
        }
    }
}

// MARK: - Activity

/// Months of reading as a heat map, week by week, the newest week at the trailing edge and never scrolling: as many
/// weeks as the widget's width holds. Larger sizes add the totals and a legend.
private struct ActivityWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let family: WidgetSize

    var body: some View {
        let inner = metrics.inner(family)
        let cell = cellSize(inner)
        let gap = WidgetTokens.cellGap
        let weekCount = max(1, min(53, Int((inner.width + gap) / (cell + gap))))
        let weeks = model.stats.weeks(weekCount)
        let todayKey = ReadingStats.dayKey()
        let shown = weeks.flatMap { $0 }.filter { $0.day <= todayKey }
        let peak = max(1, shown.map(\.seconds).max() ?? 1)
        let active = shown.filter { $0.seconds > 0 || $0.pages > 0 }.count
        let total = shown.reduce(0) { $0 + $1.seconds }
        let best = shown.max { $0.seconds < $1.seconds }
        let summary = "\(Format.plural(active, "day")) · \(total >= 60 ? Format.duration(seconds: total) : "0 min")"
        WidgetShell(element: .activity, family: family) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    WidgetHeader(element: .activity)
                    Spacer(minLength: Design.Space.s)
                    if family == .medium {
                        Text(summary)
                            .font(metrics.font(12))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                if family != .medium {
                    HStack(alignment: .top, spacing: Design.Space.l) {
                        ForEach(stats(active: active, total: total, best: best)) { stat in
                            WidgetStatTile(stat: stat)
                        }
                    }
                    .padding(.top, Design.Space.m)
                }
                Spacer(minLength: Design.Space.s)
                WidgetHeatMap(weeks: weeks, cell: cell, peak: peak, todayKey: todayKey)
                if family != .medium {
                    Spacer(minLength: Design.Space.s)
                    WidgetHeatLegend(best: best)
                }
            }
        }
    }

    /// The side of a cell: as big as the height allows under the header, and the totals and legend where they are
    /// shown, up to a cap for each size.
    private func cellSize(_ inner: CGSize) -> CGFloat {
        var fixed = metrics.line(13) + Design.Space.s + metrics.line(11) + Design.Space.xs
        var cap: CGFloat = 16
        if family != .medium {
            let totals: CGFloat = Design.Space.m + metrics.line(22) + Design.Space.xxs + metrics.line(11)
            let legend: CGFloat = Design.Space.s + metrics.line(11)
            fixed += totals + legend
            cap = family == .large ? 22 : 24
        }
        return max(6, min(cap, ((inner.height - fixed - 6 * WidgetTokens.cellGap) / 7).rounded(.down)))
    }

    private func stats(active: Int, total: Int, best: DailyReading?) -> [WidgetStat] {
        let time = Display.durationParts(total)
        let top = Display.durationParts(best?.seconds ?? 0)
        var list = [
            WidgetStat(value: active.formatted(), label: active == 1 ? "day read" : "days read"),
            WidgetStat(value: time.value, unit: time.unit, label: "total"),
            WidgetStat(value: top.value, unit: top.unit, label: "best day"),
        ]
        if family == .extraLarge {
            let average = Display.durationParts(active > 0 ? total / active : 0)
            list.append(WidgetStat(value: average.value, unit: average.unit, label: "average day"))
        }
        return list
    }
}

private struct WidgetMonthLabel: Identifiable {
    let week: Int
    let text: String
    var id: Int { week }
}

/// The heat map: weeks left to right, days top to bottom, the months named over the weeks they begin.
private struct WidgetHeatMap: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let weeks: [[DailyReading]]
    let cell: CGFloat
    let peak: Int
    let todayKey: String

    var body: some View {
        let gap = WidgetTokens.cellGap
        let width = max(0, CGFloat(weeks.count) * (cell + gap) - gap)
        VStack(alignment: .leading, spacing: Design.Space.xs) {
            ZStack(alignment: .topLeading) {
                ForEach(monthLabels) { label in
                    Text(label.text)
                        .font(metrics.font(11, .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize()
                        .offset(x: CGFloat(label.week) * (cell + gap))
                }
            }
            .frame(width: width, height: metrics.line(11), alignment: .topLeading)
            .clipped()
            HStack(alignment: .top, spacing: gap) {
                ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                    VStack(spacing: gap) {
                        ForEach(week, id: \.day) { day in
                            WidgetHeatCell(day: day, size: cell, peak: peak, future: day.day > todayKey)
                        }
                    }
                }
            }
        }
    }

    /// A label over the first week of each month, dropping one that would crowd the next.
    private var monthLabels: [WidgetMonthLabel] {
        let calendar = Calendar.current
        var labels: [WidgetMonthLabel] = []
        var previous: Int?
        for (index, week) in weeks.enumerated() {
            guard let key = week.first?.day, let date = ReadingStats.date(fromKey: key, calendar: calendar) else { continue }
            let month = calendar.component(.month, from: date)
            if previous != month {
                if let last = labels.last, index - last.week < 3 { labels.removeLast() }
                labels.append(WidgetMonthLabel(week: index, text: date.formatted(.dateTime.month(.abbreviated))))
            }
            previous = month
        }
        return labels
    }
}

private struct WidgetHeatCell: View {
    let day: DailyReading
    let size: CGFloat
    let peak: Int
    let future: Bool

    var body: some View {
        let level = ReadingStats.heatLevel(seconds: day.seconds, pages: day.pages, peak: peak)
        let fill: Color = future ? Color.clear : (level > 0 ? Color.accentColor.opacity(WidgetTokens.heatOpacity(level)) : Design.Fill.empty)
        let tip = future ? "" : Display.dayTip(day)
        Design.rounded((size * 0.22).rounded())
            .fill(fill)
            .frame(width: size, height: size)
            .help(tip)
    }
}

/// Less to More in the heat map's shades, and the best day.
private struct WidgetHeatLegend: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    let best: DailyReading?

    var body: some View {
        let swatch = metrics.points(11)
        HStack(spacing: Design.Space.xs) {
            Text("Less")
                .font(metrics.font(11))
                .foregroundStyle(.secondary)
            ForEach(0..<5, id: \.self) { level in
                Design.rounded((swatch * 0.22).rounded())
                    .fill(level == 0 ? Design.Fill.empty : Color.accentColor.opacity(WidgetTokens.heatOpacity(level)))
                    .frame(width: swatch, height: swatch)
            }
            Text("More")
                .font(metrics.font(11))
                .foregroundStyle(.secondary)
            Spacer(minLength: Design.Space.s)
            if let best, best.seconds > 0 {
                Text("Best day: \(Display.dayName(best.day)) · \(Format.duration(seconds: best.seconds))")
                    .font(metrics.font(11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Statistics

/// The library and the reading in numbers, as Screen Time's and Batteries' widgets show theirs, with the last days'
/// reading as bars from the medium size up.
private struct StatisticsWidget: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    let family: WidgetSize

    var body: some View {
        let all = tiles
        WidgetShell(element: .statistics, family: family) {
            switch family {
            case .small: grid(Array(all.prefix(4)))
            case .medium: medium(all)
            case .large, .extraLarge: large(all)
            }
        }
    }

    private var tiles: [WidgetStat] {
        let stats = model.stats
        let books = model.books
        let finished = books.filter(\.isFinished).count
        let active = stats.activeDays
        let time = Display.durationParts(stats.totalSeconds)
        let average = Display.durationParts(active > 0 ? stats.totalSeconds / active : 0)
        let streak = stats.longestStreak(goalMinutes: model.settings.goals.dailyMinutes)
        return [
            WidgetStat(value: books.count.formatted(), label: books.count == 1 ? "book" : "books"),
            WidgetStat(value: finished.formatted(), label: "finished"),
            WidgetStat(value: time.value, unit: time.unit, label: "read"),
            WidgetStat(value: stats.totalPages.formatted(), label: "pages"),
            WidgetStat(value: stats.totalChapters.formatted(), label: "chapters"),
            WidgetStat(value: active.formatted(), label: active == 1 ? "day read" : "days read"),
            WidgetStat(value: streak.formatted(), unit: streak == 1 ? "day" : "days", label: "best streak"),
            WidgetStat(value: average.value, unit: average.unit, label: "average day"),
        ]
    }

    /// Four tiles two by two, filling the height.
    private func grid(_ four: [WidgetStat]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: Design.Space.m) {
                ForEach(Array(four.prefix(2))) { WidgetStatTile(stat: $0) }
            }
            Spacer(minLength: Design.Space.s)
            HStack(alignment: .top, spacing: Design.Space.m) {
                ForEach(Array(four.dropFirst(2).prefix(2))) { WidgetStatTile(stat: $0) }
            }
        }
    }

    private func medium(_ all: [WidgetStat]) -> some View {
        let inner = metrics.inner(.medium)
        let spacing = metrics.space(Design.Space.xl)
        let half = ((inner.width - spacing) / 2).rounded(.down)
        let chartHeight = inner.height - metrics.line(11) - Design.Space.xs
        return HStack(alignment: .top, spacing: spacing) {
            grid(Array(all.prefix(4)))
                .frame(width: half, height: inner.height)
            VStack(alignment: .leading, spacing: Design.Space.xs) {
                Text("Last 14 Days")
                    .font(metrics.font(11))
                    .foregroundStyle(.secondary)
                WidgetBars(days: model.stats.recent(14), width: half, height: chartHeight)
            }
        }
    }

    private func large(_ all: [WidgetStat]) -> some View {
        let inner = metrics.inner(.large)
        let chartHeight = (inner.height * 0.35).rounded()
        return VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(element: .statistics)
            VStack(alignment: .leading, spacing: Design.Space.m) {
                HStack(alignment: .top, spacing: Design.Space.m) {
                    ForEach(Array(all.prefix(4))) { WidgetStatTile(stat: $0) }
                }
                HStack(alignment: .top, spacing: Design.Space.m) {
                    ForEach(Array(all.dropFirst(4).prefix(4))) { WidgetStatTile(stat: $0) }
                }
            }
            .padding(.top, Design.Space.m)
            Spacer(minLength: Design.Space.s)
            Text("Last 30 Days")
                .font(metrics.font(11))
                .foregroundStyle(.secondary)
            WidgetBars(days: model.stats.recent(30), width: inner.width, height: chartHeight, ticks: true)
                .padding(.top, Design.Space.xs)
        }
    }
}

/// Reading day by day as bars rounded at the top, a faint stub for days without, and the day of the month under
/// every seventh bar when asked.
private struct WidgetBars: View {
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.colorSchemeContrast) private var contrast
    let days: [DailyReading]
    let width: CGFloat
    let height: CGFloat
    var ticks = false

    var body: some View {
        let gap = WidgetTokens.cellGap
        let count = max(1, days.count)
        let barWidth = max(2, ((width - gap * CGFloat(count - 1)) / CGFloat(count)).rounded(.down))
        let peak = max(1, days.map(\.seconds).max() ?? 1)
        let radius = min(Design.Radius.mark, barWidth / 2)
        let barsHeight = ticks ? height - metrics.line(11) - Design.Space.xxs : height
        VStack(alignment: .leading, spacing: Design.Space.xxs) {
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(days, id: \.day) { day in
                    UnevenRoundedRectangle(topLeadingRadius: radius, topTrailingRadius: radius, style: .continuous)
                        .fill(day.seconds > 0 ? Color.accentColor : WidgetTokens.track(contrast))
                        .frame(width: barWidth, height: day.seconds > 0 ? max(3, barsHeight * CGFloat(day.seconds) / CGFloat(peak)) : 3)
                        .help(Display.dayTip(day))
                }
            }
            .frame(height: barsHeight, alignment: .bottom)
            if ticks {
                ZStack(alignment: .topLeading) {
                    ForEach(Array(days.enumerated()), id: \.offset) { index, day in
                        if index % 7 == 0 {
                            Text(Display.dayNumber(day.day))
                                .font(metrics.font(11))
                                .foregroundStyle(.secondary)
                                .fixedSize()
                                .offset(x: CGFloat(index) * (barWidth + gap))
                        }
                    }
                }
                .frame(width: width, height: metrics.line(11), alignment: .topLeading)
            }
        }
    }
}

// MARK: - Gallery

/// The widget gallery, docked at the foot of Home while it is edited, as on the Mac desktop: every widget in a list
/// with a search field, and the chosen one drawn live at each of its sizes. Clicking a preview adds the widget at
/// that size, or gives a widget already on Home that size.
private struct WidgetGallery: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    /// Home's width, which the panel spans less its margins.
    let width: CGFloat
    let height: CGFloat
    let reveal: (HomeElement) -> Void
    @State private var selection: HomeElement = .continueReading
    @State private var search = ""

    private var matches: [HomeElement] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return HomeElement.allCases }
        return HomeElement.allCases.filter { $0.label.localizedCaseInsensitiveContains(query) || $0.galleryDescription.localizedCaseInsensitiveContains(query) }
    }

    /// The list's column: wide enough for the longest name ("Recently Finished") on one line beside its tile and
    /// check with a scroll bar showing, even at the narrowest window, and a little wider when the panel has room,
    /// leaving the rest to the previews. A name that still does not fit wraps to a second line.
    private var listWidth: CGFloat {
        let panel = width - 2 * Design.Space.m
        return min(248, max(224, (panel * 0.36).rounded()))
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Design.Space.s) {
                searchField
                ScrollView {
                    VStack(alignment: .leading, spacing: Design.Space.xxs) {
                        ForEach(matches, id: \.self) { element in
                            WidgetGalleryRow(element: element, selected: element == selection) { selection = element }
                        }
                    }
                }
            }
            .padding(Design.Space.m)
            .frame(width: listWidth)
            Divider()
            detail
        }
        .frame(height: height)
        .widgetGalleryBackground(radius: Design.Radius.card)
        .padding(Design.Space.m)
        .onChange(of: search) { _, _ in
            if let first = matches.first, !matches.contains(selection) { selection = first }
        }
    }

    private var detail: some View {
        let element = selection
        let scale = previewScale
        return VStack(alignment: .leading, spacing: Design.Space.xxs) {
            HStack(alignment: .firstTextBaseline, spacing: Design.Space.m) {
                Text(element.label)
                    .font(.system(size: 17, weight: .semibold))
                Spacer(minLength: 0)
                Button("Done") { withAnimation(WidgetTokens.motion) { model.editingHome = false } }
                    .keyboardShortcut(.cancelAction)
                    .widgetProminentButton()
                    .help("Stop editing Home (Esc)")
            }
            Text(element.galleryDescription)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(2, reservesSpace: true)
            ScrollView(.horizontal) {
                HStack(alignment: .bottom, spacing: Design.Space.xl) {
                    ForEach(element.families, id: \.self) { family in
                        WidgetGalleryPreview(element: element, family: family, scale: scale, reveal: reveal)
                    }
                }
                .padding(.top, Design.Space.m)
                .padding(.horizontal, Design.Space.s)
            }
            .scrollIndicators(.hidden)
        }
        .padding(Design.Space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// A search field as the desktop's gallery has: a magnifying glass, the field, and a clear button once
    /// something is typed, on a rounded grey well.
    private var searchField: some View {
        HStack(spacing: Design.Space.xs) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            TextField("Search Widgets", text: $search)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .help("Clear Search")
                .accessibilityLabel("Clear Search")
            }
        }
        .padding(.horizontal, Design.Space.s)
        .frame(height: 28)
        .background(Design.Fill.empty, in: Design.rounded(Design.Radius.control))
    }

    /// One scale for every size, so the previews show the sizes against each other, and a large one fits the panel
    /// under the name, the two lines of description and the size's label.
    private var previewScale: CGFloat {
        let text: CGFloat = 72
        let room = height - 2 * Design.Space.l - Design.Space.m - Design.Space.s - text
        return max(0.2, min(0.6, room / metrics.size(.large).height))
    }
}

/// A widget in the gallery's list: its symbol on an accent tile and its name, checked when it is on Home. The name
/// takes all the room between the two and wraps to a second line rather than be cut short.
private struct WidgetGalleryRow: View {
    @Environment(LibraryModel.self) private var model
    let element: HomeElement
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Design.Space.s) {
                Image(systemName: element.symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(Color.accentColor, in: Design.rounded(7))
                Text(element.label)
                    .font(.system(size: 13))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if model.settings.home.isShown(element) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .help("On Home")
                }
            }
            .padding(.horizontal, Design.Space.xs + Design.Space.xxs)
            .padding(.vertical, Design.Space.xs)
            .background(selected ? Design.Fill.selection : Color.clear, in: Design.rounded(Design.Radius.control))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A live preview of a widget at one size, scaled down; a click puts the widget on Home at that size.
private struct WidgetGalleryPreview: View {
    @Environment(LibraryModel.self) private var model
    @Environment(\.homeWidgetMetrics) private var metrics
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let element: HomeElement
    let family: WidgetSize
    let scale: CGFloat
    let reveal: (HomeElement) -> Void
    @State private var hovering = false

    var body: some View {
        let size = metrics.size(family)
        let shown = model.settings.home.isShown(element)
        let current = shown && model.settings.home.size(of: element) == family
        let tip: String = current ? "On Home at this size" : (shown ? "Make \(element.label) \(family.label)" : "Add \(element.label) to Home")
        VStack(spacing: Design.Space.s) {
            Button {
                withAnimation(WidgetTokens.motion) { model.addHomeWidget(element, size: family) }
                reveal(element)
            } label: {
                HomeWidgetView(element: element, family: family)
                    .environment(\.homeWidgetIsPreview, true)
                    .scaleEffect(scale, anchor: .topLeading)
                    .frame(width: (size.width * scale).rounded(), height: (size.height * scale).rounded(), alignment: .topLeading)
                    .contentShape(Rectangle())
                    .overlay {
                        if current {
                            Design.rounded(metrics.radius * scale + 3)
                                .strokeBorder(Color.accentColor, lineWidth: 2)
                                .padding(-3)
                        }
                    }
                    .overlay(alignment: .topLeading) { badge(current: current) }
                    .scaleEffect(hovering && !reduceMotion ? 1.02 : 1)
                    .animation(Design.Motion.spring, value: hovering)
            }
            .buttonStyle(.plain)
            .onHover { hovering = $0 }
            .help(tip)
            .accessibilityLabel(tip)
            Text(family.label)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func badge(current: Bool) -> some View {
        if current {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20))
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, Color.accentColor)
                .offset(x: -8, y: -8)
        } else if hovering {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Color.accentColor, in: Circle())
                .offset(x: -8, y: -8)
                .transition(.scale.combined(with: .opacity))
        }
    }
}

// MARK: - Words

extension Display {
    /// "3 days ago", "2 months ago".
    static func ago(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }

    /// A day key ("2026-09-08") as "Sep 8".
    static func dayName(_ key: String) -> String {
        guard let date = ReadingStats.date(fromKey: key) else { return key }
        return monthDay(date)
    }

    /// A date as "Sep 8".
    static func monthDay(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// The day of the month in a day key: "2026-09-08" is "8".
    static func dayNumber(_ key: String) -> String {
        String(Int(key.suffix(2)) ?? 0)
    }

    /// "Sep 8: 25 min, 12 pages", or "Sep 8: no reading", for a day's tooltip.
    static func dayTip(_ day: DailyReading) -> String {
        let name = dayName(day.day)
        guard day.seconds > 0 || day.pages > 0 else { return name + ": no reading" }
        var parts = [Format.duration(seconds: day.seconds)]
        if day.pages > 0 { parts.append(Format.plural(day.pages, "page")) }
        return name + ": " + parts.joined(separator: ", ")
    }

    /// A day's reading in a calendar cell: "25m", "1h 5m", "2h".
    static func shortDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let rest = minutes % 60
        return rest == 0 ? "\(minutes / 60)h" : "\(minutes / 60)h \(rest)m"
    }

    /// A time as a big number and its unit: "45" and "min", "2.5" and "hr", "12" and "hr".
    static func durationParts(_ seconds: Int) -> (value: String, unit: String) {
        let minutes = seconds / 60
        if minutes < 60 { return (String(minutes), "min") }
        let hours = Double(seconds) / 3600
        return hours < 10 ? (String(format: "%.1f", hours), "hr") : (String(Int(hours.rounded())), "hr")
    }

    /// A book's description as plain text for a widget: the tags publishers put in it dropped, the commonest
    /// entities written out and the white space closed up. Empty when the book has none.
    static func widgetBlurb(_ book: Book) -> String {
        var text = book.metadata.description
        guard !text.isEmpty else { return "" }
        text = text.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        let entities: [(String, String)] = [("&nbsp;", " "), ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"),
                                            ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&")]
        for (entity, character) in entities {
            text = text.replacingOccurrences(of: entity, with: character)
        }
        return text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// "40% · 2 hr left" for a book in progress.
    static func progressLine(_ book: Book) -> String {
        var parts: [String] = ["\(whole(book.progress * 100))%"]
        if let left = timeLeft(book) { parts.append(left) }
        return parts.joined(separator: " · ")
    }
}
