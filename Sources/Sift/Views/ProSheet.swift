import SwiftUI
import SiftCore

/// Sift Pro: what it adds, where the trial stands, buying it and entering the key from the receipt.
struct ProSheet: View {
    @EnvironmentObject private var model: Model
    @State private var key = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sift Pro").font(.title2.bold())
                Text(model.proStatus).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 10) {
                Feature(symbol: "sparkles", title: "Cleans by itself",
                        detail: ".DS_Store, ._ files and the disk-level folders are removed the moment they appear, on every disk.")
                Feature(symbol: "folder", title: "Finder views your way",
                        detail: "One view for every folder on every disk, folders with their own, kept whatever Finder remembers.")
                Feature(symbol: "checkmark.seal", title: "One payment",
                        detail: "Yours for good on this Mac, with every update. Sweep stays free.")
            }
            if case .licensed = model.entitlement {
                licensed
            } else {
                unlicensed
            }
        }
        .padding(24)
        .frame(width: 460)
    }

    private var unlicensed: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                TextField("License key", text: $key)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { model.activate(key) }
                Button("Activate") { model.activate(key) }
                    .disabled(key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.licenseBusy)
            }
            problem
            HStack {
                if model.licenseBusy { ProgressView().controlSize(.small) }
                Spacer()
                Button("Not Now") { close() }.keyboardShortcut(.cancelAction)
                Button("Buy Sift Pro…") { model.buyPro() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    private var licensed: some View {
        VStack(alignment: .leading, spacing: 10) {
            problem
            HStack {
                if model.licenseBusy { ProgressView().controlSize(.small) }
                Button("Deactivate on This Mac") { model.deactivate() }
                    .disabled(model.licenseBusy)
                    .help("Frees the key for another Mac")
                Spacer()
                Button("Done") { close() }.keyboardShortcut(.defaultAction)
            }
        }
    }

    @ViewBuilder
    private var problem: some View {
        if let problem = model.licenseProblem {
            Text(problem)
                .font(.callout)
                .foregroundStyle(.red)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func close() {
        model.licenseProblem = nil
        model.showsPro = false
    }
}

private struct Feature: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(Color.accentColor)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).fontWeight(.semibold)
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
