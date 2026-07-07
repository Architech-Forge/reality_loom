# Security Policy

Reality Loom is an early public foundation. Please handle security issues carefully.

## Do Not Post Publicly

Do not open public issues containing:

- API keys
- tokens
- passwords
- private environment variables
- proprietary prompts
- private user data
- production logs
- sensitive traces
- exploit details that create immediate risk

## Reporting

For now, report sensitive issues privately to the project maintainer / Architech Forge owner.

Recommended future setup:

```text
security@realityloom.com
security@architechforge.com
```

Until a dedicated security channel exists, avoid including secrets in public GitHub issues.

## Secret Handling

Before public release, the repository must be scanned for:

- `.env`
- `.env.local`
- `.env.production`
- API keys
- Supabase keys
- OpenAI / AI provider keys
- Stripe keys
- Resend keys
- Vercel tokens
- GitHub tokens
- database URLs
- cloud credentials
- private SSH keys
- raw prompt files considered proprietary
- user data exports
- private traces/logs

## Principle

```text
No private API keys.
No proprietary app code.
No raw prompts considered moat.
No user data.
No private traces.
```
