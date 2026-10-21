import math
import re
from dataclasses import dataclass, field

MAX_DEPTH = 200
CELL = re.compile(r"^([A-Za-z]{1,3})([0-9]{1,4})$")
DIRECTIONS = ("above", "below", "left", "right")


class FormulaError(ValueError):
    def __init__(self, msg: str, pos: int = 0):
        super().__init__(msg)
        self.pos = pos


@dataclass
class Tok:
    k: str
    s: str = ""
    n: float = 0.0
    pos: int = 0


def lex(src: str) -> list[Tok]:
    out: list[Tok] = []
    i, n = 0, len(src)
    while i < n:
        r = src[i]
        if r.isspace():
            i += 1
        elif r.isdigit() or (r == "." and i + 1 < n and src[i + 1].isdigit()):
            j = i
            while j < n and (src[j].isdigit() or src[j] in "._"):
                j += 1
            if j < n and src[j] in "eE":
                k = j + 1
                if k < n and src[k] in "+-":
                    k += 1
                if k < n and src[k].isdigit():
                    j = k
                    while j < n and src[j].isdigit():
                        j += 1
            try:
                out.append(Tok("num", n=float(src[i:j].replace("_", "")), pos=i))
            except ValueError:
                raise FormulaError(f"{src[i:j]!r} is not a number", i)
            i = j
        elif r in "\"'“‘":
            closer = {"“": "”", "‘": "’"}.get(r, r)
            buf, j, closed = [], i + 1, False
            while j < n:
                c = src[j]
                if c == "\\" and j + 1 < n:
                    buf.append({"n": "\n", "t": "\t"}.get(src[j + 1], src[j + 1]))
                    j += 2
                    continue
                if c == closer or (closer != r and c == r):
                    j += 1
                    closed = True
                    break
                buf.append(c)
                j += 1
            if not closed:
                raise FormulaError("a text value is missing its closing quote", i)
            out.append(Tok("str", s="".join(buf), pos=i))
            i = j
        elif r.isalpha() or r == "_":
            j = i
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            out.append(Tok("ident", s=src[i:j], pos=i))
            i = j
        else:
            two = src[i:i + 2]
            if two in ("==", "!=", ">=", "<=", "&&", "||", "<>"):
                out.append(Tok("op", s="!=" if two == "<>" else two, pos=i))
                i += 2
                continue
            if r in "+-*/%^><!()[],.?:=&;":
                out.append(Tok("op", s="," if r == ";" else r, pos=i))
                i += 1
            elif r in "≠≥≤":
                out.append(Tok("op", s={"≠": "!=", "≥": ">=", "≤": "<="}[r], pos=i))
                i += 1
            else:
                raise FormulaError(f"unexpected character {r!r}", i)
    out.append(Tok("eof", pos=len(src)))
    return out


@dataclass
class Node:
    kind: str
    pos: int = 0
    value: object = None
    name: str = ""
    args: list = field(default_factory=list)


class Parser:
    def __init__(self, toks: list[Tok]):
        self.toks, self.i, self.depth = toks, 0, 0

    def peek(self) -> Tok:
        return self.toks[self.i]

    def next(self) -> Tok:
        t = self.toks[self.i]
        if self.i < len(self.toks) - 1:
            self.i += 1
        return t

    def is_op(self, s: str) -> bool:
        t = self.peek()
        return t.k == "op" and t.s == s

    def expect(self, s: str) -> None:
        if not self.is_op(s):
            t = self.peek()
            raise FormulaError(f"expected {s!r} before the end" if t.k == "eof" else f"expected {s!r}", t.pos)
        self.next()

    def power(self) -> tuple[str, int] | None:
        t = self.peek()
        if t.k == "ident":
            return {"or": ("||", 2), "and": ("&&", 3)}.get(t.s.lower())
        if t.k != "op":
            return None
        table = {"?": ("?", 1), "||": ("||", 2), "&&": ("&&", 3), "==": ("==", 4), "!=": ("!=", 4), "=": ("==", 4),
                 "<": ("<", 5), ">": (">", 5), "<=": ("<=", 5), ">=": (">=", 5), "&": ("&", 6),
                 "+": ("+", 6), "-": ("-", 6), "*": ("*", 7), "/": ("/", 7), "%": ("%", 7), "^": ("^", 8)}
        return table.get(t.s)

    def expr(self, minimum: int) -> Node:
        self.depth += 1
        try:
            if self.depth > MAX_DEPTH:
                raise FormulaError("the formula nests too deeply", self.peek().pos)
            left = self.unary()
            while True:
                pw = self.power()
                if not pw or pw[1] < minimum:
                    return left
                op, power = pw
                t = self.next()
                if op == "?":
                    a = self.expr(1)
                    self.expect(":")
                    b = self.expr(1)
                    left = Node("cond", t.pos, args=[left, a, b])
                    continue
                right = self.expr(power if op == "^" else power + 1)
                left = Node("bin", t.pos, name=op, args=[left, right])
        finally:
            self.depth -= 1

    def unary(self) -> Node:
        t = self.peek()
        if t.k == "op" and t.s in ("-", "!", "+"):
            self.next()
            x = self.expr(9)
            return x if t.s == "+" else Node("un", t.pos, name=t.s, args=[x])
        if t.k == "ident" and t.s.lower() == "not" and not (self.toks[self.i + 1].k == "op" and self.toks[self.i + 1].s == "("):
            self.next()
            return Node("un", t.pos, name="!", args=[self.expr(9)])
        return self.primary()

    def call_args(self) -> list[Node]:
        self.expect("(")
        out: list[Node] = []
        if self.is_op(")"):
            self.next()
            return out
        while True:
            out.append(self.expr(1))
            if self.is_op(","):
                self.next()
                continue
            self.expect(")")
            return out

    def primary(self) -> Node:
        t = self.next()
        if t.k == "num":
            return Node("num", t.pos, value=t.n)
        if t.k == "str":
            return Node("str", t.pos, value=t.s)
        if t.k == "ident":
            low = t.s.lower()
            if low in ("true", "false"):
                return Node("bool", t.pos, value=low == "true")
            if self.is_op("("):
                return Node("call", t.pos, name=low, args=self.call_args())
            if CELL.match(t.s) and self.is_op(":") and self.toks[self.i + 1].k == "ident" and CELL.match(self.toks[self.i + 1].s):
                self.next()
                end = self.next()
                return Node("range", t.pos, value=(t.s.upper(), end.s.upper()))
            if CELL.match(t.s):
                return Node("cell", t.pos, value=t.s.upper())
            if low in DIRECTIONS:
                return Node("dir", t.pos, value=low)
            return Node("ident", t.pos, name=t.s)
        if t.k == "op" and t.s == "(":
            x = self.expr(0)
            self.expect(")")
            return x
        if t.k == "op" and t.s == "[":
            items: list[Node] = []
            if self.is_op("]"):
                self.next()
                return Node("list", t.pos, args=items)
            while True:
                items.append(self.expr(1))
                if self.is_op(","):
                    self.next()
                    continue
                self.expect("]")
                return Node("list", t.pos, args=items)
        if t.k == "eof":
            raise FormulaError("the formula ends too early", t.pos)
        raise FormulaError(f"unexpected {t.s!r}", t.pos)


def parse(src: str) -> Node:
    text = src.strip()
    if text.startswith("="):
        text = text[1:]
    toks = lex(text)
    p = Parser(toks)
    if p.peek().k == "eof":
        raise FormulaError("the formula is empty", 0)
    node = p.expr(0)
    if p.peek().k != "eof":
        raise FormulaError(f"unexpected {p.peek().s!r}", p.peek().pos)
    return node


NUMERIC = re.compile(r"^\(?[-+]?[$€£¥]?\s*[-+]?[0-9][0-9,]*(\.[0-9]+)?\s*%?\)?$|^\(?[-+]?[$€£¥]?\s*\.[0-9]+%?\)?$")


def cell_number(text: str) -> float | None:
    t = (text or "").strip()
    if not t or not NUMERIC.match(t):
        return None
    neg = t.startswith("(") and t.endswith(")")
    pct = t.endswith("%") or t.endswith("%)")
    v = float(re.sub(r"[^0-9.\-+]", "", t) or "nan")
    if math.isnan(v):
        return None
    v = -abs(v) if neg else v
    return v / 100 if pct else v


def col_index(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + ord(ch) - 64
    return n - 1


class Table:
    def __init__(self, grid: list[list[str]], row: int, col: int):
        self.grid, self.row, self.col = grid, row, col

    def at(self, r: int, c: int) -> str | None:
        if 0 <= r < len(self.grid) and 0 <= c < len(self.grid[r]):
            return self.grid[r][c]
        return None

    def ref(self, name: str) -> tuple[int, int]:
        m = CELL.match(name)
        assert m
        return int(m.group(2)) - 1, col_index(m.group(1))

    def direction(self, d: str) -> list[float]:
        dr, dc = {"above": (-1, 0), "below": (1, 0), "left": (0, -1), "right": (0, 1)}[d]
        out: list[float] = []
        r, c = self.row + dr, self.col + dc
        started = False
        while self.at(r, c) is not None:
            v = cell_number(self.at(r, c) or "")
            if v is None:
                if started or (self.at(r, c) or "").strip():
                    break
            else:
                out.append(v)
                started = True
            r, c = r + dr, c + dc
        out.reverse() if d in ("above", "left") else None
        return out


def num(v: object, pos: int) -> float:
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        n = cell_number(v)
        if n is not None:
            return n
        if not v.strip():
            return 0.0
    raise FormulaError(f"{text(v)!r} is not a number", pos)


def text(v: object) -> str:
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float):
        return format_plain(v)
    if isinstance(v, list):
        return ", ".join(text(x) for x in v)
    return str(v)


def format_plain(v: float) -> str:
    if math.isinf(v) or math.isnan(v):
        return "#NUM"
    r = round(v, 10)
    return str(int(r)) if r == int(r) and abs(r) < 1e15 else repr(r)


def truthy(v: object) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, list):
        return bool(v)
    return bool(str(v))


def flat(values: list) -> list[float]:
    out: list[float] = []
    for v in values:
        if isinstance(v, list):
            out.extend(flat(v))
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out.append(float(v))
        elif isinstance(v, bool):
            out.append(1.0 if v else 0.0)
        elif isinstance(v, str):
            n = cell_number(v)
            if n is not None:
                out.append(n)
    return out


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


AGG = {
    "sum": lambda xs: sum(xs), "average": lambda xs: sum(xs) / len(xs) if xs else 0.0, "avg": lambda xs: sum(xs) / len(xs) if xs else 0.0,
    "mean": lambda xs: sum(xs) / len(xs) if xs else 0.0, "min": lambda xs: min(xs) if xs else 0.0, "max": lambda xs: max(xs) if xs else 0.0,
    "count": lambda xs: float(len(xs)), "product": lambda xs: math.prod(xs) if xs else 0.0, "median": lambda xs: _median(xs) if xs else 0.0,
}


class Evaluator:
    def __init__(self, table: Table | None):
        self.table = table

    def need_table(self, pos: int) -> Table:
        if not self.table:
            raise FormulaError("cell references only work inside a table", pos)
        return self.table

    def ev(self, n: Node) -> object:
        k = n.kind
        if k in ("num", "str", "bool"):
            return n.value
        if k == "list":
            return [self.ev(a) for a in n.args]
        if k == "cell":
            t = self.need_table(n.pos)
            r, c = t.ref(str(n.value))
            v = t.at(r, c)
            if v is None:
                raise FormulaError(f"{n.value} is outside the table", n.pos)
            num_v = cell_number(v)
            return num_v if num_v is not None else v
        if k == "range":
            t = self.need_table(n.pos)
            (r1, c1), (r2, c2) = t.ref(n.value[0]), t.ref(n.value[1])
            out: list = []
            for r in range(min(r1, r2), max(r1, r2) + 1):
                for c in range(min(c1, c2), max(c1, c2) + 1):
                    v = t.at(r, c)
                    if v is not None:
                        nv = cell_number(v)
                        out.append(nv if nv is not None else v)
            return out
        if k == "dir":
            return self.need_table(n.pos).direction(str(n.value))
        if k == "ident":
            raise FormulaError(f"{n.name} is not a cell, ABOVE, BELOW, LEFT, RIGHT or a function", n.pos)
        if k == "un":
            v = self.ev(n.args[0])
            return (not truthy(v)) if n.name == "!" else -num(v, n.pos)
        if k == "cond":
            return self.ev(n.args[1]) if truthy(self.ev(n.args[0])) else self.ev(n.args[2])
        if k == "bin":
            return self.binary(n)
        if k == "call":
            return self.call(n)
        raise FormulaError("cannot evaluate this formula", n.pos)

    def binary(self, n: Node) -> object:
        op = n.name
        if op == "&&":
            return truthy(self.ev(n.args[0])) and truthy(self.ev(n.args[1]))
        if op == "||":
            return truthy(self.ev(n.args[0])) or truthy(self.ev(n.args[1]))
        a, b = self.ev(n.args[0]), self.ev(n.args[1])
        if op == "&":
            return text(a) + text(b)
        if op in ("==", "!="):
            same = (num(a, n.pos) == num(b, n.pos)) if not isinstance(a, str) and not isinstance(b, str) else text(a) == text(b)
            return same if op == "==" else not same
        if op in ("<", ">", "<=", ">="):
            x, y = (num(a, n.pos), num(b, n.pos)) if not (isinstance(a, str) and isinstance(b, str)) else (a, b)
            return {"<": x < y, ">": x > y, "<=": x <= y, ">=": x >= y}[op]
        if op == "+" and isinstance(a, str) and cell_number(a) is None and isinstance(b, str) and cell_number(b) is None:
            return a + b
        x, y = num(a, n.pos), num(b, n.pos)
        if op == "+":
            return x + y
        if op == "-":
            return x - y
        if op == "*":
            return x * y
        if op == "/":
            if y == 0:
                raise FormulaError("division by zero", n.pos)
            return x / y
        if op == "%":
            if y == 0:
                raise FormulaError("division by zero", n.pos)
            return math.fmod(x, y)
        if op == "^":
            return math.pow(x, y)
        raise FormulaError(f"unknown operator {op}", n.pos)

    def call(self, n: Node) -> object:
        name = n.name
        if name == "if":
            if len(n.args) not in (2, 3):
                raise FormulaError("IF takes a condition, a value and an optional value", n.pos)
            return self.ev(n.args[1]) if truthy(self.ev(n.args[0])) else (self.ev(n.args[2]) if len(n.args) == 3 else False)
        if name == "and":
            return all(truthy(self.ev(a)) for a in n.args)
        if name == "or":
            return any(truthy(self.ev(a)) for a in n.args)
        args = [self.ev(a) for a in n.args]
        if name in AGG:
            xs = flat(args)
            if name != "count" and not xs and name not in ("sum",):
                return 0.0
            return AGG[name](xs)
        one = {"abs": abs, "int": lambda x: float(math.floor(x)), "floor": lambda x: float(math.floor(x)), "ceil": lambda x: float(math.ceil(x)),
               "sqrt": lambda x: math.sqrt(x) if x >= 0 else float("nan"), "sign": lambda x: float((x > 0) - (x < 0)), "ln": math.log, "exp": math.exp}
        if name in one:
            if len(args) != 1:
                raise FormulaError(f"{name.upper()} takes one value", n.pos)
            return float(one[name](num(args[0], n.pos)))
        if name == "not":
            return not truthy(args[0]) if args else True
        if name == "round":
            places = int(num(args[1], n.pos)) if len(args) > 1 else 0
            v = num(args[0], n.pos) * 10 ** places
            return math.floor(abs(v) + 0.5) * (1 if v >= 0 else -1) / 10 ** places
        if name == "mod":
            y = num(args[1], n.pos)
            if y == 0:
                raise FormulaError("division by zero", n.pos)
            return num(args[0], n.pos) % y
        if name in ("pow", "power"):
            return math.pow(num(args[0], n.pos), num(args[1], n.pos))
        if name == "defined":
            return True
        if name in ("concat", "join"):
            return "".join(text(a) for a in args)
        if name in ("upper", "lower", "trim", "len", "length"):
            s = text(args[0]) if args else ""
            return {"upper": s.upper(), "lower": s.lower(), "trim": s.strip()}.get(name, float(len(s)))
        raise FormulaError(f"unknown function {name.upper()}", n.pos)


def format_value(v: object, pattern: str = "") -> str:
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return text(v)
    x = float(v)
    if math.isinf(x) or math.isnan(x):
        return "#NUM"
    if not pattern:
        return format_plain(round(x, 10))
    m = re.search(r"[#0][#0,]*(\.[#0]+)?%?", pattern)
    if not m:
        return pattern + format_plain(x)
    spec = m.group(0)
    pct = spec.endswith("%") or "%" in pattern[m.end():]
    if pct:
        x *= 100
    decimals = len(m.group(1)) - 1 if m.group(1) else 0
    grouped = "," in spec
    body = f"{abs(x):,.{decimals}f}" if grouped else f"{abs(x):.{decimals}f}"
    if m.group(1) and "#" in m.group(1) and "0" not in m.group(1) and "." in body:
        body = body.rstrip("0").rstrip(".")
    prefix, suffix = pattern[:m.start()], pattern[m.end():]
    if spec.endswith("%") and "%" not in suffix:
        suffix = "%" + suffix
    sign = "-" if x < 0 and round(abs(x), decimals) != 0 else ""
    return f"{sign}{prefix}{body}{suffix}"


def evaluate(code: str, fmt: str = "", grid: list[list[str]] | None = None, row: int = -1, col: int = -1) -> dict:
    try:
        node = parse(code)
        table = Table(grid, row, col) if grid is not None and row >= 0 and col >= 0 else None
        v = Evaluator(table).ev(node)
        if isinstance(v, list):
            v = sum(flat(v))
        return {"ok": True, "value": v if not isinstance(v, float) or math.isfinite(v) else None, "text": format_value(v, fmt)}
    except FormulaError as exc:
        return {"ok": False, "error": str(exc), "pos": exc.pos, "text": "!Syntax Error" if "expected" in str(exc) or "unexpected" in str(exc) else f"!{exc}"}
    except (OverflowError, ValueError, ZeroDivisionError, RecursionError) as exc:
        return {"ok": False, "error": str(exc), "pos": 0, "text": "!Error"}
