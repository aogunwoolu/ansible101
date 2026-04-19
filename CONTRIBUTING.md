# Contributing to Ansible101

Thanks for helping improve Ansible101.

This project is a React + Vite app focused on visualizing Ansible playbooks, snippets, Jinja2 expressions, and inventory limit behavior.

## Getting Started

1. Fork the repository.
2. Create a feature branch from `main`.
3. Install dependencies.
4. Run the app locally.

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Branch and Commit Guidelines

- Branch naming:
  - `feat/<short-description>`
  - `fix/<short-description>`
  - `docs/<short-description>`
- Keep commits focused and small.
- Write clear commit messages in imperative voice.

Examples:

- `feat: add mobile export menu placement`
- `fix: prevent flow canvas button drag propagation`
- `docs: clarify limits lab sharing behavior`

## Code Style Expectations

- Preserve existing project patterns and component structure.
- Prefer readable, small functions and explicit naming.
- Avoid unrelated refactors in the same PR.
- Keep UI changes responsive (desktop + mobile).
- Do not add heavy dependencies without clear need.

## Testing and Validation

Before opening a PR:

1. Run `npm run build` and ensure it succeeds.
2. Manually verify changed flows in the browser.
3. For UI work, test both desktop and mobile layouts.
4. Verify share/export interactions when relevant.

## Pull Request Checklist

Include the following in your PR description:

- What changed
- Why it changed
- How to test it
- Any screenshots or recordings for UI updates
- Any known limitations

Keep PRs scoped. Large multi-feature PRs are harder to review and merge.

## Suggested Areas to Contribute

- Mobile usability and accessibility improvements
- Parser and flow rendering edge cases
- Better error messages and diagnostics
- Performance tuning for large playbooks
- Documentation and examples

## Reporting Bugs

When filing an issue, include:

- Clear reproduction steps
- Expected vs actual behavior
- Browser/OS info
- Sample YAML/Jinja/inventory input (sanitized)
- Screenshots if useful

## Security and Sensitive Data

- Do not include secrets, tokens, or private inventory details in issues/PRs.
- Share links and example payloads should be sanitized.

## Questions

If you are unsure where to start, open an issue with your proposed change and implementation idea before coding.
