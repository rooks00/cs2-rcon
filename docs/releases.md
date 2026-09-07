# Releases

The application version lives in `package.json` and `package-lock.json`.
Git release tags use `vMAJOR.MINOR.PATCH`; Docker tags omit the `v`.
The package stays private to prevent accidental npm publication.

## One-time setup

1. Create a Docker Hub repository, for example `YOUR_NAMESPACE/cs2-rcon`.
2. Create a GitHub Actions environment named `dockerhub`. Restrict deployments
   to release tags (`v*`) and add a required reviewer if desired. Protect `main`
   and use a tag ruleset to restrict creating, updating, and deleting `v*` tags
   to release maintainers.
3. In that environment, add variable `DOCKERHUB_IMAGE` (`namespace/repository`)
   and secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. Use a Docker Hub
   access token with only the permissions needed to push to this repository.

Nothing publishes until a release tag is pushed and these credentials exist.
Environment protection must be configured in GitHub; the workflow cannot
establish it. See [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
and [Docker's publishing guide](https://docs.docker.com/guides/gha/).

## Publish a release

On a clean release branch:

```sh
npm version patch --no-git-tag-version
# Use minor or major as appropriate. Update CHANGELOG.md for the new version.
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release 0.1.1"
```

Review and merge the version change, then tag the merged commit:

```sh
git switch main
git pull --ff-only
git tag -a v0.1.1 -m "Release 0.1.1"
git push origin v0.1.1
```

The release workflow checks the tag against both package files, runs the full
CI suite (including a redacted Gitleaks scan of all fetched Git history), and
builds and pushes the Linux AMD64 image with SBOM and provenance
attestations. It publishes `0.1.1` and `sha-<full-commit>` tags. There is no
moving `latest` tag; deployments should select a version or image digest.
Prerelease tags are not supported yet. Never move or reuse a published tag;
ship a new patch version for corrections. A failed run can be rerun after its
configuration is fixed. Optionally create a GitHub release with the changelog
after the image publishes successfully.

## Native helper

The helper is versioned separately from the web app: currently helper `0.2.2`
and application `0.1.0`. For a helper release,
update the version in `scripts/build-helper.mjs`, `helper/main.go`, and both
`public/relay/install.*` scripts together. Update the artifact directory in
`tests/helper-artifacts.test.ts` to the new version. Run `npm run helper:test` and
`npm run helper:build`, then commit the new `public/relay/vVERSION/` artifacts
and checksums. Retain older version directories for existing installation links.
Review binary and installer changes before releasing the web app that ships them.
