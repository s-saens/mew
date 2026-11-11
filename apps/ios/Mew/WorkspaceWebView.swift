import SwiftUI
import WebKit
import UIKit

@MainActor
final class WorkspaceModel: ObservableObject {
    @Published var loading = true
    @Published var failed = false
    @Published var processTerminated = false
    weak var webView: WKWebView?
    var reload: (() -> Void)?
}

@MainActor
struct WorkspaceView: View {
    let connection: SavedConnection
    let cache: NativeAssetCache
    @ObservedObject var notifications: NativeNotifications
    @Environment(\.scenePhase) private var phase
    @StateObject private var model = WorkspaceModel()

    var body: some View {
        ZStack {
            WorkspaceWebView(connection: connection, cache: cache, notifications: notifications, model: model)
            if model.loading && !model.failed { ProgressView().padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12)) }
            if model.failed || model.processTerminated {
                VStack(spacing: 12) {
                    Text(LocalizedStringKey(model.processTerminated ? "iOS closed this workspace to free memory." : "Could not connect to Mew."))
                    Button("Reconnect") { model.reload?() }
                }.padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding()
            }
        }
        .navigationTitle(connection.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { model.reload?() } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Reconnect")
            }
        }
        .onChange(of: phase) { next in
            guard next == .active, !model.processTerminated else { return }
            model.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('mew:native-foreground'))", completionHandler: nil)
        }
    }
}

@MainActor
private struct WorkspaceWebView: UIViewRepresentable {
    let connection: SavedConnection
    let cache: NativeAssetCache
    let notifications: NativeNotifications
    @ObservedObject var model: WorkspaceModel

    func makeCoordinator() -> Coordinator { Coordinator(connection: connection, cache: cache, notifications: notifications, model: model) }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let action = notifications.clicked, action.connectionID == connection.id,
              context.coordinator.lastClick != action.nonce else { return }
        context.coordinator.lastClick = action.nonce
        context.coordinator.bridge?.deliverClick(action.id)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) { coordinator.dispose() }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let connection: SavedConnection
        private let cache: NativeAssetCache
        private let notifications: NativeNotifications
        private let model: WorkspaceModel
        private var transport: NativeHTTPTransport?
        private var scheme: NativeSchemeHandler?
        private var loadTask: Task<Void, Never>?
        private var webView: WKWebView?
        private var expectingLocalHTML = false
        private var hasLoaded = false
        var bridge: NativeBridge?
        var lastClick: UUID?

        init(connection: SavedConnection, cache: NativeAssetCache, notifications: NativeNotifications, model: WorkspaceModel) {
            self.connection = connection; self.cache = cache; self.notifications = notifications; self.model = model
        }

        func makeWebView() -> WKWebView {
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            configuration.limitsNavigationsToAppBoundDomains = true
            configuration.applicationNameForUserAgent = "Mew-iOS/1"
            configuration.allowsInlineMediaPlayback = true
            if connection.kind == .direct {
                let transport = NativeHTTPTransport(baseURL: connection.address) { [weak self] event in self?.bridge?.deliverSocketEvent(event) }
                self.transport = transport
                let scheme = NativeSchemeHandler(transport: transport, cache: cache, namespace: connection.namespace, scope: "direct:" + connection.origin)
                self.scheme = scheme
                configuration.setURLSchemeHandler(scheme, forURLScheme: "mew-app")
            }
            let bridge = NativeBridge(connection: connection, cache: cache, notifications: notifications, transport: transport)
            self.bridge = bridge
            configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "mewNative")
            do {
                let script = try NativeBridge.script(connection: connection, documentToken: bridge.documentToken)
                configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: connection.kind == .direct))
            } catch { model.failed = true }
            let webView = WKWebView(frame: .zero, configuration: configuration)
            self.webView = webView; bridge.webView = webView; model.webView = webView
            webView.navigationDelegate = self; webView.uiDelegate = self
            webView.isOpaque = false
            webView.backgroundColor = .black
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            webView.allowsBackForwardNavigationGestures = false
            model.reload = { [weak self] in self?.load() }
            bridge.reload = { [weak self] in self?.load() }
            Task { [weak self] in self?.load() }
            return webView
        }

        private func load() {
            loadTask?.cancel()
            if hasLoaded { transport?.reset() }
            hasLoaded = true
            bridge?.beginDocument()
            model.loading = true; model.failed = false; model.processTerminated = false
            guard let webView else { return }
            if let transport {
                loadTask = Task { [weak self] in
                    do {
                        let html = try await transport.loadIndex()
                        guard !Task.isCancelled else { return }
                        self?.expectingLocalHTML = true
                        self?.bridge?.ownsLocalDocument = true
                        webView.loadHTMLString(html, baseURL: URL(string: "mew-app://workspace/")!)
                    } catch {
                        guard !Task.isCancelled else { return }
                        self?.model.loading = false; self?.model.failed = true
                    }
                }
            } else { webView.load(URLRequest(url: connection.address)) }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
            if connection.kind == .direct, navigationAction.navigationType == .reload,
               url.scheme == "mew-app", url.host == "workspace", url.path.isEmpty || url.path == "/" {
                decisionHandler(.cancel); load(); return
            }
            let allowed = connection.kind == .direct
                ? expectingLocalHTML && ((url.scheme == "mew-app" && url.host == "workspace" && (url.path.isEmpty || url.path == "/")) || url.absoluteString == "about:blank")
                : connection.acceptsMewlinkNavigation(url)
            if allowed { decisionHandler(.allow) }
            else {
                decisionHandler(.cancel)
                if navigationAction.navigationType == .linkActivated { openExternal(url) }
            }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { openExternal(url) }
            return nil
        }

        private func openExternal(_ url: URL) {
            guard ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") else { return }
            UIApplication.shared.open(url)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { expectingLocalHTML = false; model.loading = false }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            model.loading = false; model.failed = true
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            model.loading = false; model.processTerminated = true
        }

        func dispose() {
            loadTask?.cancel(); loadTask = nil
            transport?.invalidate()
            scheme?.invalidate()
            webView?.stopLoading()
            webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mewNative", contentWorld: .page)
            webView?.navigationDelegate = nil; webView?.uiDelegate = nil
            bridge?.invalidate(); bridge = nil
            Task { await notifications.closeAll(connectionID: connection.id) }
            model.webView = nil; model.reload = nil
        }
    }
}
