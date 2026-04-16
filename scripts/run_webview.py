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

def main():
    # Use the ico file for the window icon
    icon_path = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    api = Api()
    webview.create_window(
        "FreeCode",
        "http://localhost:3000",
        js_api=api,
        width=1200,
        height=800,
        frameless=True, # Custom titlebar in React handles controls
        background_color="#000000",
    )
    
    webview.start(debug=False)

if __name__ == "__main__":
    main()
