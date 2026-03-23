# Security Policy

## Reporting a Vulnerability

The Zoneless team takes security seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **GitHub Security Advisories**: Use the "Report a vulnerability" button in the Security tab of this repository
2. **Email**: Contact the maintainers directly

### What to Include

Please include the following information in your report:

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability and how it might be exploited

### Response Timeline

- **Initial Response**: Within 48 hours of your report
- **Status Update**: Within 7 days with our assessment
- **Resolution**: We aim to resolve critical issues within 30 days

### What to Expect

- We will acknowledge receipt of your vulnerability report
- We will provide an estimated timeline for addressing the vulnerability
- We will notify you when the vulnerability is fixed
- We will publicly acknowledge your responsible disclosure (unless you prefer to remain anonymous)

## Security Best Practices for Self-Hosting

See the [Deployment Guide](https://zoneless.com/docs/deployment) for full production setup instructions.

Key points:

- Set a strong `APP_SECRET` via environment variable (`openssl rand -hex 64`)
- Enable MongoDB authentication
- Use HTTPS with a reverse proxy (Caddy, nginx, Cloudflare)
- Never commit `.env` files to version control
- Rotate API keys periodically

## Acknowledgments

We would like to thank the following individuals for responsibly disclosing security issues.
