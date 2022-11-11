## Sock Secret

### Testing

1. [Create environment][new-env] named `TEST`.
2. [Create classic token][new-token] with `repo` scope.

Then, clone this repo and write this to `.env`:

```
GITHUB_ENV=TEST
GITHUB_REPO=sock-secret
GITHUB_USER=tvquizphd
GITHUB_TOKEN=ghp_************************************
```

Then, run:

```
pnpm install
pnpm test
```

[new-env]: ./settings/environments/713732704/edit
[new-token]: https://github.com/settings/tokens/new
