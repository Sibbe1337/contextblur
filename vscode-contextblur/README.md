# ContextBlur for VS Code

Blur sensitive data in your editor during screen sharing, pair programming, or live coding. Automatically detects PII, API keys, secrets, and more.

## Features

- **Auto-Blur** — Scans your code and blurs emails, phone numbers, SSNs, credit cards, API keys, AWS keys, JWTs, connection strings, private keys, and .env values
- **Manual Blur** — Select any text and blur it with a keyboard shortcut
- **3 Blur Styles** — Blackout (default), highlight, or fade
- **Status Bar** — Shows blur count and toggles auto-blur on click
- **Configurable** — Enable/disable individual patterns, set blur style, exclude files

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `ContextBlur: Toggle Auto-Blur` | `Ctrl+Shift+B` / `Cmd+Shift+B` | Toggle auto-blur on/off |
| `ContextBlur: Blur Selection` | `Ctrl+Shift+H` / `Cmd+Shift+H` | Blur selected text manually |
| `ContextBlur: Run Auto-Blur Scan` | — | One-shot scan of current file |
| `ContextBlur: Clear All Blurs` | — | Remove all blurs in current file |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `contextblur.enabled` | `true` | Enable/disable extension |
| `contextblur.style` | `"blackout"` | `blackout`, `highlight`, or `fade` |
| `contextblur.patterns.email` | `true` | Detect emails |
| `contextblur.patterns.phone` | `true` | Detect phone numbers |
| `contextblur.patterns.ssn` | `true` | Detect SSNs |
| `contextblur.patterns.creditCard` | `true` | Detect credit cards |
| `contextblur.patterns.personnummer` | `true` | Detect Swedish personal IDs |
| `contextblur.patterns.apiKey` | `true` | Detect API key-like strings |
| `contextblur.patterns.awsKey` | `true` | Detect AWS access keys |
| `contextblur.patterns.jwt` | `true` | Detect JWT tokens |
| `contextblur.patterns.connectionString` | `true` | Detect DB connection strings |
| `contextblur.patterns.privateKey` | `true` | Detect private key blocks |
| `contextblur.patterns.envValue` | `true` | Detect values in .env files |
| `contextblur.excludeFiles` | `["*.min.js","*.lock","*.map"]` | Glob patterns to skip |

## Detected Patterns

### PII
- Email addresses
- Phone numbers (US format)
- Social Security Numbers
- Credit card numbers
- Swedish personal identity numbers (personnummer)

### Code Secrets
- API keys and tokens (key=value patterns)
- AWS access key IDs (`AKIA...`)
- JWT tokens (`eyJ...`)
- Database connection strings (MongoDB, PostgreSQL, MySQL, Redis)
- Private key blocks (`-----BEGIN ... PRIVATE KEY-----`)
- Environment variable values in .env files

## Privacy

All detection happens locally in your editor. No data is transmitted anywhere.

## Links

- [ContextBlur Browser Extension](https://contextblur.app)
- [Downloads](https://contextblur.app/downloads)
- [Pricing](https://contextblur.app/pricing)
