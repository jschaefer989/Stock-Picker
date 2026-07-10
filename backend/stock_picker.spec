# stock_picker.spec – PyInstaller build spec for Stock Picker
# Run from the backend/ directory:  pyinstaller stock_picker.spec --clean

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# ── Hidden imports ─────────────────────────────────────────────────────────
# PyInstaller cannot always detect dynamic imports used by these packages.
hidden = (
    collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + collect_submodules("starlette")
    + collect_submodules("anyio")
    + collect_submodules("httpx")
    + [
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "multipart",
        "email.mime.text",
        "email.mime.multipart",
        "yfinance",
        "pandas",
        "requests",
        "dotenv",
        "sqlite3",
    ]
)

# ── Data files ─────────────────────────────────────────────────────────────
datas = [
    # Built Next.js static frontend (copied here by build.ps1)
    ("frontend_out", "frontend_out"),
    # Package data needed at runtime
    *collect_data_files("yfinance"),
    *collect_data_files("pandas"),
    *collect_data_files("pytz"),
    *collect_data_files("certifi"),
]

# ── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy unused packages to keep the exe smaller
        "matplotlib",
        "IPython",
        "notebook",
        "scipy",
        "sklearn",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="StockPicker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    # windowed=True hides the console window; set to False while debugging
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Replace with "icon.ico" if you have one
)
