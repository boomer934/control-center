# Stack trace fixtures (phase 5e)

Output of real failures, used by the stack trace parsers of `@control-center/event-schema`.
The workspace root is `C:\dev\shop` in every file.

- **Real** (captured with the runtime, then the root path replaced): `node-cjs.txt`,
  `node-esm.txt` (Node 26), `python.txt` (CPython 3.14), `rust-panic.txt`, `rust-compile.txt`
  (rustc 1.97, crate in `rs/`), `tsc.txt`, `tsc-pretty.txt` (TypeScript 5.9, ANSI colors kept),
  `vite8-dev.txt` (Vite 8.3 dev server serving a module that does not compile: Oxc diagnostics and
  Vite's own stacks, ANSI colors kept).
- **Written by hand** in the documented format, because the runtime was not available or the
  output comes from a browser or a container: `go-panic.txt`, `go-build.txt`,
  `browser-chrome.txt`, `browser-firefox.txt`, `docker-compose.txt`, `vite-dev.txt`.

To add a language: a parser module in `packages/event-schema/src/stack/`, a fixture here and its
expected result in `stack.test.ts`.
