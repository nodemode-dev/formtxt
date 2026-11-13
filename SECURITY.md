# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormTxt runs on your own machine, so the things that matter most are the ways
something outside it could get in:

- **The engine** binds to loopback (127.0.0.1, port 8210 by default) and answers only
  this computer's own window and agents. Anything that makes it reachable from another
  machine, or from a web page in your browser, without the person turning that on.
- **Share links and live co-editing**: view, comment and edit links reach other
  machines only when network sharing is turned on. Guessing or reusing a link, getting
  more access than a link's mode gives, or reaching a document without a link.
- **Outside agents**: the engine's MCP endpoint runs commands in the open window only
  after the person allows outside agents. Getting past that consent, or running the
  window-only terminal, Claude Code and chat commands from an agent.
- **The terminal dock**: anything that lets a web page, a document or another machine
  reach the shells the engine runs.
- **Keys and passwords** kept in the system password store, and **password-protected
  documents**: anything that leaks a key or password, or reads a protected document's
  content without its password.
- **Opening files**: a .docx, .odt, .rtf, .html, Markdown or `.ftxt` file, or an
  archive, that writes outside where it should, injects markup or script into the
  window, or exhausts the engine's memory.

Bugs that need someone to already control your machine, or to run a modified build
of FormTxt, are ordinary bugs: please open an issue for those.
