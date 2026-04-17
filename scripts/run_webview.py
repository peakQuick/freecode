import os
import signal
import time
import importlib.util
import webbrowser

import webview

class Api:
    def minimize(self):
        webview.active_window().minimize()

    def toggle_maximize(self):
        window = webview.active_window()
        if window.maximized:
            window.restore()
        else:
            window.maximize()

    def close(self):
        webview.active_window().destroy()
        os._exit(0)

    def pick_folder(self):
        """Open a native folder picker dialog using pywebview and return the selected path."""
        window = webview.active_window()
        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        if result and len(result) > 0:
            return result[0]
        return None

def _enable_resize(window):
    """Restore WS_THICKFRAME so frameless window can be resized by dragging edges."""
    if os.name != "nt":
        return
    try:
        import ctypes
        hwnd = window.native_handle
        GWL_STYLE   = -16
        WS_THICKFRAME = 0x00040000
        WS_MAXIMIZEBOX = 0x00010000
        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style | WS_THICKFRAME | WS_MAXIMIZEBOX)
        # Force redraw so the change takes effect
        SWP_FRAMECHANGED = 0x0020
        SWP_NOMOVE = 0x0002
        SWP_NOSIZE = 0x0001
        SWP_NOZORDER = 0x0004
        ctypes.windll.user32.SetWindowPos(hwnd, None, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED)
    except Exception as e:
        print(f"[webview] resize patch failed: {e}", flush=True)


def _run_browser_fallback(url: str):
    print(f"[pywebview] browser mode enabled: {url}", flush=True)
    try:
        webbrowser.open(url)
    except Exception as exc:
        print(f"[pywebview] could not open browser automatically: {exc}", flush=True)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


def _configure_linux_webview_runtime():
    if os.name != "posix":
        return

    # Prefer software rendering where possible for better compatibility.
    os.environ.setdefault("QT_OPENGL", "software")
    os.environ.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")
    os.environ.setdefault("QTWEBENGINE_DISABLE_SANDBOX", "1")

    default_flags = [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
    ]

    current_flags = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "").strip()
    current_parts = current_flags.split() if current_flags else []

    for flag in default_flags:
        if flag not in current_parts:
            current_parts.append(flag)

    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = " ".join(current_parts)


def _start_native_webview():
    if os.name != "posix":
        webview.start(debug=False)
        return

    # Prefer GTK backend on Linux (still native window) when available.
    if importlib.util.find_spec("gi") is not None:
        try:
            webview.start(debug=False, gui="gtk")
            return
        except Exception as exc:
            print(f"[pywebview] gtk backend unavailable: {exc}", flush=True)

    webview.start(debug=False, gui="qt")


def main():
    port = int(os.environ.get("FC_FRONTEND_PORT", 47821))
    url = f"http://localhost:{port}"

    use_browser = os.environ.get("FREECODE_USE_BROWSER") == "1"

    if use_browser:
        _run_browser_fallback(url)
        return

    _configure_linux_webview_runtime()

    icon_path = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    api = Api()
    window = webview.create_window(
        "FreeCode",
        url,
        js_api=api,
        width=1200,
        height=800,
        min_size=(600, 400),
        frameless=True,
        background_color="#000000",
    )

    window.events.loaded += lambda: _enable_resize(window)
    try:
        _start_native_webview()
    except Exception as exc:
        print(f"[pywebview] native window unavailable: {exc}", flush=True)
        print(f"[pywebview] falling back to browser: {url}", flush=True)
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    main()
