import AppKit
import WebKit
import UniformTypeIdentifiers

/// The page's file picker (Mural's "Photo": an `<input type="file" accept="image/*">`). WKWebView on macOS shows no
/// open panel by itself, so this one asks for images only, over the floating window.
final class PhotoPicker: NSObject, WKUIDelegate {
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        MainActor.assumeIsolated {
            let open = NSOpenPanel()
            open.allowsMultipleSelection = parameters.allowsMultipleSelection
            open.canChooseDirectories = false
            open.canChooseFiles = true
            open.allowedContentTypes = [.image]
            open.level = .modalPanel
            NSApp.activate(ignoringOtherApps: true)
            open.begin { response in completionHandler(response == .OK ? open.urls : nil) }
        }
    }
}
