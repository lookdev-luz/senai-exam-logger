import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createEvent, isBulkInsert, isPathInside, safeSnapshotPath, serializeEvent, sha256, storedText } from '../src/utils/audit';

test('detecta caminhos dentro e fora do workspace sem confundir prefixos', () => {
  const root = path.resolve('/tmp', 'exam');
  assert.equal(isPathInside(root, path.join(root, 'src', 'main.ts')), true);
  assert.equal(isPathInside(root, path.resolve('/tmp', 'exam-copy', 'main.ts')), false);
  assert.equal(isPathInside(root, path.resolve('/tmp', 'outside.ts')), false);
});

test('detecta inserção em massa por caracteres ou linhas', () => {
  assert.equal(isBulkInsert('x'.repeat(100), 100, 5), true);
  assert.equal(isBulkInsert('1\n2\n3\n4\n5', 100, 5), true);
  assert.equal(isBulkInsert('curto', 100, 5), false);
});

test('sanitiza caminho de snapshot e remove traversal', () => {
  const result = safeSnapshotPath('../../src/arquivo com espaço.ts');
  assert.equal(result, 'src/arquivo_com_espaço.ts');
  assert.equal(result.includes('..'), false);
});

test('calcula SHA-256 conhecido', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('serializa evento em uma única linha JSONL e limita conteúdo grande', () => {
  const event = createEvent('session', 'SESSION_STARTED');
  const line = serializeEvent(event);
  assert.equal(line.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(line), event);
  const content = storedText('x'.repeat(5_000));
  assert.equal(content.insertedTextTruncated, true);
  assert.equal(typeof content.insertedTextHash, 'string');
  assert.equal((content.insertedText as string).length, 500);
});
