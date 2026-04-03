import AppKit
import SwiftUI

// MARK: - Config Models

struct CompressConfig: Codable {
    let input: String
    let output: String
    let finalPath: String
    let duration: Double
    let originalSize: Int64
    let filename: String
    let trashOriginal: Bool
    let ffmpegPath: String
    let passes: [PassConfig]
}

struct PassConfig: Codable {
    let args: [String]
    let label: String
}

// MARK: - State

class CompressState: ObservableObject {
    enum Status: Equatable {
        case compressing
        case complete
        case alreadyOptimal
        case error(String)
    }

    @Published var status: Status = .compressing
    @Published var progress: Double = 0
    @Published var currentPass: Int = 0
    @Published var totalPasses: Int = 1
    @Published var passLabel: String = "Compressing..."
    @Published var eta: String = ""
    @Published var compressedSize: Int64 = 0

    var config: CompressConfig!

    var savedPercent: Int {
        guard config != nil, config.originalSize > 0, compressedSize > 0 else { return 0 }
        return Int(Double(config.originalSize - compressedSize) / Double(config.originalSize) * 100)
    }
}

// MARK: - Design Tokens

private enum Tok {
    // Warm neutral tint instead of cold blue-purple
    static let accent = Color(red: 0.45, green: 0.72, blue: 0.55)       // muted sage green
    static let accentBright = Color(red: 0.40, green: 0.78, blue: 0.52)  // brighter for success
    static let trackBg = Color.white.opacity(0.08)
    static let trackFill = Color.white.opacity(0.55)
    static let dimText = Color.white.opacity(0.45)
    static let bodyText = Color.white.opacity(0.75)
    static let brightText = Color.white.opacity(0.92)
}

// MARK: - Overlay View

struct OverlayView: View {
    @ObservedObject var state: CompressState
    let onShowInFinder: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Header ──
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    headerLabel
                    if let config = state.config {
                        Text(config.filename)
                            .font(.system(size: 11))
                            .foregroundColor(Tok.dimText)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Spacer(minLength: 12)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Tok.dimText)
                        .frame(width: 18, height: 18)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 14)

            // ── Content ──
            statusContent
        }
        .padding(16)
        .frame(width: 300, alignment: .leading)
    }

    // MARK: Header Label

    @ViewBuilder
    private var headerLabel: some View {
        switch state.status {
        case .compressing:
            HStack(spacing: 5) {
                ProgressView()
                    .controlSize(.small)
                Text(state.passLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Tok.bodyText)
            }
        case .complete:
            HStack(spacing: 5) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Tok.accentBright)
                Text("Done")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Tok.brightText)
            }
        case .alreadyOptimal:
            HStack(spacing: 5) {
                Image(systemName: "equal.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Tok.dimText)
                Text("Already optimal")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Tok.bodyText)
            }
        case .error:
            HStack(spacing: 5) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.orange)
                Text("Failed")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Tok.bodyText)
            }
        }
    }

    // MARK: Status Content

    @ViewBuilder
    private var statusContent: some View {
        switch state.status {
        case .compressing:
            progressContent
        case .complete:
            completeContent
        case .alreadyOptimal:
            Text("File can\u{2019}t be compressed further.")
                .font(.system(size: 11))
                .foregroundColor(Tok.dimText)
        case .error(let message):
            Text(message)
                .font(.system(size: 11))
                .foregroundColor(.orange.opacity(0.8))
                .lineLimit(3)
        }
    }

    // MARK: Progress

    @ViewBuilder
    private var progressContent: some View {
        // Large percentage — the hero number
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("\(Int(state.progress * 100))")
                .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundColor(Tok.brightText)
            Text("%")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(Tok.dimText)
                .baselineOffset(6)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if state.totalPasses > 1 {
                    Text("Pass \(state.currentPass + 1)/\(state.totalPasses)")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Tok.dimText)
                }
                if !state.eta.isEmpty {
                    Text(state.eta)
                        .font(.system(size: 10))
                        .foregroundColor(Tok.dimText)
                }
            }
        }
        .padding(.bottom, 8)

        // Progress track
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Tok.trackBg)
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Tok.trackFill)
                    .frame(width: max(0, geo.size.width * state.progress))
                    .animation(.easeOut(duration: 0.4), value: state.progress)
            }
        }
        .frame(height: 4)
    }

    // MARK: Complete

    @ViewBuilder
    private var completeContent: some View {
        if let config = state.config {
            // Savings hero
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                if state.savedPercent > 0 {
                    Text("\(state.savedPercent)")
                        .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundColor(Tok.accentBright)
                    Text("% smaller")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(Tok.accent)
                        .baselineOffset(4)
                }
                Spacer()
            }
            .padding(.bottom, 4)

            // Size breakdown
            HStack(spacing: 4) {
                Text(formatBytes(config.originalSize))
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundColor(Tok.dimText)
                Text("\u{2192}")
                    .font(.system(size: 10))
                    .foregroundColor(Tok.dimText)
                Text(formatBytes(state.compressedSize))
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                    .foregroundColor(Tok.bodyText)
            }
            .padding(.bottom, 12)
        }

        // Primary action only — no redundant dismiss
        Button(action: onShowInFinder) {
            HStack(spacing: 5) {
                Image(systemName: "folder")
                    .font(.system(size: 10))
                Text("Show in Finder")
                    .font(.system(size: 11, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(Tok.accent.opacity(0.2))
            .foregroundColor(Tok.accentBright)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    // MARK: Helpers

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

// MARK: - Floating Panel

class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }

    init(size: NSSize) {
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )

        level = .floating
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
    }

    func positionTopRight() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let margin: CGFloat = 16
        let x = visible.maxX - frame.width - margin
        let y = visible.maxY - frame.height - margin
        setFrameOrigin(NSPoint(x: x, y: y))
    }
}

// MARK: - App Controller

class AppController: NSObject, NSApplicationDelegate {
    var panel: FloatingPanel!
    let state = CompressState()
    var hostingView: NSHostingView<OverlayView>!
    var ffmpegProcess: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let config = parseConfig() else {
            fputs("Usage: compress-overlay --config <path-to-config.json>\n", stderr)
            NSApp.terminate(nil)
            return
        }

        state.config = config
        state.totalPasses = config.passes.count
        state.passLabel = config.passes.first?.label ?? "Compressing..."

        createPanel()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runCompression()
        }
    }

    // MARK: Config

    private func parseConfig() -> CompressConfig? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: "--config"),
              idx + 1 < args.count else { return nil }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: args[idx + 1])) else { return nil }
        return try? JSONDecoder().decode(CompressConfig.self, from: data)
    }

    // MARK: Panel Setup

    private func createPanel() {
        let view = OverlayView(
            state: state,
            onShowInFinder: { [weak self] in self?.showInFinder() },
            onDismiss: { [weak self] in self?.dismiss() }
        )

        hostingView = NSHostingView(rootView: view)
        hostingView.translatesAutoresizingMaskIntoConstraints = false

        let blur = NSVisualEffectView()
        blur.material = .hudWindow
        blur.state = .active
        blur.blendingMode = .behindWindow
        blur.wantsLayer = true
        blur.layer?.cornerRadius = 14
        blur.layer?.masksToBounds = true

        blur.addSubview(hostingView)
        NSLayoutConstraint.activate([
            hostingView.topAnchor.constraint(equalTo: blur.topAnchor),
            hostingView.bottomAnchor.constraint(equalTo: blur.bottomAnchor),
            hostingView.leadingAnchor.constraint(equalTo: blur.leadingAnchor),
            hostingView.trailingAnchor.constraint(equalTo: blur.trailingAnchor),
        ])

        let fitting = hostingView.fittingSize
        let width = max(fitting.width, 332)
        let height = max(fitting.height, 100)

        panel = FloatingPanel(size: NSSize(width: width, height: height))
        panel.contentView = blur
        panel.positionTopRight()
        panel.makeKeyAndOrderFront(nil)
    }

    private func refreshPanel() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self = self, let panel = self.panel else { return }

            self.hostingView.layoutSubtreeIfNeeded()
            let fitting = self.hostingView.fittingSize
            let width = max(fitting.width, 332)
            let height = max(fitting.height, 100)

            guard let screen = NSScreen.main else { return }
            let visible = screen.visibleFrame
            let margin: CGFloat = 16
            let x = visible.maxX - width - margin
            let y = visible.maxY - height - margin

            panel.setFrame(
                NSRect(x: x, y: y, width: width, height: height),
                display: true,
                animate: true
            )
        }
    }

    // MARK: Compression

    private func runCompression() {
        guard let config = state.config else { return }

        for (i, pass) in config.passes.enumerated() {
            DispatchQueue.main.sync {
                self.state.currentPass = i
                self.state.passLabel = pass.label
                self.state.progress = 0
                self.state.eta = ""
            }

            if !runFFmpegPass(pass: pass, duration: config.duration, ffmpegPath: config.ffmpegPath) {
                return
            }
        }

        finishCompression()
    }

    private func runFFmpegPass(pass: PassConfig, duration: Double, ffmpegPath: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath)
        process.arguments = pass.args

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        self.ffmpegProcess = process
        let startTime = Date()

        var stderrLines: [String] = []
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }
            stderrLines.append(contentsOf: lines)
            if stderrLines.count > 10 {
                stderrLines = Array(stderrLines.suffix(10))
            }
        }

        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }

            for line in text.components(separatedBy: "\n") {
                if line.hasPrefix("out_time_us=") {
                    let val = String(line.dropFirst("out_time_us=".count))
                    if let us = Double(val), us > 0 {
                        let sec = us / 1_000_000
                        let pct = min(max(sec / duration, 0), 0.99)
                        let elapsed = Date().timeIntervalSince(startTime)

                        var etaText = ""
                        if pct > 0.02 && elapsed > 2 {
                            let remaining = (elapsed / pct) - elapsed
                            if remaining > 0 {
                                let m = Int(remaining) / 60
                                let s = Int(remaining) % 60
                                etaText = m > 0 ? "\(m)m \(s)s left" : "\(s)s left"
                            }
                        }

                        DispatchQueue.main.async {
                            self?.state.progress = pct
                            self?.state.eta = etaText
                        }
                    }
                }
            }
        }

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            DispatchQueue.main.sync {
                self.state.status = .error(error.localizedDescription)
            }
            refreshPanel()
            return false
        }

        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil

        if process.terminationStatus != 0 {
            let errorText = stderrLines.suffix(3).joined(separator: " ")
            DispatchQueue.main.sync {
                self.state.status = .error(errorText.isEmpty ? "FFmpeg exited with code \(process.terminationStatus)" : errorText)
            }
            refreshPanel()
            return false
        }

        return true
    }

    private func finishCompression() {
        guard let config = state.config else { return }
        let fm = FileManager.default

        guard fm.fileExists(atPath: config.output),
              let attrs = try? fm.attributesOfItem(atPath: config.output),
              let size = attrs[.size] as? Int64 else {
            DispatchQueue.main.sync { state.status = .error("Output file not found") }
            refreshPanel()
            return
        }

        if size >= config.originalSize {
            try? fm.removeItem(atPath: config.output)
            DispatchQueue.main.sync { state.status = .alreadyOptimal }
            refreshPanel()
            return
        }

        do {
            if config.trashOriginal {
                let escaped = config.input.replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                let script = NSAppleScript(source:
                    "tell application \"Finder\" to delete POSIX file \"\(escaped)\""
                )
                var err: NSDictionary?
                script?.executeAndReturnError(&err)
            }

            if config.finalPath != config.input && fm.fileExists(atPath: config.finalPath) {
                try fm.removeItem(atPath: config.finalPath)
            }

            try fm.moveItem(atPath: config.output, toPath: config.finalPath)

            let xattr = Process()
            xattr.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
            xattr.arguments = ["-w", "com.mediacompressor.compressed", "true", config.finalPath]
            try? xattr.run()
            xattr.waitUntilExit()

        } catch {
            DispatchQueue.main.sync {
                self.state.status = .error("Failed to save: \(error.localizedDescription)")
            }
            refreshPanel()
            return
        }

        DispatchQueue.main.sync {
            state.compressedSize = size
            state.progress = 1
            state.status = .complete
        }
        refreshPanel()
    }

    // MARK: Actions

    private func showInFinder() {
        guard let config = state.config else { return }
        NSWorkspace.shared.selectFile(config.finalPath, inFileViewerRootedAtPath: "")
        dismiss()
    }

    private func dismiss() {
        ffmpegProcess?.terminate()
        panel?.close()

        if let config = state.config {
            try? FileManager.default.removeItem(atPath: config.output)
        }
        if let idx = CommandLine.arguments.firstIndex(of: "--config"),
           idx + 1 < CommandLine.arguments.count {
            try? FileManager.default.removeItem(atPath: CommandLine.arguments[idx + 1])
        }

        NSApp.terminate(nil)
    }
}

// MARK: - Entry Point

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = AppController()
app.delegate = controller
app.run()
