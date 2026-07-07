# Public Release Checklist

Use this before pushing Reality Loom public on GitHub.

## 1. Ownership

- [ ] Repository owner is correct: Architech Forge
- [ ] README states Reality Loom is currently owned/published by Architech Forge
- [ ] README states planned future Reality Loom entity/company
- [ ] Personal authorship is credited without confusing IP ownership
- [ ] Trademark notice is included

## 2. Licensing

- [ ] `LICENSE` exists for code
- [ ] `DOCS-LICENSE.md` exists for docs/specs
- [ ] `NOTICE` exists
- [ ] `TRADEMARKS.md` exists
- [ ] README clearly says trademarks are reserved

## 3. Secrets

Confirm the repository contains no:

- [ ] `.env`
- [ ] `.env.local`
- [ ] `.env.production`
- [ ] API keys
- [ ] OpenAI / Anthropic / AI provider keys
- [ ] Supabase keys
- [ ] database URLs
- [ ] Vercel tokens
- [ ] Stripe keys
- [ ] Resend keys
- [ ] GitHub tokens
- [ ] private SSH keys
- [ ] cloud credentials
- [ ] local config containing secrets

Recommended commands:

```bash
git status
git diff --cached
find . -name ".env*" -print
grep -R "sk-" . --exclude-dir=node_modules --exclude-dir=.git
grep -R "SUPABASE" . --exclude-dir=node_modules --exclude-dir=.git
grep -R "PRIVATE_KEY" . --exclude-dir=node_modules --exclude-dir=.git
```

Also consider running:

```bash
gitleaks detect --source .
```

## 4. Private Product Code

Confirm the repository contains no:

- [ ] SoBirdi / LilBirdi app source
- [ ] Sentii app source
- [ ] DeckLogic app source
- [ ] Autelier app source
- [ ] Trader Sherpa app source
- [ ] private product adapters
- [ ] private admin tooling
- [ ] proprietary cloud runtime
- [ ] proprietary AI orchestration logic
- [ ] private avatar pipeline
- [ ] private commerce/recommendation code

## 5. Private Prompts / Moat

Confirm the repository contains no:

- [ ] private production prompts
- [ ] model routing rules considered proprietary
- [ ] ranking/scoring logic considered moat
- [ ] app-specific stylist/commercial intelligence
- [ ] private memory or personalization prompts
- [ ] private product strategy docs

Public examples should be generic, synthetic, and clearly non-production.

## 6. User / Customer / Personal Data

Confirm the repository contains no:

- [ ] user data
- [ ] personal data
- [ ] production logs
- [ ] production traces
- [ ] uploaded photos
- [ ] receipts
- [ ] private screenshots
- [ ] customer docs
- [ ] investor docs
- [ ] financial docs

## 7. Build Health

- [ ] Repo installs cleanly
- [ ] Types compile
- [ ] Tests pass or draft status is clearly documented
- [ ] Examples are synthetic
- [ ] README accurately describes current maturity

## 8. Public Framing

- [ ] Announcement is ready
- [ ] README is clear
- [ ] Architecture diagram exists
- [ ] Boundary notes exist
- [ ] Draft/pre-1.0 status is visible
- [ ] Contribution expectations are clear or marked coming soon

## Final Rule

```text
Open-source Reality Loom.
Do not accidentally open-source the private products built on it.
```
