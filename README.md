# Crimsonland 1.9.93 - WebGL port

This is a WebGL port of the faithful 1.9.93 Crimsonland rewrite: https://github.com/banteg/crimson. Go there, give it a star – the work done there is phenomenal!

The foundation of this port was done by using Claude Code for translating each Python file one-by-one into TypeScript. Currently, the game works, but there a couple of bugs, and the persistence is not yet implemented. Manual revision and fixes of sources is in progress.

Based on the commit: https://github.com/banteg/crimson/commit/4a76c3c616e6fa20fdc91dd359f9ab47ef80d591

## Running

You will need to install [Node.js](https://nodejs.org/en/) and [pnpm](https://pnpm.io/) first.

```shell
pnpm install
pnpm run dev
```

Or, you can try it here: https://refactoring.ninja/crimson/

## Legal

Just like the original rewrite, this project is an independent reimplementation effort for preservation, research, and compatibility. No original assets or binaries are included. Use your own legally obtained copy.
