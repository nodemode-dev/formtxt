import hmac
import secrets

from app.core import config

INAPP_TOKEN = secrets.token_urlsafe(24)
INAPP_CLIENT = "Claude Code in FormTxt"
INAPP_VAR = "FORMTXT_INAPP_TOKEN"
INAPP_HEADER = "x-formtxt-inapp"
SETTING = "agentsAllowed"


def is_inapp(token: str | None) -> bool:
    return bool(token) and hmac.compare_digest(token.encode(), INAPP_TOKEN.encode())


def allowed() -> bool:
    return config.read_settings().get(SETTING) is True


def set_allowed(on: bool) -> bool:
    config.write_settings({SETTING: bool(on)})
    return bool(on)
