---
name: security-review
description: Perform a security review of code changes or an existing codebase. Use when the user asks to review security, check for vulnerabilities, audit auth/access-control logic, or before merging any change that touches authentication, data access, payments, or user input handling.
allowed-tools: Read, Grep, Glob, Bash
---

# Security Review

You are not applying a checklist. You are reasoning about how an adversary
would misuse this system. A checklist tells you *what* patterns to grep for;
this skill tells you *how to think* so you catch the vulnerability that has
no signature.

## Step 1 — Build a mental model before touching code

Before flagging anything, answer these for the code under review:

1. **Who are the actors?** (anonymous user, authenticated user, admin,
   another service, the database itself)
2. **What does each actor currently trust?** (a session cookie, a role
   field on a client object, a URL parameter, a response from another
   service)
3. **Which of those trust points cross a privilege boundary?** — i.e.
   where does the code assume something a malicious actor could forge or
   manipulate?

If you can't answer these three questions, you don't understand the code
well enough to review it yet — read more before judging.

## Step 2 — Reason through these lenses, don't just search for patterns

For every place data crosses a trust boundary, ask:

- **Authentication**: Is identity actually verified, or just assumed
  (e.g. trusting a client-supplied user id/role)?
- **Authorization / IDOR**: Even if identity is verified, does the code
  check that *this specific user* is allowed to touch *this specific
  record* — not just "any user with this role"? (Role check ≠ ownership
  check. This is the single most common real-world vulnerability class.)
- **Injection**: Does untrusted input ever reach a query, a shell command,
  an `eval`, or `innerHTML`/`dangerouslySetInnerHTML` without
  escaping/parameterization?
- **Timing / enumeration**: Does the response time or error message
  differ in a way that leaks whether a record/user exists?
- **Secrets**: Are keys, tokens, or passwords ever logged, put in a URL,
  committed, or sent somewhere they don't need to be?
- **State machine abuse**: Can a legitimate multi-step flow (checkout,
  password reset, invite acceptance) be replayed, reordered, or
  interrupted to reach an invalid state?
- **Client-side trust**: Is any security-relevant decision (role, price,
  ownership, rate limit) enforced *only* in client-side/browser code?
  If the backend doesn't independently re-check it, it is not enforced —
  say so explicitly, don't soften it.

## Step 3 — Severity, not just a list

Never hand back an undifferentiated list of findings. Rank every finding:

- 🔴 **Critical** — exploitable now, by an unauthenticated or low-privilege
  actor, with real impact (data leak, privilege escalation, RCE).
- 🟠 **High** — exploitable but needs some precondition (authenticated
  user, specific timing, chained with another bug).
- 🟡 **Medium** — defense-in-depth gap; not exploitable alone but weakens
  the system (missing rate limit, verbose error message).
- ⚪ **Note** — best-practice deviation with no direct security impact.

For each finding, give: the exact location, the concrete attack scenario
(not "this could be a vulnerability" — show the request/input that
triggers it), and a specific fix — not "add validation."

## Step 4 — Say what you didn't check

If the codebase has no real backend yet (demo/client-only phase), say so
plainly and scope your findings accordingly: distinguish "this is
insecure because there's no server to enforce it yet" (expected, tracked)
from "this pattern will still be insecure even after a server exists"
(a real design flaw to fix now, not later).

## Anti-patterns to actively resist

- Don't produce a wall of generic OWASP-Top-10 boilerplate that isn't
  tied to what the code actually does.
- Don't recommend a security control without checking whether one
  already exists elsewhere in the flow (duplicate/redundant fixes waste
  engineering time).
- Don't treat "we'll fix this when we add the real server" as an excuse
  to skip *documenting* the exact server-side check that will be needed —
  vague future intentions are how real vulnerabilities ship.
