import json
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
import base64

from app.core import config
from app.services.ai.settings import AIError

UA = f"FormTxt/{config.VERSION} (local document editor)"
MAX_REPLY = 30 * 1024 * 1024
EFFORT = {
    "fast": {"max_tokens": 1500, "thinking": 0},
    "balanced": {"max_tokens": 4096, "thinking": 0},
    "thorough": {"max_tokens": 16000, "thinking": 8000},
}


def _tidy(messages: list[dict]) -> list[dict]:
    out: list[dict] = []
    for m in messages:
        role = "assistant" if m.get("role") == "assistant" else "user"
        text = str(m.get("content") or "").strip()
        if not text:
            continue
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n\n" + text
        else:
            out.append({"role": role, "content": text})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def _post(url: str, headers: dict, body: dict, timeout: int) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json", **headers})
    host = urllib.parse.urlparse(url).netloc
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(MAX_REPLY + 1)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            j = json.loads(e.read(20000))
            err = j.get("error", j) if isinstance(j, dict) else {}
            detail = str(err.get("message") if isinstance(err, dict) else err or "")[:300]
        except (ValueError, OSError, AttributeError):
            pass
        if e.code in (401, 403):
            raise AIError(401, f"{host} refused the request; check the API key in AI settings." + (f" ({detail})" if detail else ""))
        if e.code == 404:
            raise AIError(502, f"{host} does not have that endpoint or model." + (f" ({detail})" if detail else ""))
        if e.code == 429:
            raise AIError(429, f"{host} is busy or the plan limit is reached; try again in a minute.")
        raise AIError(502, f"{host} answered {e.code}." + (f" {detail}" if detail else ""))
    except TimeoutError:
        raise AIError(504, f"{host} took too long to answer. Try the fast effort level or a shorter text.")
    except (urllib.error.URLError, OSError) as e:
        if isinstance(getattr(e, "reason", None), TimeoutError) or isinstance(getattr(e, "reason", None), socket.timeout):
            raise AIError(504, f"{host} took too long to answer. Try the fast effort level or a shorter text.")
        raise AIError(502, f"Could not reach {host} ({getattr(e, 'reason', e)}).")
    if len(raw) > MAX_REPLY:
        raise AIError(502, "The provider's answer was too large.")
    try:
        out = json.loads(raw)
    except ValueError:
        raise AIError(502, f"{host} sent something that is not JSON.")
    if not isinstance(out, dict):
        raise AIError(502, f"{host} sent an unexpected answer.")
    return out


def anthropic_complete(s: dict, system: str, messages: list[dict], model: str, effort: str, timeout: int) -> dict:
    cfg = EFFORT[effort]
    msgs = _tidy(messages)
    if not msgs:
        raise AIError(400, "There is nothing to send.")
    body: dict = {"model": model, "max_tokens": cfg["max_tokens"], "system": system, "messages": msgs}
    if cfg["thinking"]:
        body["thinking"] = {"type": "enabled", "budget_tokens": cfg["thinking"]}
    base = s["baseUrl"] or "https://api.anthropic.com"
    out = _post(f"{base}/v1/messages", {"x-api-key": s["key"], "anthropic-version": "2023-06-01"}, body, timeout)
    text = "".join(str(b.get("text") or "") for b in out.get("content") or [] if isinstance(b, dict) and b.get("type") == "text")
    if not text.strip():
        raise AIError(502, "The model sent back no text.")
    use = out.get("usage") or {}
    return {"text": text.strip(), "model": str(out.get("model") or model), "usage": {"input": use.get("input_tokens"), "output": use.get("output_tokens")}}


def openai_complete(s: dict, system: str, messages: list[dict], model: str, effort: str, timeout: int) -> dict:
    cfg = EFFORT[effort]
    msgs = _tidy(messages)
    if not msgs:
        raise AIError(400, "There is nothing to send.")
    body = {"model": model, "max_tokens": cfg["max_tokens"], "messages": [{"role": "system", "content": system}, *msgs]}
    headers = {"Authorization": f"Bearer {s['key']}"} if s["key"] else {}
    base = s["baseUrl"] or "https://api.openai.com/v1"
    out = _post(f"{base}/chat/completions", headers, body, timeout)
    try:
        text = str(out["choices"][0]["message"]["content"] or "")
    except (KeyError, IndexError, TypeError):
        raise AIError(502, "The provider's answer had no message.")
    if not text.strip():
        raise AIError(502, "The model sent back no text.")
    use = out.get("usage") or {}
    return {"text": text.strip(), "model": str(out.get("model") or model), "usage": {"input": use.get("prompt_tokens"), "output": use.get("completion_tokens")}}


def complete(s: dict, system: str, messages: list[dict], model: str, effort: str) -> dict:
    timeout = {"fast": 60, "balanced": 120, "thorough": 240}[effort]
    fn = anthropic_complete if s["provider"] == "anthropic" else openai_complete
    return fn(s, system, messages, model or s["model"], effort, timeout)


def _same_origin(a: str, b: str) -> bool:
    pa, pb = urllib.parse.urlparse(a), urllib.parse.urlparse(b)
    return (pa.scheme, pa.hostname, pa.port) == (pb.scheme, pb.hostname, pb.port)


def _public(url: str) -> None:
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise AIError(502, "The provider sent a picture address that is not a web address.")
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise AIError(502, f"{p.hostname} could not be found.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
            raise AIError(502, "The provider sent a picture address on a private network.")


def _fetch_image(url: str, base: str) -> bytes:
    if not _same_origin(url, base):
        _public(url)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            data = r.read(config.MAX_MEDIA_BYTES + 1)
    except (urllib.error.URLError, OSError) as e:
        raise AIError(502, f"Could not download the generated picture ({getattr(e, 'reason', e)}).")
    if len(data) > config.MAX_MEDIA_BYTES:
        raise AIError(413, "The generated picture is too large.")
    return data


def image(base: str, key: str, model: str, prompt: str, size: str) -> tuple[bytes, str]:
    body: dict = {"prompt": prompt, "n": 1, "size": size}
    if model:
        body["model"] = model
    out = _post(f"{base}/images/generations", {"Authorization": f"Bearer {key}"} if key else {}, body, 180)
    try:
        item = out["data"][0]
    except (KeyError, IndexError, TypeError):
        raise AIError(502, "The provider's answer had no picture.")
    if item.get("b64_json"):
        try:
            return base64.b64decode(item["b64_json"]), str(item.get("revised_prompt") or "")
        except ValueError:
            raise AIError(502, "The provider's picture could not be decoded.")
    if item.get("url"):
        return _fetch_image(str(item["url"]), base), str(item.get("revised_prompt") or "")
    raise AIError(502, "The provider's answer had no picture.")
