# Changesets

Every change to `@sillon/core` or `@sillon/react` that users should hear about
gets a changeset:

```sh
pnpm changeset
```

Pick the packages and the bump (patch / minor / major) and write one line for
the changelog. The two packages share one version number: a release of either
releases both.

On `main`, the release workflow collects pending changesets into a "Version
packages" PR; merging that PR starts a release (see the root README).
