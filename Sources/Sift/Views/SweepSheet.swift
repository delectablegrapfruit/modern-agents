import SwiftUI
import SiftCore

struct SweepSheet: View {
    @EnvironmentObject private var model: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch model.sweep {
            case .found(let items):
                if items.isEmpty {
                    Text("Nothing to remove.")
                    Spacer()
                    HStack {
                        Spacer()
                        Button("Done") { model.dismissSweep() }.keyboardShortcut(.defaultAction)
                    }
                } else {
                    Text("\(items.count) item\(items.count == 1 ? "" : "s") · \(Format.bytes(items.reduce(0) { $0 + $1.size }))")
                        .font(.headline)
                    ItemList(items: items)
                    HStack {
                        Button("Cancel") { model.dismissSweep() }.keyboardShortcut(.cancelAction)
                        Spacer()
                        Button("Remove") { model.removeFound() }
                            .buttonStyle(.borderedProminent)
                            .keyboardShortcut(.defaultAction)
                    }
                }
            case .removing(let done, let total):
                ProgressView(value: Double(done), total: Double(max(total, 1))) { Text("Removing…") }
                Spacer()
            case .finished(let outcome):
                Text("Removed \(outcome.removed.count) item\(outcome.removed.count == 1 ? "" : "s") · \(Format.bytes(outcome.bytes))")
                    .font(.headline)
                if outcome.failed.isEmpty {
                    Spacer()
                } else {
                    let locked = outcome.locked.count
                    Text(locked > 0
                         ? (model.helperReady ? "\(locked) protected by macOS privacy controls; see the main window."
                                              : "\(locked) belong\(locked == 1 ? "s" : "") to the system and need an administrator.")
                         : "\(outcome.failed.count) could not be removed.")
                        .foregroundStyle(.secondary)
                    List(outcome.failed, id: \.item.path) { failure in
                        Captioned(failure.item.path, failure.reason)
                    }
                }
                HStack {
                    Spacer()
                    if !outcome.locked.isEmpty && !model.helperReady {
                        Button("Allow Administrator…") {
                            model.dismissSweep()
                            model.allowAdministrator()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    Button("Done") { model.dismissSweep() }.keyboardShortcut(.defaultAction)
                }
            case .idle, .scanning:
                EmptyView()
            }
        }
        .padding(20)
        .frame(width: 520, height: 400)
    }
}

struct ItemList: View {
    let items: [Item]

    var body: some View {
        List(items) { item in
            HStack(alignment: .firstTextBaseline) {
                Captioned(item.name, item.parent)
                Spacer()
                Text(Format.bytes(item.size))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
