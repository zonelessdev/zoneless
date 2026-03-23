# Contributing to Zoneless

Thank you for considering contributing to Zoneless! This guide covers everything you need to get started.

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/zoneless.git`
3. Add the upstream remote: `git remote add upstream https://github.com/zonelessdev/zoneless.git`
4. Create a branch: `git checkout -b feature/your-feature-name`

### Development Setup

```bash
npm install
docker compose up -d        # MongoDB
npx nx serve api            # API
npx nx serve web            # Dashboard (separate terminal)
```

### Running Tests & Linting

```bash
npx nx test api
npx nx test web
npx nx lint api --fix
npx nx lint web --fix
```

## How to Contribute

### Reporting Bugs

Search [existing issues](https://github.com/zonelessdev/zoneless/issues) first. When filing a new one, include:

- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node version, browser)

### Suggesting Features

Open a GitHub issue with a clear description of the proposed functionality and why it would be useful.

### First Contributions

Look for issues labeled `good first issue` or `help wanted`.

## Style Guidelines

- **TypeScript** for all new code
- **PascalCase** for function names: `GetAccount()`, `ValidateUser()`
- **camelCase** for variables: `accountId`, `userName`
- Prefer `const` over `let`, avoid `var`
- Use `async`/`await` over raw promises
- Standalone Angular components with signals for state
- Zod for API request validation

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:

```
feat(api): add webhook endpoint support
fix(web): resolve wallet validation on paste
refactor(web): reorganize component structure
```

## Pull Request Process

1. Ensure tests and linting pass
2. Update documentation if changing functionality
3. Fill out the PR template
4. Wait for review — maintainers may request changes

### PR Checklist

- [ ] Tests pass (`npx nx run-many --target=test --all`)
- [ ] Linting passes (`npx nx run-many --target=lint --all`)
- [ ] No merge conflicts with `main`
