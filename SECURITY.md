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
- **No agent tools** — YADORI entities do not execute commands, browse the web, or perform automated tasks. Disable these capabilities in OpenClaw
- **Workspace isolation** — File access restricted to `~/.openclaw/workspace/` only

## OpenClaw Hardening

OpenClaw is a general-purpose AI agent platform with broad system access by default. When used exclusively for YADORI, most of these capabilities should be disabled.

See `docs/setup-guide-mac.md` section 14-2 for the recommended `openclaw.json` configuration that:

- Restricts tools to read and message only
- Disables exec, browser, web access, and automation
- Limits filesystem access to the workspace directory
- Binds the gateway to localhost
- Enables DM pairing for messaging channels

**Do not install ClawHub skills.** The skill marketplace has known risks of malicious plugins.

## Scope

This security policy covers the YADORI framework code. It does not cover:

- Third-party runtimes (OpenClaw, etc.)
- LLM API providers (Anthropic, etc.)
- User's own hardware or network configuration

For OpenClaw-specific security, refer to [OpenClaw Security Documentation](https://docs.openclaw.ai/gateway/security).
