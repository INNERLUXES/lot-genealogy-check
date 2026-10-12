import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_LIMITS, CsvError, cellAt, detectDelimiter, readTable } from '../src/index.js';

const cells = (t, o) => readTable(t, o).rows.map((r) => r.cells);

test('readTable: a header and rows, with the line and the column of every cell', () => {
  const t = readTable('a,bb,c\n1,22,333\nx,,z\n');
  assert.deepEqual(t.header.cells, ['a', 'bb', 'c']);
  assert.deepEqual(t.rows.map((r) => r.cells), [['1', '22', '333'], ['x', '', 'z']]);
  assert.deepEqual(t.rows.map((r) => r.line), [2, 3]);
  assert.deepEqual(t.rows[0].columns, [1, 3, 6]);
  assert.deepEqual(cellAt(t.rows[1], 2), { line: 3, column: 4 });
  assert.equal(t.delimiter, ',');
  assert.deepEqual(t.notes, []);
});

test('readTable: LF, CRLF and CR line ends give the same table, and a missing final line end changes nothing', () => {
  const lf = readTable('a,b\n1,2\n3,4\n');
  for (const end of ['\r\n', '\r']) {
    const t = readTable(`a,b${end}1,2${end}3,4${end}`);
    assert.deepEqual(t.rows.map((r) => r.cells), lf.rows.map((r) => r.cells), JSON.stringify(end));
    assert.deepEqual(t.rows.map((r) => r.line), [2, 3]);
  }
  assert.deepEqual(cells('a,b\n1,2\n3,4'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(cells('a,b\r\n1,2\r\n3,4'), [['1', '2'], ['3', '4']]);
});

test('readTable: quotes keep commas, tabs, quotes and line ends inside a cell, and the later cells keep their own line', () => {
  const t = readTable('a,b,c\n"x, y","say ""hi""","line one\nline two"\n"q",r,s\n');
  assert.deepEqual(t.rows[0].cells, ['x, y', 'say "hi"', 'line one\nline two']);
  assert.equal(t.rows[0].line, 2);
  assert.equal(t.rows[0].lines, null, 'every cell starts on the line of the row');
  assert.equal(t.rows[1].line, 4, 'the next row starts after the cell that holds a line end');
  const later = readTable('a,b,c\n1,"two\nlines",3\n');
  assert.deepEqual(later.rows[0].cells, ['1', 'two\nlines', '3']);
  assert.deepEqual(later.rows[0].lines, [2, 2, 3]);
  assert.deepEqual(cellAt(later.rows[0], 2), { line: 3, column: 8 });
  assert.deepEqual(readTable('a\n"x\r\ny"\n').rows[0].cells, ['x\r\ny']);
});

test('readTable: a blank line is skipped, a row of one empty quoted cell is kept as a row only when it holds a line', () => {
  assert.deepEqual(cells('a,b\n\n1,2\n\n\n3,4\n'), [['1', '2'], ['3', '4']]);
  assert.deepEqual(cells('a,b\n   \n1,2\n'), [['1', '2']]);
  assert.equal(readTable('a,b\n\n1,2\n').rows[0].line, 3, 'the line counts the blank line');
});

test('readTable: a delimiter at the very end of the file ends the row with an empty cell, and so does one before a line end', () => {
  assert.deepEqual(cells('a,b\n1,'), [['1', '']]);
  assert.deepEqual(cells('a,b\n1,\n2,3\n'), [['1', ''], ['2', '3']]);
  assert.deepEqual(cells('a,b\n,\n'), [['', '']]);
});

test('detectDelimiter: tabs when the first line has more tabs than commas, commas otherwise, and quotes hide both', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1,2,3\n'), '\t');
  assert.equal(detectDelimiter('a,b,c\n'), ',');
  assert.equal(detectDelimiter('a\tb,c,d\n'), ',', 'more commas than tabs');
  assert.equal(detectDelimiter('a\tb,c\n'), '\t', 'a tab and one comma: the tab wins a tie');
  assert.equal(detectDelimiter('"a,b,c"\td\n'), '\t');
  assert.equal(detectDelimiter('single\n'), ',');
  assert.equal(detectDelimiter(''), ',');
  assert.throws(() => detectDelimiter('a;b;c\n1;2;3\n'), (e) => e instanceof CsvError && /semicolons/.test(e.message) && e.line === 1);
  assert.equal(detectDelimiter('a,b;c\n'), ',', 'one semicolon next to a comma is not a separator');
});

test('readTable: tab-separated files, with commas left alone inside the cells', () => {
  const t = readTable('a\tb\n1,5\t"two\tparts"\n');
  assert.equal(t.delimiter, '\t');
  assert.deepEqual(t.rows[0].cells, ['1,5', 'two\tparts']);
  assert.deepEqual(readTable('a,b\n1,2\n', { delimiter: ',' }).rows[0].cells, ['1', '2']);
});

test('readTable: a file that cannot be followed is refused with the line and the column, never guessed at', () => {
  const refused = (text, pattern, line, column) => assert.throws(() => readTable(text), (e) => e instanceof CsvError && pattern.test(e.message) && (line === undefined || e.line === line) && (column === undefined || e.column === column), text);
  refused('a,b\n1,"never closed\n', /never closed; the file ends inside it/, 2, 3);
  refused('a,b\n1,x"y\n', /quote inside a cell that does not start with one/, 2, 4);
  refused('a,b\n1,"x"y\n', /text after the closing quote/, 2, 6);
  refused('a,b\n"x" ,2\n', /text after the closing quote/, 2, 4);
  refused('', /holds no text to read as a table/, 1, 1);
  refused('\n\n   \n', /holds no text to read as a table/);
});

test('readTable: the limits stop the reader with the place: a cell too long, a row too wide, too many cells', () => {
  const small = { ...CSV_LIMITS, maxCellLength: 10, maxColumns: 4, maxCells: 12 };
  assert.throws(() => readTable(`a,b\n${'x'.repeat(11)},2\n`, { limits: small }), (e) => /longer than 10 characters/.test(e.message) && e.line === 2 && e.column === 1);
  assert.throws(() => readTable(`a,b\n"${'x'.repeat(11)}",2\n`, { limits: small }), /longer than 10 characters/);
  assert.throws(() => readTable(`a,b\n"${'x'.repeat(100)}",2\n`, { limits: small }), /longer than 10 characters/);
  assert.deepEqual(cells(`a,b\n${'x'.repeat(10)},2\n`, { limits: small }), [['xxxxxxxxxx', '2']], 'a cell at the limit is read');
  assert.throws(() => readTable('a,b,c,d,e\n1,2,3,4,5\n', { limits: small }), (e) => /more than 4 cells/.test(e.message) && e.line === 1);
  assert.deepEqual(readTable('a,b,c,d\n1,2,3,4\n', { limits: small }).header.cells.length, 4);
  assert.throws(() => readTable('a,b\n1,2\n3,4\n5,6\n7,8\n9,0\n1,2\n', { limits: small }), /more than 12 cells/);
  assert.equal(readTable('a,b\n1,2\n3,4\n5,6\n', { limits: small }).rows.length, 3);
});

test('readTable: more rows than the limit are cut off with a note, and a table of exactly the limit is not', () => {
  const small = { ...CSV_LIMITS, maxRows: 3 };
  const exact = readTable('a\n1\n2\n3\n', { limits: small });
  assert.equal(exact.rows.length, 3);
  assert.deepEqual(exact.notes, []);
  const over = readTable('a\n1\n2\n3\n4\n5\n', { limits: small });
  assert.deepEqual(over.rows.map((r) => r.cells[0]), ['1', '2', '3']);
  assert.deepEqual(over.notes, ['the file holds more than 3 rows; the tool read the first 3 and left the rest out']);
});
