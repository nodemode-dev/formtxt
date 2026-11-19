import json

import pytest


class MemoryKeyring:
    def __init__(self):
        self.values = {}

    def get_password(self, service, account):
        return self.values.get((service, account))

    def set_password(self, service, account, value):
        self.values[(service, account)] = value


@pytest.fixture()
def sealed(monkeypatch):
    from app.core import config, seal

    store = MemoryKeyring()
    monkeypatch.setattr(seal, "_keyring", lambda: store)
    seal.reset()
    before = config.stored_settings()
    yield config, seal
    config.settings_path().write_text(json.dumps(before), encoding="utf-8")
    seal.reset()


def test_the_window_choice_is_sealed_and_stands(sealed):
    config, _ = sealed
    out = config.write_settings({"agentsAllowed": True})
    assert out["agentsAllowed"] is True and out["seal"] == "ok"
    assert "seal" in config.stored_settings()


def test_a_hand_edit_is_caught_and_read_as_ask(sealed):
    config, _ = sealed
    config.write_settings({"agentsAllowed": False})
    stored = config.stored_settings()
    stored["agentsAllowed"] = True
    config.settings_path().write_text(json.dumps(stored), encoding="utf-8")
    out = config.read_settings()
    assert out["agentsAllowed"] is False and out["sealBroken"] is True and out["seal"] == "broken"
    assert config.write_settings({"author": "x"})["agentsAllowed"] is False


def test_with_no_keychain_the_stored_choice_stands(monkeypatch):
    from app.core import config, seal

    monkeypatch.setattr(seal, "_keyring", lambda: None)
    seal.reset()
    before = config.stored_settings()
    try:
        config.settings_path().write_text(json.dumps({**before, "agentsAllowed": True}), encoding="utf-8")
        out = config.read_settings()
        assert out["seal"] == "unavailable" and out["agentsAllowed"] is True
    finally:
        config.settings_path().write_text(json.dumps(before), encoding="utf-8")
        seal.reset()
