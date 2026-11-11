import XCTest
import WebKit
import UIKit
@testable import Mew

final class NativeHTTPTransportTests: XCTestCase {
    func testAPIPathsRejectForeignOriginsAndNormalization() {
        for path in ["https://other.invalid/api/files", "//other.invalid/api/files", "/api/../secret", "/api/%2e%2e/secret", "/api/files%2fsecret", "/api/files%5csecret", "/api/files#fragment", "/api/files%0d", "/api/port-preview/secret"] {
            XCTAssertFalse(NativeHTTPTransport.validPath(path), path)
        }
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/files?path=notes%2Fexample.md"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/auth/login"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/auth/setup"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/auth/setup/status"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/auth/setup/complete"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/remote-access"))
        XCTAssertTrue(NativeHTTPTransport.validPath("/api/remote-access/register"))
    }

    func testSpeechTimeoutIsScopedToTranscriptionPost() {
        XCTAssertEqual(NativeHTTPTransport.requestTimeout(method: "POST", path: "/api/speech/transcribe"), 310)
        XCTAssertEqual(NativeHTTPTransport.requestTimeout(method: "POST", path: "/api/speech/transcribe?project=one"), 310)
        XCTAssertEqual(NativeHTTPTransport.requestTimeout(method: "GET", path: "/api/speech/transcribe"), 60)
        XCTAssertEqual(NativeHTTPTransport.requestTimeout(method: "POST", path: "/api/speech/transcribe-other"), 60)
    }

    func testOnlyKnownWorkspaceSocketsAreAccepted() {
        for path in ["/api/tmux/ws", "/api/agent/ws?session=one", "/api/presence", "/api/live/ws", "/api/collab", "/api/db/ws", "/api/browser-desktop/ws", "/api/dom-browser/ws"] {
            XCTAssertTrue(NativeHTTPTransport.validPath(path, socket: true), path)
        }
        XCTAssertFalse(NativeHTTPTransport.validPath("/api/files", socket: true))
        XCTAssertFalse(NativeHTTPTransport.validPath("/api/tmux/ws/other", socket: true))
    }

    func testStaticResourcesCannotEscapeBuiltAssets() {
        for path in ["/assets/index-abc123.js", "/assets/pdf.worker-abc123.mjs", "/fonts/regular.woff2", "/favicon.svg", "/pdf-assets/5.4/cmaps/Adobe-Japan1.bcmap", "/pdf-assets/5.4/standard_fonts/FoxitSans.pfb", "/pdf-assets/5.4/wasm/openjpeg.wasm"] {
            XCTAssertTrue(NativeHTTPTransport.validStaticPath(path), path)
        }
        for path in ["/assets/../secret.js", "/assets/%2e%2e/secret.js", "/assets/.hidden.js", "/assets/app.js?remote=1", "/api/files", "/documents/private.html", "/assets/app.exe"] {
            XCTAssertFalse(NativeHTTPTransport.validStaticPath(path), path)
        }
    }

    @MainActor
    func testLocalHTMLSupportsModulesWorkersAndNativeFrameIdentity() async throws {
        let delivered = expectation(description: "Local UI modules and worker reached the native bridge")
        let handler = NativePageProbe { message in
            guard let value = message.body as? [String: Any] else { XCTFail("Invalid native probe response"); delivered.fulfill(); return }
            XCTAssertEqual(value["type"] as? String, "ready", String(describing: value))
            XCTAssertEqual(value["module"] as? Int, 42)
            XCTAssertEqual(value["worker"] as? Int, 43)
            XCTAssertTrue(message.frameInfo.isMainFrame)
            XCTAssertEqual(message.frameInfo.securityOrigin.protocol, "mew-app")
            XCTAssertEqual(message.frameInfo.securityOrigin.host, "workspace")
            delivered.fulfill()
        }
        let configuration = WKWebViewConfiguration()
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.setURLSchemeHandler(handler, forURLScheme: "mew-app")
        configuration.userContentController.add(handler, name: "probe")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.addEventListener('error', event => window.webkit.messageHandlers.probe.postMessage({type:'error',message:event.message}));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), configuration: configuration)
        let window = UIWindow(frame: webView.frame)
        window.rootViewController = UIViewController()
        window.rootViewController?.view.addSubview(webView)
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        webView.loadHTMLString("<html><head><script type='module' src='./assets/main.mjs'></script></head><body></body></html>", baseURL: URL(string: "mew-app://workspace/")!)
        await fulfillment(of: [delivered], timeout: 15)
        webView.stopLoading()
        configuration.userContentController.removeScriptMessageHandler(forName: "probe")
    }
}

private final class NativePageProbe: NSObject, WKURLSchemeHandler, WKScriptMessageHandler {
    let receive: (WKScriptMessage) -> Void
    init(receive: @escaping (WKScriptMessage) -> Void) { self.receive = receive }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) { receive(message) }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let source: String
        switch urlSchemeTask.request.url?.path {
        case "/assets/main.mjs": source = """
            const module = await import('./value.mjs');
            const worker = new Worker(new URL('./worker.mjs', import.meta.url), {type:'module'});
            worker.onmessage = event => { window.webkit.messageHandlers.probe.postMessage({type:'ready',module:module.value,worker:event.data}); worker.terminate(); };
            worker.onerror = event => window.webkit.messageHandlers.probe.postMessage({type:'error',message:event.message});
            worker.postMessage(42);
            """
        case "/assets/value.mjs": source = "export const value = 42;"
        case "/assets/worker.mjs": source = "self.onmessage = event => self.postMessage(event.data + 1);"
        default: urlSchemeTask.didFailWithError(NativeTransportError.invalidRequest); return
        }
        let data = Data(source.utf8)
        urlSchemeTask.didReceive(URLResponse(url: urlSchemeTask.request.url!, mimeType: "text/javascript", expectedContentLength: data.count, textEncodingName: "utf-8"))
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
