# Branch Protection Setup Guide

This guide will help you configure GitHub branch protection rules to ensure that PRs cannot be merged unless linting and tests pass.

## 🚀 Quick Setup

### Step 1: Push Your Code to GitHub

First, make sure your repository is pushed to GitHub with the workflow files:

```bash
git add .
git commit -m "Add GitHub Actions workflows for CI/CD"
git push origin main
```

### Step 2: Configure Branch Protection Rules

1. **Go to your GitHub repository**
2. **Navigate to Settings** → **Branches**
3. **Click "Add rule" or "Add branch protection rule"**

### Step 3: Configure the Rule

**Branch name pattern**: `main`

**Enable these settings**:

✅ **Require a pull request before merging**
- ✅ Require approvals: `1` (or more as needed)
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require review from code owners (if you have a CODEOWNERS file)

✅ **Require status checks to pass before merging**
- ✅ Require branches to be up to date before merging
- **Add these required status checks:**
  - `validate` (from PR Validation workflow)
  - `size-check` (from PR Validation workflow)
  - `test (18.x)` (from CI workflow)
  - `test (20.x)` (from CI workflow) 
  - `test (22.x)` (from CI workflow)
  - `lint` (from CI workflow)
  - `security` (from CI workflow)

✅ **Require conversation resolution before merging**

✅ **Restrict pushes that create files larger than 100MB**

**Optional but recommended**:
- ✅ Require signed commits
- ✅ Include administrators (applies rules to repo admins too)
- ✅ Allow force pushes (for maintainers only)
- ✅ Allow deletions (for maintainers only)

## 🔧 Advanced Configuration

### Status Check Requirements

The workflows create these status checks that you should require:

| Check Name | Purpose | Required |
|------------|---------|----------|
| `validate` | Main PR validation (lint + test + build) | ✅ Yes |
| `size-check` | Bundle size validation | ✅ Yes |
| `test (18.x)` | Tests on Node.js 18 | ✅ Yes |
| `test (20.x)` | Tests on Node.js 20 | ✅ Yes |
| `test (22.x)` | Tests on Node.js 22 | ✅ Yes |
| `lint` | ESLint + TypeScript checks | ✅ Yes |
| `security` | Security audit | ✅ Yes |

### Auto-merge Setup (Optional)

To enable auto-merge for dependabot PRs that pass all checks:

1. Go to **Settings** → **General** → **Pull Requests**
2. ✅ Enable **Allow auto-merge**

## 🛡️ What This Protects Against

With these settings, PRs will be **blocked** if:

- ❌ ESLint fails (code style issues)
- ❌ Tests fail (functionality broken)
- ❌ TypeScript compilation fails
- ❌ Build process fails
- ❌ Security vulnerabilities found
- ❌ Bundle size increases significantly
- ❌ No code review approval

## 🚨 Troubleshooting

### Status Checks Not Appearing

If status checks don't appear in the dropdown:

1. **Create a test PR first** - GitHub needs to see the workflows run once
2. **Wait for workflows to complete** - Status checks appear after first run
3. **Refresh the branch protection settings page**

### Workflow Failing

Common issues and fixes:

- **npm audit fails**: Update vulnerable dependencies
- **Tests fail**: Fix failing tests before merging
- **Lint fails**: Run `npm run lint:fix` locally
- **Build fails**: Check TypeScript compilation errors

### Emergency Override

If you need to merge despite failing checks:

1. **Temporarily disable branch protection** (not recommended)
2. **Or fix the issues** (recommended approach)
3. **Or use admin override** (if you're an admin and it's truly urgent)

## 📝 Testing the Setup

1. **Create a test branch**: `git checkout -b test-branch-protection`
2. **Make a change that breaks linting**: Add a `console.log` without the eslint-disable comment
3. **Push and create a PR**: The PR should show failing status checks
4. **Try to merge**: Should be blocked with red "Merge" button
5. **Fix the issue**: Remove the console.log
6. **Push again**: Status checks should pass and merge should be allowed

## ✅ Verification

Your branch protection is working correctly when:

- ✅ PRs show status check results
- ✅ Failed checks block merging (red merge button)
- ✅ All checks must pass before merging is allowed
- ✅ Branch must be up-to-date before merging
- ✅ At least one approval is required

## 🎯 Result

Once configured, your repository will have:

- **Automatic quality checks** on every PR
- **Prevention of broken code** reaching main branch
- **Consistent code style** enforcement
- **Security vulnerability** detection
- **Multi-Node.js version** compatibility testing

This ensures that your `main` branch always contains working, tested, and properly formatted code! 🚀
