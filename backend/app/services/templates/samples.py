from app.services.templates.catalog import DocTemplate

Body = list[tuple[str, str]]


def _resume(t: DocTemplate) -> Body:
    out: Body = [("Title", "Alex Rivera"), ("Subtitle", "Product designer · alex.rivera@example.com · +1 555 0100 · Portland, OR")]
    if t.id == "resume-scholar":
        out[1] = ("Subtitle", "Assistant Professor of Linguistics · arivera@example.edu")
        return out + [
            ("Heading1", "Research interests"), ("Normal", "Language change, corpus methods and the sociolinguistics of online writing."),
            ("Heading1", "Appointments"), ("Normal", "2023 to present · Assistant Professor, Department of Linguistics, Example University."),
            ("Heading1", "Education"), ("Normal", "PhD in Linguistics, 2022 · MA in Linguistics, 2018 · BA in English, 2016."),
            ("Heading1", "Publications"), ("Normal", "Rivera, A. (2025). Spelling as signal in informal writing. Journal of Example Linguistics, 12(3), 45 to 67."),
            ("Normal", "Rivera, A. and Chen, M. (2024). Building a corpus of community forums. Proceedings of the Example Conference, 101 to 110."),
            ("Heading1", "Teaching"), ("Normal", "Introduction to Linguistics · Sociolinguistics · Corpus Methods (graduate seminar)."),
        ]
    return out + [
        ("Heading1", "Summary"), ("Normal", "Designer with eight years of experience shipping tools people use every day, from first sketch to measured outcome."),
        ("Heading1", "Experience"), ("Heading3", "Senior Product Designer · Northwind Labs · 2021 to present"),
        ("Normal", "Led the redesign of the editor used by 40,000 teams; cut time to first document by a third."),
        ("Heading3", "Product Designer · Bluebird Studio · 2017 to 2021"), ("Normal", "Designed onboarding, billing and the design system's first component library."),
        ("Heading1", "Education"), ("Normal", "BFA in Interaction Design, Example College of Art, 2017."),
        ("Heading1", "Skills"), ("Normal", "Interaction design · Prototyping · Research · Design systems · Writing for interfaces."),
    ]


def _letter(t: DocTemplate) -> Body:
    head: Body = [("Normal", "Jordan Lee · 12 Harbour Street · Seattle, WA 98101"), ("Normal", "October 21, 2026"),
                  ("Normal", "Sam Patel"), ("Normal", "Hiring Manager, Northwind Labs")]
    if t.id == "letter-personal":
        return [("Normal", "October 21, 2026"), ("Normal", "Dear Maya,"),
                ("Normal", "It has been far too long since my last letter. The garden finally gave us tomatoes this year, more than we could eat, and I thought of you every time I passed the jars on the shelf."),
                ("Normal", "Tell me everything about the new house and whether the cat has forgiven you for the move."),
                ("Normal", "With love,"), ("Normal", "Jo")]
    if t.id == "letter-reference":
        return head + [("Normal", "Dear Sam,"),
                       ("Normal", "I am glad to recommend Alex Rivera, who worked on my team for four years."),
                       ("Normal", "Alex combines careful research with fast, clear execution. They led our editor redesign and mentored three junior designers."),
                       ("Normal", "I recommend Alex without reservation. Please contact me with any questions."),
                       ("Normal", "Sincerely,"), ("Normal", "Jordan Lee, Head of Design")]
    if t.id == "letter-cover":
        return head + [("Normal", "Dear Sam,"),
                       ("Normal", "I am applying for the Senior Product Designer role. I have spent eight years designing tools that teams rely on, and Northwind's editor is one I admire."),
                       ("Normal", "At Bluebird Studio I built the first version of a design system that now serves six products. I would bring the same care to your team."),
                       ("Normal", "Thank you for your time. I would welcome the chance to talk."),
                       ("Normal", "Sincerely,"), ("Normal", "Alex Rivera")]
    return head + [("Normal", "Dear Sam,"), ("Normal", "Thank you for meeting with us last week. This letter confirms the terms we discussed."),
                   ("Normal", "We will deliver the first phase by December 1 and the second by February 15, as set out in the attached schedule."),
                   ("Normal", "Please sign and return a copy at your convenience."), ("Normal", "Sincerely,"), ("Normal", "Jordan Lee")]


def _report(t: DocTemplate) -> Body:
    sections = {
        "report-annual": ["Highlights", "Results", "Our people", "Outlook"],
        "report-research": ["Summary", "Background", "Method", "Findings", "Recommendations"],
        "report-project": ["Status", "Progress this period", "Risks and issues", "Next steps"],
        "report-incident": ["Summary", "Impact", "Timeline", "Root causes", "Action items"],
    }[t.id]
    out: Body = [("Title", t.name), ("Subtitle", "Prepared by the Operations team · October 2026")]
    for i, s in enumerate(sections):
        out += [("Heading1", s), ("Normal", f"Replace this paragraph with your {s.lower()}. Keep each paragraph to one idea and lead with the conclusion.")]
        if i == 1:
            out.append(("Quote", "One clear sentence that a busy reader will remember."))
    return out


def _essay(t: DocTemplate) -> Body:
    out: Body = []
    if t.id == "essay-mla":
        out += [("Normal", "Alex Rivera"), ("Normal", "Professor Chen"), ("Normal", "English 101"), ("Normal", "21 October 2026")]
    out += [("Title", "On Keeping a Notebook"),
            ("Normal", "Every writer keeps some kind of notebook, even the ones who claim not to. The question is never whether to write things down but what deserves to be kept."),
            ("Normal", "This essay argues that a notebook is less a record of events than a record of attention: what we notice says more about us than what happened."),
            ("Heading2", "What gets written down"),
            ("Normal", "Lists, overheard lines, the colour of a particular afternoon. None of it is evidence, and all of it is true."),
            ("Heading2", "Why it matters"),
            ("Normal", "Reading an old notebook is meeting a stranger who knows your secrets. That stranger is the best editor you will ever have.")]
    return out


def _memo(t: DocTemplate) -> Body:
    if t.id == "memo-update":
        return [("Title", "Team update · Week 43"), ("Heading2", "Wins"), ("Normal", "Shipped the new onboarding flow to every customer."),
                ("Heading2", "Blockers"), ("Normal", "Waiting on legal review for the data export terms."),
                ("Heading2", "Next week"), ("Normal", "Start the billing migration and finish hiring for the support lead.")]
    out: Body = [("Title", "Memo" if t.id == "memo-standard" else "Decision brief"),
                 ("Normal", "To: Leadership team"), ("Normal", "From: Jordan Lee"), ("Normal", "Date: October 21, 2026"),
                 ("Normal", "Subject: Moving the support desk to a follow-the-sun rota")]
    if t.id == "memo-brief":
        return out + [("Heading2", "Decision needed"), ("Normal", "Approve a second support shift in Lisbon from January."),
                      ("Heading2", "Options"), ("Normal", "Hire in Lisbon, extend Seattle hours, or contract an agency."),
                      ("Heading2", "Recommendation"), ("Normal", "Hire in Lisbon: lowest cost per resolved ticket and the best coverage.")]
    return out + [("Normal", "Starting in January, customers will reach a person at any hour on weekdays. This memo explains the change and what it means for each team.")]


def _newsletter(t: DocTemplate) -> Body:
    name = {"news-community": "The Elm Street Gazette", "news-company": "Northwind Weekly", "news-school": "Harbour School News"}[t.id]
    return [("Title", name), ("Subtitle", "Issue 12 · October 2026"),
            ("Heading1", "This month"), ("Normal", "A short lead story that tells readers what happened and why it matters to them."),
            ("Heading2", "Dates for your calendar"), ("Normal", "November 2 · Open evening. November 14 · Volunteer day. December 6 · Winter fair."),
            ("Heading2", "Meet the team"), ("Normal", "Each issue introduces one person and what they are working on."),
            ("Quote", "Have a story to share? Reply to this newsletter and tell us.")]


def _proposal(t: DocTemplate) -> Body:
    sections = {
        "proposal-project": ["Problem", "Proposed solution", "Plan and timeline", "Budget", "Team"],
        "proposal-grant": ["Summary", "Aims", "Method", "Budget and justification", "Evaluation"],
        "proposal-sales": ["Your needs", "Our offer", "Pricing", "Terms", "Next steps"],
        "proposal-rfc": ["Context", "Goals and non-goals", "Design", "Alternatives considered", "Rollout"],
    }[t.id]
    out: Body = [("Title", t.name), ("Subtitle", "Draft for review · October 2026")]
    for s in sections:
        out += [("Heading1", s), ("Normal", f"Write the {s.lower()} here. Short paragraphs and concrete numbers read best.")]
    return out


def _meeting(t: DocTemplate) -> Body:
    if t.id == "meeting-minutes":
        return [("Title", "Minutes of the Board Meeting"), ("Subtitle", "October 21, 2026 · 6:00 pm · Main hall"),
                ("Heading2", "Present"), ("Normal", "Chair, Treasurer, Secretary and four directors. Quorum confirmed."),
                ("Heading2", "Motions"), ("Normal", "Motion to approve the 2027 budget. Proposed by the Treasurer, seconded. Carried 6 to 1."),
                ("Heading2", "Close"), ("Normal", "The meeting closed at 7:40 pm. Next meeting: November 18, 2026.")]
    if t.id == "meeting-oneonone":
        return [("Title", "Alex and Jordan · one-on-one"), ("Heading2", "October 21, 2026"),
                ("Normal", "Topics: the billing project, conference talk, time off in December."),
                ("Normal", "Follow-ups: Jordan to introduce Alex to the finance lead.")]
    return [("Title", "Weekly product sync"), ("Subtitle", "October 21, 2026 · 30 minutes"),
            ("Heading2", "Attendees"), ("Normal", "Alex, Jordan, Sam, Maya"),
            ("Heading2", "Agenda"), ("Normal", "Launch readiness · Support load · Hiring"),
            ("Heading2", "Notes"), ("Normal", "Launch is on track for November 3; the help centre articles are the last open item."),
            ("Heading2", "Decisions"), ("Normal", "Ship with the new pricing page; revisit the free tier in Q1."),
            ("Heading2", "Action items"), ("Normal", "Sam: publish help articles by October 30. Maya: final QA pass by November 1.")]


def _academic(t: DocTemplate) -> Body:
    if t.id == "academic-syllabus":
        return [("Title", "LING 210 · Language and Society"), ("Subtitle", "Spring 2027 · Tuesdays and Thursdays, 10:30 am"),
                ("Heading1", "Course description"), ("Normal", "How language varies across communities and changes over time."),
                ("Heading1", "Schedule"), ("Normal", "Week 1 · What is a language? Week 2 · Dialects and accents. Week 3 · Language online."),
                ("Heading1", "Grading"), ("Normal", "Participation 10 percent · Weekly responses 30 percent · Project 60 percent."),
                ("Heading1", "Policies"), ("Normal", "Late work, accessibility and academic integrity.")]
    if t.id == "academic-lab":
        return [("Title", "The rate of a simple reaction"), ("Subtitle", "Alex Rivera · Chemistry 120 · Lab 4"),
                ("Heading1", "Aim"), ("Normal", "To measure how temperature affects the rate of reaction."),
                ("Heading1", "Method"), ("Normal", "Five trials at temperatures from 20 to 60 degrees Celsius."),
                ("Heading1", "Results"), ("Normal", "The reaction time halved for roughly every ten-degree rise."),
                ("Heading1", "Discussion"), ("Normal", "The results agree with the collision model within the error of the stopwatch."),
                ("Heading1", "Conclusion"), ("Normal", "Higher temperature increased the reaction rate.")]
    out: Body = [("Title", "Spelling as Signal in Informal Writing" if t.id == "academic-paper" else "Patterns of Change in Online Writing"),
                 ("Subtitle", "Alex Rivera · Example University"), ("Heading1", "Abstract"),
                 ("Normal", "A one-paragraph summary of the question, the method, the main finding and why it matters.")]
    chapters = ["Introduction", "Related work", "Method", "Results", "Discussion", "References"] if t.id == "academic-paper" else \
        ["Chapter 1 · Introduction", "Chapter 2 · Literature review", "Chapter 3 · Method", "Chapter 4 · Findings", "Chapter 5 · Conclusion", "References"]
    for c in chapters:
        out += [("Heading1", c), ("Normal", "Write this section here.")]
    return out


def _business(t: DocTemplate) -> Body:
    sections = {
        "business-plan": ["Executive summary", "Market", "Product", "Go to market", "Operations", "Financials"],
        "business-sop": ["Purpose", "Scope", "Responsibilities", "Procedure", "Records"],
        "business-policy": ["Purpose", "Scope", "Policy", "Exceptions", "Contacts"],
        "business-invoice": ["Parties", "Services", "Fees and payment", "Term and termination", "Signatures"],
    }[t.id]
    out: Body = [("Title", t.name), ("Subtitle", "Northwind Labs · Version 1.0 · October 2026")]
    for s in sections:
        out += [("Heading1", s), ("Normal", f"Describe the {s.lower()} here in plain language.")]
    return out


def _personal(t: DocTemplate) -> Body:
    if t.id == "personal-recipe":
        return [("Title", "Tomato and White Bean Soup"), ("Subtitle", "Serves 4 · 40 minutes"),
                ("Heading2", "Ingredients"), ("Normal", "2 tablespoons olive oil · 1 onion · 3 garlic cloves · 800 g tomatoes · 400 g white beans · 750 ml stock · salt and pepper"),
                ("Heading2", "Method"), ("Normal", "Soften the onion and garlic in the oil. Add the tomatoes and stock and simmer for 20 minutes. Add the beans, warm through and season."),
                ("Heading2", "Notes"), ("Normal", "Better the next day. Freezes well.")]
    if t.id == "personal-travel":
        return [("Title", "Lisbon in Five Days"), ("Subtitle", "April 3 to 8, 2027"),
                ("Heading2", "Day 1 · Alfama"), ("Normal", "Arrive, drop bags, walk up to the castle for the evening light."),
                ("Heading2", "Day 2 · Belem"), ("Normal", "Tower, monastery and the custard tarts everyone talks about."),
                ("Heading2", "Bookings"), ("Normal", "Flight TP 1234 · Hotel confirmation 55120."),
                ("Heading2", "Packing"), ("Normal", "Walking shoes, light jacket, adapter, phrasebook.")]
    return [("Title", "October 21, 2026"), ("Normal", "What happened today:"), ("Normal", "What I noticed:"),
            ("Normal", "What I am grateful for:"), ("Quote", "Write without stopping for ten minutes. Edit nothing.")]


BUILDERS = {"Resume": _resume, "Letter": _letter, "Report": _report, "Essay": _essay, "Memo": _memo,
            "Newsletter": _newsletter, "Proposal": _proposal, "Meeting notes": _meeting, "Academic": _academic,
            "Business": _business, "Personal": _personal}


def sample_body(t: DocTemplate) -> Body:
    return BUILDERS[t.category](t)
