"""
Stock Picker – FastAPI backend
Entry point (dev):  uvicorn main:app --reload
Entry point (prod): python main.py   (or double-click StockPicker.exe)
"""
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routers import portfolio, market
from services.db_service import init_db

app = FastAPI(title="Stock Picker API", version="1.0.0")

# Allow the Next.js dev server to call the API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(market.router, prefix="/api/market", tags=["market"])

init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Static frontend serving
# When packaged with PyInstaller, sys._MEIPASS points to the temp bundle dir.
# In development the `frontend_out` folder lives next to main.py (created by
# the build script).
# ---------------------------------------------------------------------------
def _static_dir() -> Path | None:
    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    else:
        base = Path(__file__).resolve().parent
    candidate = base / "frontend_out"
    return candidate if candidate.is_dir() else None


_static = _static_dir()
if _static:
    # Serve the built Next.js app at the root.
    # API routes are registered first so /api/* is never intercepted here.
    app.mount("/", StaticFiles(directory=str(_static), html=True), name="frontend")


# ---------------------------------------------------------------------------
# Main entry-point (used by PyInstaller-packaged exe)
# ---------------------------------------------------------------------------
def _find_free_port(preferred: int, max_attempts: int = 10) -> int:
    """Return the preferred port if available, otherwise the next free one."""
    import socket
    for offset in range(max_attempts):
        port = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError(
        f"Could not find a free port in range {preferred}–{preferred + max_attempts - 1}. "
        "Close other applications and try again."
    )


def _show_error_dialog(title: str, message: str) -> None:
    """Show a Windows message-box so the error is visible even without a console."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR
    except Exception:
        print(f"{title}: {message}")


if __name__ == "__main__":
    import threading
    import webbrowser
    import uvicorn

    preferred = int(os.environ.get("STOCK_PICKER_PORT", "8000"))
    try:
        port = _find_free_port(preferred)
    except OSError as exc:
        _show_error_dialog("Stock Picker – Startup Error", str(exc))
        sys.exit(1)

    url = f"http://localhost:{port}"

    def _open_browser() -> None:
        import time
        time.sleep(1.5)
        webbrowser.open(url)

    threading.Thread(target=_open_browser, daemon=True).start()
    if port != preferred:
        print(f"Port {preferred} is in use – using port {port} instead.")
    print(f"Stock Picker running – open {url} in your browser (opening automatically…)")
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    except Exception as exc:
        _show_error_dialog("Stock Picker – Startup Error", str(exc))
        sys.exit(1)
