import webview
import os

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


def main():
    port = int(os.environ.get("FC_FRONTEND_PORT", 47821))

    icon_path = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    api = Api()
    window = webview.create_window(
        "FreeCode",
        f"http://localhost:{port}",
        js_api=api,
        width=1200,
        height=800,
        min_size=(600, 400),
        frameless=True,
        background_color="#000000",
    )

    window.events.loaded += lambda: _enable_resize(window)
    webview.start(debug=False)

if __name__ == "__main__":
    main()
