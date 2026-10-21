import re
from xml.sax.saxutils import escape

M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

SYMBOLS = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ", "eta": "η", "theta": "θ",
    "vartheta": "ϑ", "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ",
    "tau": "τ", "upsilon": "υ", "phi": "φ", "varphi": "ϕ", "chi": "χ", "psi": "ψ", "omega": "ω", "Gamma": "Γ", "Delta": "Δ",
    "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    "cdot": "⋅", "times": "×", "div": "÷", "pm": "±", "mp": "∓", "leq": "≤", "le": "≤", "geq": "≥", "ge": "≥", "neq": "≠", "ne": "≠",
    "approx": "≈", "equiv": "≡", "sim": "∼", "infty": "∞", "to": "→", "rightarrow": "→", "leftarrow": "←", "Rightarrow": "⇒",
    "Leftrightarrow": "⇔", "leftrightarrow": "↔", "in": "∈", "notin": "∉", "subset": "⊂", "supset": "⊃", "subseteq": "⊆", "cup": "∪",
    "cap": "∩", "forall": "∀", "exists": "∃", "partial": "∂", "nabla": "∇", "ldots": "…", "cdots": "⋯", "angle": "∠", "circ": "∘",
    "propto": "∝", "emptyset": "∅", "neg": "¬", "land": "∧", "lor": "∨", "ell": "ℓ", "hbar": "ℏ", "prime": "′", "degree": "°",
}
FUNCS = {"sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "lim", "max", "min", "det", "gcd", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"}
NARY = {"sum": "∑", "prod": "∏", "int": "∫", "oint": "∮", "iint": "∬", "bigcup": "⋃", "bigcap": "⋂"}
TOKEN = re.compile(r"\\[a-zA-Z]+|\\.|\s+|.", re.S)


def _tokens(src: str) -> list[str]:
    return [t for t in TOKEN.findall(src) if not t.isspace()]


class _P:
    def __init__(self, tokens: list[str]) -> None:
        self.t = tokens
        self.i = 0

    def peek(self) -> str | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self) -> str | None:
        v = self.peek()
        self.i += 1
        return v

    def group(self) -> str:
        if self.peek() == "{":
            self.take()
            depth, start = 1, self.i
            while self.i < len(self.t) and depth:
                tok = self.take()
                depth += (tok == "{") - (tok == "}")
            return self.sequence(_P(self.t[start:self.i - 1]))
        if self.peek() is None:
            return ""
        return self.atom()

    def sequence(self, p: "_P | None" = None, stop: str | None = None) -> str:
        p = p or self
        out = []
        while p.peek() is not None and p.peek() != stop:
            out.append(p.scripted())
        return "".join(out)

    def scripted(self) -> str:
        base = self.atom(allow_nary=True)
        sub = sup = None
        while self.peek() in ("^", "_"):
            op = self.take()
            arg = self.group()
            if op == "^":
                sup = arg
            else:
                sub = arg
        if base.startswith("\0nary:"):
            chr_ = base[6:]
            body = self.group() if self.peek() not in (None, "}") else ""
            loc = "subSup" if chr_ in "∫∮∬" else "undOvr"
            hide_s = "" if sub is not None else '<m:subHide m:val="1"/>'
            hide_p = "" if sup is not None else '<m:supHide m:val="1"/>'
            return (f'<m:nary><m:naryPr><m:chr m:val="{chr_}"/><m:limLoc m:val="{loc}"/>{hide_s}{hide_p}</m:naryPr>'
                    f"<m:sub>{sub or ''}</m:sub><m:sup>{sup or ''}</m:sup><m:e>{body}</m:e></m:nary>")
        if sub is not None and sup is not None:
            return f"<m:sSubSup><m:e>{base}</m:e><m:sub>{sub}</m:sub><m:sup>{sup}</m:sup></m:sSubSup>"
        if sup is not None:
            return f"<m:sSup><m:e>{base}</m:e><m:sup>{sup}</m:sup></m:sSup>"
        if sub is not None:
            return f"<m:sSub><m:e>{base}</m:e><m:sub>{sub}</m:sub></m:sSub>"
        return base

    def atom(self, allow_nary: bool = False) -> str:
        tok = self.take()
        if tok is None:
            return ""
        if tok == "{":
            self.i -= 1
            return self.group()
        if tok.startswith("\\"):
            name = tok[1:]
            if name == "frac" or name == "dfrac" or name == "tfrac":
                n, d = self.group(), self.group()
                return f"<m:f><m:num>{n}</m:num><m:den>{d}</m:den></m:f>"
            if name == "sqrt":
                deg = ""
                if self.peek() == "[":
                    self.take()
                    buf = []
                    while self.peek() not in (None, "]"):
                        buf.append(self.take())
                    self.take()
                    deg = _run("".join(b for b in buf if b))
                body = self.group()
                hide = "" if deg else '<m:radPr><m:degHide m:val="1"/></m:radPr>'
                return f"<m:rad>{hide}<m:deg>{deg}</m:deg><m:e>{body}</m:e></m:rad>"
            if name in ("text", "mathrm", "mbox", "operatorname", "textbf", "mathbf", "mathit"):
                raw = self.raw_group()
                return _run(raw, normal=name != "mathit")
            if name in ("left",):
                open_ = self.take() or "("
                depth, buf = 1, []
                while self.peek() is not None:
                    if self.peek() == "\\left":
                        depth += 1
                    if self.peek() == "\\right":
                        depth -= 1
                        if depth == 0:
                            break
                    buf.append(self.take())
                self.take()
                close = self.take() or ")"
                inner = _P(buf).sequence()
                o = "" if open_ == "." else open_.lstrip("\\")
                c = "" if close == "." else close.lstrip("\\")
                return f'<m:d><m:dPr><m:begChr m:val="{escape(o)}"/><m:endChr m:val="{escape(c)}"/></m:dPr><m:e>{inner}</m:e></m:d>'
            if name in NARY:
                return "\0nary:" + NARY[name] if allow_nary else _run(NARY[name])
            if name in SYMBOLS:
                return _run(SYMBOLS[name])
            if name in FUNCS:
                return _run(name, normal=True)
            if name in ("quad", "qquad", ",", ";", ":", " "):
                return _run(" " if name in ("quad", "qquad") else " ")
            if name in ("{", "}", "%", "&", "$", "#", "_"):
                return _run(name)
            return _run(name)
        return _run(tok)

    def raw_group(self) -> str:
        if self.peek() != "{":
            return self.take() or ""
        self.take()
        depth, buf = 1, []
        while self.i < len(self.t):
            tok = self.take()
            if tok == "{":
                depth += 1
            elif tok == "}":
                depth -= 1
                if depth == 0:
                    break
            buf.append(tok)
        return "".join(buf)


def _run(text: str, normal: bool = False) -> str:
    if not text:
        return ""
    pr = "<m:rPr><m:nor/></m:rPr>" if normal else ""
    return f'<m:r>{pr}<m:t xml:space="preserve">{escape(text)}</m:t></m:r>'


def to_omml(latex: str, display: bool = False) -> str:
    body = _P(_tokens(latex)).sequence()
    ns = f'xmlns:m="{M_NS}" xmlns:w="{W_NS}"'
    if display:
        return f"<m:oMathPara {ns}><m:oMath>{body}</m:oMath></m:oMathPara>"
    return f"<m:oMath {ns}>{body}</m:oMath>"


INV_SYMBOLS = {v: "\\" + k for k, v in SYMBOLS.items() if k not in ("le", "ge", "ne", "varepsilon", "degree")}


def _text_to_latex(s: str) -> str:
    return "".join(INV_SYMBOLS.get(ch, ch) + (" " if ch in INV_SYMBOLS else "") for ch in s)


def from_omml(el) -> str:
    q = lambda t: "{" + M_NS + "}" + t
    tag = el.tag

    def kids(e) -> str:
        return "".join(from_omml(c) for c in e)

    def child(e, name) -> str:
        c = e.find(q(name))
        return kids(c) if c is not None else ""

    if tag == q("r"):
        t = "".join(x.text or "" for x in el.findall(q("t")))
        return _text_to_latex(t)
    if tag == q("f"):
        return "\\frac{" + child(el, "num") + "}{" + child(el, "den") + "}"
    if tag == q("rad"):
        deg = child(el, "deg")
        return "\\sqrt" + (f"[{deg}]" if deg else "") + "{" + child(el, "e") + "}"
    if tag in (q("sSup"), q("sSub"), q("sSubSup")):
        out = "{" + child(el, "e") + "}"
        if el.find(q("sub")) is not None:
            out += "_{" + child(el, "sub") + "}"
        if el.find(q("sup")) is not None:
            out += "^{" + child(el, "sup") + "}"
        return out
    if tag == q("nary"):
        pr = el.find(q("naryPr"))
        chr_ = "∑"
        if pr is not None and pr.find(q("chr")) is not None:
            chr_ = pr.find(q("chr")).get(q("val")) or chr_
        name = {v: k for k, v in NARY.items()}.get(chr_, "sum")
        out = "\\" + name
        if child(el, "sub"):
            out += "_{" + child(el, "sub") + "}"
        if child(el, "sup"):
            out += "^{" + child(el, "sup") + "}"
        return out + "{" + child(el, "e") + "}"
    if tag == q("d"):
        pr = el.find(q("dPr"))
        o, c = "(", ")"
        if pr is not None:
            if pr.find(q("begChr")) is not None:
                o = pr.find(q("begChr")).get(q("val")) or ""
            if pr.find(q("endChr")) is not None:
                c = pr.find(q("endChr")).get(q("val")) or ""
        return "\\left" + (o or ".") + "".join(kids(e) for e in el.findall(q("e"))) + "\\right" + (c or ".")
    if tag in (q("oMath"), q("oMathPara"), q("e"), q("num"), q("den"), q("sub"), q("sup"), q("deg")):
        return kids(el)
    if tag in (q("acc"), q("bar"), q("box"), q("groupChr"), q("func"), q("limLow"), q("limUpp"), q("fName")):
        return kids(el)
    return ""
