# Security

Please report vulnerabilities privately through GitHub:
[Report a vulnerability](https://github.com/mattrothenberg/sillon/security/advisories/new).
Don't open a public issue for them.

## How releases are protected

- `@sillon/core` and `@sillon/react` are published only by `.github/workflows/release.yml`,
  through npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). There
  are no npm tokens in this repository, and the packages disallow token publishing.
- The trusted publisher is limited to [staged publishing](https://docs.npmjs.com/staged-publishing),
  and to the `npm` GitHub environment, which only a maintainer can approve and only
  from `main`. A release needs two approvals: the environment in GitHub, then each
  staged version on npm, with 2FA.
- Workflows start with no permissions, pin every action to a commit SHA, and pin the
  npm CLI version. Dependencies resolve only to versions published at least three
  days earlier (`minimumReleaseAge`), and dependency install scripts are off by default.
- `main` can't be force-pushed or deleted, and release tags can't be moved or deleted.
