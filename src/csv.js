// A strict reader of CSV and TSV, of its own: RFC 4180 quoting with a comma or a tab as the delimiter, read one character at
// a time with no recursion and no pattern built from the text. It keeps the line and the column of every cell, so a
// finding points at the cell. It refuses what it cannot follow instead of guessing: a quote inside an unquoted cell, text
// after a closing quote, a quote never closed, a cell that is too long, a header that is too wide, and a file with more
// cells than the limit. A line end is LF, CRLF or CR. A blank line is skipped. The header is the first line.

export const CSV_LIMITS = { maxRows: 250000, maxColumns: 200, maxCells: 3000000, maxCellLength: 20000 };

export class CsvError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = 'CsvError';
    this.line = line;
    this.column = column;
  }
}

const COMMA = 44;
const TAB = 9;
const QUOTE = 34;
const LF = 10;
const CR = 13;

// The delimiter of a file: a tab when the first line has tabs outside quotes and at least as many as commas, else a comma.
// A first line with more semicolons than commas and no tab is refused, because a semicolon is not read.
export function detectDelimiter(text) {
  let commas = 0;
  let tabs = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) quoted = !quoted;
    else if (!quoted && (c === LF || c === CR)) break;
    else if (!quoted) {
      if (c === COMMA) commas += 1;
      else if (c === TAB) tabs += 1;
      else if (c === 59) semicolons += 1;
    }
  }
  if (tabs > 0 && tabs >= commas) return '\t';
  if (semicolons > commas && tabs === 0) throw new CsvError('The first line is separated by semicolons, which the reader does not read; save the file with commas or tabs between the cells', 1, 1);
  return ',';
}

// Reads the text into { delimiter, header, rows, notes }. header and every row are { line, cells, columns, lines }:
// cells are the texts, columns the 1-based column of the start of each cell in its line, and lines the line each cell
// starts on when a quoted cell holds a line end (null when every cell starts on the line of the row).
export function readTable(text, { delimiter = null, limits = CSV_LIMITS } = {}) {
  const notes = [];
  const sep = delimiter ?? detectDelimiter(text);
  const sepCode = sep.charCodeAt(0);
  const n = text.length;
  const all = [];
  let line = 1;
  let lineStart = 0;
  let i = 0;
  let cellCount = 0;
  let truncated = false;
  while (i < n) {
    const row = { line, cells: [], columns: [], lines: null };
    let multi = false;
    let more = true;
    while (more) {
      const startLine = line;
      const column = i - lineStart + 1;
      let value;
      if (i < n && text.charCodeAt(i) === QUOTE) {
        i += 1;
        const parts = [];
        let from = i;
        let closed = false;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === QUOTE) {
            if (text.charCodeAt(i + 1) === QUOTE) {
              parts.push(text.slice(from, i + 1));
              i += 2;
              from = i;
              continue;
            }
            parts.push(text.slice(from, i));
            i += 1;
            closed = true;
            break;
          }
          if (c === LF || c === CR) {
            if (c === CR && text.charCodeAt(i + 1) === LF) i += 1;
            line += 1;
            lineStart = i + 1;
          }
          i += 1;
          if (i - from > limits.maxCellLength * 2 + 4) throw new CsvError(`A cell is longer than ${limits.maxCellLength} characters`, startLine, column);
        }
        if (!closed) throw new CsvError(`The quote that opens the cell was never closed; the file ends inside it`, startLine, column);
        value = parts.join('');
        if (value.length > limits.maxCellLength) throw new CsvError(`A cell is longer than ${limits.maxCellLength} characters`, startLine, column);
        const next = i < n ? text.charCodeAt(i) : -1;
        if (next !== sepCode && next !== LF && next !== CR && next !== -1) throw new CsvError('There is text after the closing quote of a cell; a quote inside a quoted cell is written as two quotes', line, i - lineStart + 1);
      } else {
        const from = i;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === sepCode || c === LF || c === CR) break;
          if (c === QUOTE) throw new CsvError('A quote inside a cell that does not start with one; put the whole cell in quotes', line, i - lineStart + 1);
          i += 1;
          if (i - from > limits.maxCellLength) throw new CsvError(`A cell is longer than ${limits.maxCellLength} characters`, line, column);
        }
        value = text.slice(from, i);
      }
      if (row.cells.length >= limits.maxColumns) throw new CsvError(`A row has more than ${limits.maxColumns} cells`, startLine, column);
      row.cells.push(value);
      row.columns.push(column);
      if (startLine !== row.line) {
        if (!multi) {
          row.lines = row.cells.slice(0, -1).map(() => row.line);
          multi = true;
        }
      }
      if (multi) row.lines.push(startLine);
      cellCount += 1;
      if (cellCount > limits.maxCells) throw new CsvError(`The file holds more than ${limits.maxCells} cells`, startLine, column);
      if (i < n && text.charCodeAt(i) === sepCode) {
        i += 1;
        if (i >= n) {
          // A delimiter at the very end of the file ends the row with one more, empty cell.
          row.cells.push('');
          row.columns.push(i - lineStart + 1);
          if (multi) row.lines.push(line);
          cellCount += 1;
          more = false;
        }
        continue;
      }
      more = false;
    }
    if (i < n) {
      const c = text.charCodeAt(i);
      if (c === CR && text.charCodeAt(i + 1) === LF) i += 1;
      i += 1;
      line += 1;
      lineStart = i;
    }
    // A blank line is skipped.
    if (row.cells.length === 1 && row.cells[0].trim() === '' && row.lines === null) continue;
    if (all.length > limits.maxRows) {
      truncated = true;
      break;
    }
    all.push(row);
  }
  if (all.length === 0) throw new CsvError('The file holds no text to read as a table', 1, 1);
  const header = all[0];
  const rows = all.slice(1);
  if (truncated) {
    rows.length = limits.maxRows;
    notes.push(`the file holds more than ${limits.maxRows} rows; the tool read the first ${limits.maxRows} and left the rest out`);
  }
  return { delimiter: sep, header, rows, notes };
}

// The line and column of the cell at an index of a row.
export const cellAt = (row, index) => ({ line: row.lines ? row.lines[index] : row.line, column: row.columns[index] ?? 1 });
