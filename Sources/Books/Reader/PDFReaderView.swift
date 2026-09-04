import AppKit
import CoreImage
import PDFKit
import SwiftUI
import BooksCore

/// PDFs are shown by PDFKit, continuous and fit to width, tinted for the dark themes with Core Image filters on
/// the view's layer. The page shown is the reading position.
struct PDFReaderView: NSViewRepresentable {
    let session: ReaderSession

    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.pageBreakMargins = NSEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
        view.wantsLayer = true
        view.layerUsesCoreImageFilters = true
        if let document = PDFDocument(url: session.model.store.fileURL(for: session.book)) {
            view.document = document
            if let saved = session.book.position?.pdfPage, saved > 1, let page = document.page(at: saved - 1) {
                DispatchQueue.main.async { view.go(to: page) }
            }
        }
        context.coordinator.observe(view)
        apply(theme: session.effectiveTheme, to: view)
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        apply(theme: session.effectiveTheme, to: view)
    }

    func makeCoordinator() -> Coordinator { Coordinator(session: session) }

    private func apply(theme: Theme, to view: PDFView) {
        view.backgroundColor = NSColor(Color(hex: theme.colors.background))
        var filters: [CIFilter] = []
        switch theme {
        case .quiet, .calm, .focus:
            if let invert = CIFilter(name: "CIColorInvert") { filters.append(invert) }
            if let hue = CIFilter(name: "CIHueAdjust") { hue.setValue(Double.pi, forKey: kCIInputAngleKey); filters.append(hue) }
            if theme == .calm, let sepia = CIFilter(name: "CISepiaTone") { sepia.setValue(0.3, forKey: kCIInputIntensityKey); filters.append(sepia) }
            if theme == .quiet, let controls = CIFilter(name: "CIColorControls") { controls.setValue(0.92, forKey: kCIInputBrightnessKey); controls.setValue(0.9, forKey: kCIInputContrastKey); filters.append(controls) }
        case .paper:
            if let sepia = CIFilter(name: "CISepiaTone") { sepia.setValue(0.42, forKey: kCIInputIntensityKey); filters.append(sepia) }
        case .bold:
            if let controls = CIFilter(name: "CIColorControls") { controls.setValue(1.15, forKey: kCIInputContrastKey); filters.append(controls) }
        case .original:
            break
        }
        view.layer?.filters = filters.isEmpty ? nil : filters
    }

    final class Coordinator {
        let session: ReaderSession
        private var observer: NSObjectProtocol?

        init(session: ReaderSession) { self.session = session }

        func observe(_ view: PDFView) {
            observer = NotificationCenter.default.addObserver(forName: .PDFViewPageChanged, object: view, queue: .main) { [weak self, weak view] _ in
                guard let self, let view, let document = view.document, let page = view.currentPage else { return }
                Task { @MainActor in self.session.pdfPageChanged(index: document.index(for: page), count: document.pageCount) }
            }
        }

        deinit {
            if let observer { NotificationCenter.default.removeObserver(observer) }
        }
    }
}
