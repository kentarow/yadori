# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in YADORI, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report via GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/kentarow/yadori/security) of this repository
2. Click "Report a vulnerability"
3. Provide a description of the vulnerability and steps to reproduce

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Security Principles

YADORI follows these security principles (see [CLAUDE.md](CLAUDE.md) for details):

- **No external data transmission** — User entity data never leaves the local machine
- **Localhost only** — Gateway and dashboard bind to localhost; no external exposure
- **Dedicated accounts** — Separate API accounts for each service; never store primary credentials on entity hardware
- **API usage limits** — Always set spending limits on LLM API accounts
- **DM Pairing** — Enable pairing mode for messaging integrations

## Scope

This security policy covers the YADORI framework code. It does not cover:

- Third-party runtimes (OpenClaw, etc.)
- LLM API providers (Anthropic, etc.)
- User's own hardware or network configuration
