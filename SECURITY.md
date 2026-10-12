# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "lot-genealogy-check security", or use private vulnerability reporting on
this repository. Please do not open a public issue for a vulnerability.

Include a small made-up spreadsheet that shows the problem, the command you ran, what you expected and what happened. Use
made-up parties, lots and products, never the records of a real firm, supplier or customer, and never a real private key,
seed or mnemonic, even an old one or one from a test network.

## Scope

The tool checks the records in a file, not whether they are true, and it is not a certification of any kind. In scope:

- an input that makes the tool show a private key, a seed or a mnemonic, or any part of one, in a report or an error message,
  in any format, or the value of a cell of 64 hex digits in a column of identifiers
- a key or a seed in one of the shapes docs/limits.md names that the tool does not report, outside the columns of
  identifiers that docs/limits.md names
- an input that makes the tool read a file other than the one it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, write or sign anything, run any other program, or
  evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, a
  hundred thousand rows, one lot in a hundred thousand rows, a chain or a loop of a hundred thousand lots, a lot shipped to
  thirty thousand parties, a cell of a million characters, a row of a million commas, long runs of quotes or numbers with
  thousands of digits
- binary or invalid input that the tool reads as if it were a spreadsheet
- a column written twice whose second column is read without a finding, a column the tool did not read that a check reports
  as fine, a misspelt column that is not reported, or a row of the wrong width that is read as if it were right
- a spreadsheet that docs/method.md says is reported (an unknown kind of event, a cell a row needs left empty, a time that
  does not exist, a quantity with no unit, an input lot that was never received or made, a party that ships more than it
  holds, a serial number made twice, a lot that is its own input) that the tool does not report
- a quantity or a time that the tool reads in a way the text of the file does not say, so that a check passes or fails because
  of it
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is
  reported
- a trace that lists a lot twice, never ends on a loop, or lists lots the input_lots do not link
- text from the file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in
  the output, or puts markup into the markdown report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the records describe what happened (a clean result
is not a certification), whether a lot or a party is what the file says, secrets in shapes the search does not claim to know,
who may change or upload the file, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
