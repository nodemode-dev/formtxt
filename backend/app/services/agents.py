import hmac
import secrets

from app.core import config

TOKENS: set[str] = set()
INAPP_CLIENT = "Claude Code in FormTxt"
INAPP_VAR = "FORMTXT_INAPP_TOKEN"
INAPP_HEADER = "x-formtxt-inapp"
SETTING = "agentsAllowed"
BLOCKED = "agentsBlocked"
BLOCKED_REPLY = "Agents are blocked in FormTxt. Only the person can change that, in the FormTxt window under Preferences, Privacy. Do not retry."
CLOSED_REPLY = "This FormTxt tab has closed, so its access has ended."


def issue() -> str:
    token = secrets.token_urlsafe(32)
    TOKENS.add(token)
    return token


def revoke(token: str | None) -> None:
    TOKENS.discard(token or "")


def is_inapp(token: str | None) -> bool:
    return isinstance(token, str) and bool(token) and any(hmac.compare_digest(token.encode(), t.encode()) for t in list(TOKENS))


def allowed() -> bool:
    return config.read_settings().get(SETTING) is True


def blocked() -> bool:
    return config.read_settings().get(BLOCKED) is True


def set_allowed(on: bool) -> bool:
    config.write_settings({SETTING: bool(on)})
    return bool(on)
