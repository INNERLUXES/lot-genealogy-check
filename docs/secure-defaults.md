# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of
the document is about what the tool cannot do for you: which file you give it, where the output goes, and who may change the
file it reads. A clean result is a file with none of the problems the checks look for, not a finding that the records are
true: the tool checks the records in a file, not whether they are true, and it is not a certification of any kind.

## How the tool behaves by default

- **Never a secret.** The tool needs no private key, no seed, no API key and no address of a server, and has no option to take
  one. A column named for a key or a seed, and a cell shaped like one, anywhere in the file, is a `secret-in-file` error that
  fails the run; the value is left out of every check and never written to a report or an error message, in any format.
- **Reads, never writes.** The tool reads the one file it is given. It follows no symbolic link, fetches no URL, refuses an
  argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and writes
  nothing to disk.
- **Every check on from the first run.** An unknown kind of event, an incomplete row, a time that does not exist or lies
  after `--now`, a quantity that is not above zero or has no unit, an input lot that was never received or made, a party that
  gives more than it holds, a serial number made twice, a time that goes back along the custody chain, a loop in the genealogy
  and a column the rows need that is missing are errors; an output above its inputs, a custody gap, a repeated row, a
  repeated event identifier and a column the tool does not read are warnings; a unit the tool cannot compare, a receive with
  no ship and a ship with no receive are notes. There is no configuration file of the tool that could set a check off.
- **No clock.** Every time is the file's own, read from its characters; the one moment the tool is given is the one of
  `--now`. Without it, `future-date` does not run, and the report and a note say so.
- **Fail closed on what it cannot read.** A file that is not a table the reader can follow is an error finding that fails the
  run at the default `--fail-on` of `error`. A missing column, an unknown kind of event and a row of the wrong width are
  findings of their own, so a part of the file that was not read is never taken for one that is fine. A file that is not text,
  is too large or is a link stops the run with exit code `2` and no report.
- **Numbers as written.** A quantity is read from the characters of the file into a whole number and a scale, never through a
  floating point number; a quantity past the limit is a finding, never rounded, and sums are exact.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given
  twice stop the run, so a typo such as `--fail-no` cannot leave a default in place. A `--now` that is not a date is refused.
- **No pattern from the input.** No regular expression is built from the file or from an argument.
- **Bounded work.** The reader has limits of size, rows, columns, cells and cell length, the reader, the checks, the loop
  search and the trace work through loops, queues and maps, and at most 1,000 findings of one check are listed
  (docs/limits.md), so a large file or a very long chain of lots cannot exhaust the stack, the memory or the time.
- **No prototype tricks.** Names from the file are kept in maps and sets and compared with the names the tool reads, never set
  as properties of an object, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names, cells, lots and parties included, has control characters, line
  separators and direction controls replaced and its length capped before it reaches a report or an error message; the
  markdown report also escapes what markdown gives a meaning to.
- **The same input gives the same output.** No clock, no zone, no locale and no random number
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--now`.** Give the day or the moment the file is checked, such as the start time of the job, so that `future-date` runs.
  A pipeline can pass the time of the runner, written with `Z`.
- **`--fail-on warning`.** An output above its inputs, a custody gap, a repeated row, a repeated event identifier and an
  unknown column fail the run too. Use it on the export that is about to be written to a ledger, and record each warning the
  team keeps on purpose.
- **`--fail-on info`.** A receive with no ship, a ship with no receive and a unit the tool cannot compare fail the run too.
  Use it on a file that is meant to hold both sides of every move and one unit for each lot.
- **Whole exports.** Check the rows of a lot together, so that the checks across rows can see each step; an export cut in the
  middle of a lot shows less, or shows a gap that is not there.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Lot genealogy check
    run: npx --yes github:INNERLUXES/lot-genealogy-check exports/events.csv --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --format markdown >> "$GITHUB_STEP_SUMMARY"
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no API key and no access to a server;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx`
  runs what it downloads.
- Check the exact file that is written to the ledger, and have the job that writes it read the same file. A file edited after
  the check is not what was checked.
- Keep production records out of public repositories: they hold the names of your suppliers and customers and the lots they
  handle. Keep the reports with the same care, because a finding quotes lot codes and cells of the file.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and
  keep the SARIF or JSON report as an artifact of the job.
- Treat a report built from a file you do not trust as untrusted data.
- If the tool ever reports `secret-in-file`, treat the key or seed as exposed: remove it from the file and from every place
  the file was copied to, and move what it controls to a new key. The tool does not show the value, but the file itself was
  readable to everyone with access to it.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
