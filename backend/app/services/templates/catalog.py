from dataclasses import dataclass, field

CATEGORIES = ["Resume", "Letter", "Report", "Essay", "Memo", "Newsletter", "Proposal", "Meeting notes", "Academic", "Business", "Personal"]

SANS = ("Inter", "Inter")
SERIF = ("Source Serif 4", "Source Serif 4")
CLASSIC = ("Libre Baskerville", "Source Serif 4")
MODERN = ("Space Grotesk", "Inter")
HUMANIST = ("Work Sans", "Work Sans")
PLEX = ("IBM Plex Sans", "IBM Plex Serif")
EDITORIAL = ("Playfair Display", "Lora")
MERRI = ("Merriweather", "Merriweather")


@dataclass(frozen=True)
class DocTemplate:
    id: str
    name: str
    category: str
    layout: str
    accent: str
    fonts: tuple[str, str]
    description: str
    tags: tuple[str, ...] = field(default_factory=tuple)
    size: str = "letter"
    ink: str = "#1a1a1a"


def _t(id: str, name: str, category: str, layout: str, accent: str, fonts: tuple[str, str], description: str, *tags: str, size: str = "letter", ink: str = "#1a1a1a") -> DocTemplate:
    return DocTemplate(id, name, category, layout, accent, fonts, description, tags, size, ink)


TEMPLATES: list[DocTemplate] = [
    _t("resume-clean", "Clean Resume", "Resume", "centered", "#1f2937", SANS, "A one-page resume with a centred name line and plain section rules.", "cv", "job", "one page"),
    _t("resume-ember", "Ember Resume", "Resume", "sidebar", "#c2410c", MODERN, "A resume with a warm accent rule beside every section heading.", "cv", "job", "modern"),
    _t("resume-scholar", "Scholar CV", "Resume", "classic", "#1e3a8a", CLASSIC, "A longer academic CV with publications and teaching.", "cv", "academic", "publications"),
    _t("resume-studio", "Studio Resume", "Resume", "banded", "#0f766e", HUMANIST, "A designer's resume opening on a coloured band.", "cv", "creative", "portfolio"),
    _t("letter-formal", "Formal Letter", "Letter", "letterhead", "#111827", CLASSIC, "A block-format business letter with a letterhead line.", "business", "correspondence"),
    _t("letter-cover", "Cover Letter", "Letter", "letterhead", "#c2410c", SANS, "A cover letter that pairs with the Clean and Ember resumes.", "job", "application"),
    _t("letter-personal", "Personal Letter", "Letter", "classic", "#7c3aed", EDITORIAL, "A warm personal letter with generous margins.", "note", "family"),
    _t("letter-reference", "Reference Letter", "Letter", "letterhead", "#1e3a8a", PLEX, "A recommendation letter with a clear recommendation paragraph.", "recommendation", "hr"),
    _t("report-annual", "Annual Report", "Report", "banded", "#1e3a8a", PLEX, "A structured annual report with highlights, results and outlook.", "finance", "year in review"),
    _t("report-research", "Research Report", "Report", "classic", "#334155", SERIF, "Findings, method and recommendations for a research project.", "findings", "analysis"),
    _t("report-project", "Project Status Report", "Report", "sidebar", "#0f766e", SANS, "A status report with progress, risks and next steps.", "status", "project"),
    _t("report-incident", "Incident Postmortem", "Report", "classic", "#b91c1c", MODERN, "A blameless postmortem: timeline, impact, causes and actions.", "postmortem", "engineering"),
    _t("essay-classic", "Classic Essay", "Essay", "classic", "#111827", CLASSIC, "A double-spaced essay with a centred title.", "school", "writing"),
    _t("essay-modern", "Modern Essay", "Essay", "centered", "#c2410c", HUMANIST, "A clean essay layout for blogs and long reads.", "article", "blog"),
    _t("essay-mla", "MLA Paper", "Essay", "classic", "#111827", SERIF, "An essay laid out the way MLA style asks for.", "mla", "school", "citation"),
    _t("memo-standard", "Standard Memo", "Memo", "letterhead", "#334155", SANS, "To, from, date and subject, then the message.", "internal", "office"),
    _t("memo-brief", "Decision Brief", "Memo", "sidebar", "#7c3aed", PLEX, "A one-page brief that asks for one decision.", "decision", "executive"),
    _t("memo-update", "Team Update", "Memo", "banded", "#0f766e", MODERN, "A weekly team update with wins, blockers and plans.", "weekly", "team"),
    _t("news-community", "Community Newsletter", "Newsletter", "newsletter", "#15803d", EDITORIAL, "A friendly newsletter with a masthead and short stories.", "club", "neighbourhood"),
    _t("news-company", "Company Newsletter", "Newsletter", "newsletter", "#1e3a8a", SANS, "An internal newsletter with news, people and dates.", "internal", "staff"),
    _t("news-school", "School Newsletter", "Newsletter", "newsletter", "#c2410c", HUMANIST, "A school newsletter with notices and upcoming events.", "parents", "events"),
    _t("proposal-project", "Project Proposal", "Proposal", "banded", "#c2410c", MODERN, "Problem, solution, plan, budget and timeline.", "pitch", "plan"),
    _t("proposal-grant", "Grant Proposal", "Proposal", "classic", "#15803d", SERIF, "A grant application with aims, method and budget.", "funding", "nonprofit"),
    _t("proposal-sales", "Sales Proposal", "Proposal", "sidebar", "#1e3a8a", SANS, "A proposal for a client: needs, offer, pricing and terms.", "client", "quote"),
    _t("proposal-rfc", "Engineering RFC", "Proposal", "classic", "#334155", PLEX, "A request for comments: context, design, alternatives and rollout.", "design doc", "engineering", "spec"),
    _t("meeting-notes", "Meeting Notes", "Meeting notes", "sidebar", "#c2410c", SANS, "Attendees, agenda, notes, decisions and action items.", "minutes", "actions"),
    _t("meeting-minutes", "Board Minutes", "Meeting notes", "classic", "#111827", CLASSIC, "Formal minutes with motions and votes.", "board", "governance"),
    _t("meeting-oneonone", "One-on-One", "Meeting notes", "centered", "#7c3aed", HUMANIST, "A running one-on-one doc with topics and follow-ups.", "manager", "coaching"),
    _t("academic-thesis", "Thesis", "Academic", "classic", "#1e3a8a", SERIF, "A thesis skeleton with abstract, chapters and references.", "dissertation", "university"),
    _t("academic-paper", "Journal Article", "Academic", "classic", "#111827", CLASSIC, "A research article with abstract, sections and references.", "paper", "journal", size="a4"),
    _t("academic-lab", "Lab Report", "Academic", "sidebar", "#0f766e", SANS, "Aim, method, results, discussion and conclusion.", "science", "school"),
    _t("academic-syllabus", "Course Syllabus", "Academic", "banded", "#c2410c", HUMANIST, "A course outline with schedule, grading and policies.", "teaching", "course"),
    _t("business-plan", "Business Plan", "Business", "banded", "#1e3a8a", MODERN, "Summary, market, product, operations and financials.", "startup", "strategy"),
    _t("business-sop", "Standard Operating Procedure", "Business", "sidebar", "#334155", PLEX, "A numbered procedure with purpose, scope and steps.", "process", "operations"),
    _t("business-policy", "Policy Document", "Business", "classic", "#111827", SERIF, "A company policy with scope, rules and contacts.", "hr", "compliance"),
    _t("business-invoice", "Service Agreement", "Business", "letterhead", "#15803d", SANS, "A plain-language agreement between two parties.", "contract", "terms"),
    _t("personal-journal", "Journal", "Personal", "centered", "#7c3aed", EDITORIAL, "A dated journal entry with prompts.", "diary", "reflection"),
    _t("personal-recipe", "Recipe", "Personal", "banded", "#c2410c", HUMANIST, "Ingredients, method and notes for one recipe.", "cooking", "food"),
    _t("personal-travel", "Travel Plan", "Personal", "sidebar", "#0f766e", MODERN, "Day-by-day plans, bookings and a packing list.", "trip", "itinerary"),
]

BY_ID = {t.id: t for t in TEMPLATES}


def summary(t: DocTemplate) -> dict:
    return {"id": t.id, "name": t.name, "category": t.category, "layout": t.layout, "accent": t.accent,
            "fonts": {"heading": t.fonts[0], "body": t.fonts[1]}, "description": t.description, "tags": list(t.tags),
            "size": t.size, "builtin": True}
