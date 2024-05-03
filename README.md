# Use case

You have CI/CD (e.g. on GitHub Actions)
and want to make sure that the version is updated
or CI/CD will not be executed. This package
compares your project with the previous commit and checks
the package.json version and doesn't allow committing without
changing the version or adding `[skip ci]` to the commit message.
Then you can fix your message or version with the CLI-menu.

You can add pre-commit hook that checks if `.git/commit-pkg` exists
and if it's not, exit with code `1` from the hook to prevent committing
from just `git commit`. This way you will be able to use this only
with the `-n` option.

# Usage

```bash
npx git-commit-pkg <options>
# or
npm i -g git-commit-pkg
commit-pkg <options>
```
