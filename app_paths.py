from pathlib import Path
import sys


def get_bundle_dir() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def get_app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_user_data_path(name: str) -> Path:
    return get_app_dir() / name


def get_resource_path(*parts: str) -> Path:
    return get_bundle_dir().joinpath(*parts)

