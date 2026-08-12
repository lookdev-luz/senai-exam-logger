import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { correlateInternalCopy, createEvent, isBulkInsert, isPathInside, safeSnapshotPath, serializeEvent, sha256, storedText } from '../src/utils/audit';
import { calculateFileStatistics, duration, generateReportHtml, groupTimeline } from '../src/report/report';
import type { AuditEvent, ExamSession } from '../src/types';
import { csvCell, derivedFiles, eventsCsv, parseJsonLines } from '../src/report/exports';

test('detecta caminhos dentro e fora do workspace sem confundir prefixos', () => {
  const root = path.resolve('/tmp', 'exam');
  assert.equal(isPathInside(root, path.join(root, 'src', 'main.ts')), true);
  assert.equal(isPathInside(root, path.resolve('/tmp', 'exam-copy', 'main.ts')), false);
  assert.equal(isPathInside(root, path.resolve('/tmp', 'outside.ts')), false);
});

test('faz parsing cronológico de JSONL e informa linha inválida', () => {
  const later = createEvent('s', 'SESSION_FINISHED', { timestamp: '2026-01-02T00:00:00Z' });
  const earlier = createEvent('s', 'SESSION_STARTED', { timestamp: '2026-01-01T00:00:00Z' });
  assert.deepEqual(parseJsonLines(`${JSON.stringify(later)}\n${JSON.stringify(earlier)}\n`).map(e=>e.eventType), ['SESSION_STARTED','SESSION_FINISHED']);
  assert.throws(() => parseJsonLines('{}\ninválido'), /linha 2/);
});

test('escapa CSV, conteúdo multiline e gera derivados completos', () => {
  assert.equal(csvCell('a,"b"\nlinha'), '"a,""b""\nlinha"');
  const event = createEvent('s', 'DOCUMENT_CHANGED', { timestamp: '2026-01-01T00:00:01Z', relativeFile: 'main.c', metadata: { changes: [{ insertedText: 'a,"b"\nlinha', insertedTextLength: 12, removedTextLength: 0 }] } });
  const csv = eventsCsv([event]); assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /""changes""/); assert.match(csv, /\\nlinha/);
  const session: ExamSession = { sessionId:'s',studentName:'Aluno',className:'T',examName:'P',startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:01:00Z',workspaceUri:'file:\/\/\/exam',workspacePath:'/exam',extensionVersion:'1',status:'FINISHED',durationMs:60000 };
  const files = derivedFiles(session,[event]); assert.match(files.pretty,/\n  /); assert.match(files.summary,/charactersInserted/); assert.match(files.filesCsv,/main.c/); assert.match(files.report,/FINALIZADA/);
});

test('nome conceitual de snapshot preserva motivo, hash e extensão segura', () => {
  const safe = safeSnapshotPath('src/main.c'); const name = `2026-08-12T04-56-52-545Z_FINAL_${sha256('x').slice(0,12)}${path.extname(safe)}`;
  assert.match(name, /_FINAL_[a-f0-9]{12}\.c$/);
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
  assert.equal(content.truncated, true);
  assert.equal(typeof content.insertedTextHash, 'string');
  assert.equal((content.insertedText as string).length, 500);
});

test('correlaciona conteúdo interno exato e parcial de forma determinística', () => {
  assert.equal(correlateInternalCopy('função suficientemente grande para comparar com segurança', 'prefixo função suficientemente grande para comparar com segurança sufixo')?.similarity, 1);
  const partial = correlateInternalCopy('linha compartilhada longa o bastante\nlinha diferente também longa', 'linha compartilhada longa o bastante\noutra linha');
  assert.ok(partial && partial.similarity > 0 && partial.similarity < 1);
});

test('calcula estatísticas, duração ativa e agrupamento visual', () => {
  const base = { eventId: 'e', sessionId: 's' };
  const events: AuditEvent[] = [
    { ...base, timestamp: '2026-01-01T00:00:00.000Z', eventType: 'DOCUMENT_OPENED', relativeFile: 'main.c' },
    { ...base, timestamp: '2026-01-01T00:00:01.000Z', eventType: 'DOCUMENT_ACTIVATED', relativeFile: 'main.c' },
    { ...base, timestamp: '2026-01-01T00:00:02.000Z', eventType: 'DOCUMENT_CHANGED', relativeFile: 'main.c', metadata: { changes: [{ insertedTextLength: 3, removedTextLength: 1 }] } },
    { ...base, timestamp: '2026-01-01T00:00:03.000Z', eventType: 'DOCUMENT_CHANGED', relativeFile: 'main.c', metadata: { changes: [{ insertedTextLength: 2, removedTextLength: 0 }] } },
    { ...base, timestamp: '2026-01-01T00:00:05.000Z', eventType: 'DOCUMENT_DEACTIVATED', relativeFile: 'main.c' },
  ];
  const stats = calculateFileStatistics(events);
  assert.deepEqual({ active: stats[0].activeDurationMs, edits: stats[0].editCount, inserted: stats[0].charactersInserted }, { active: 4000, edits: 2, inserted: 5 });
  assert.equal(groupTimeline(events).at(-2)?.events.length, 2);
  assert.equal(duration(215_000), '3m 35s');
});

test('gera relatório HTML offline com sessão, resumo e timeline escapada', () => {
  const session: ExamSession = { sessionId: 'session-1', studentName: '<Aluno>', className: 'T1', examName: 'Prova', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T01:00:00Z', workspaceUri: 'file:///exam', workspacePath: '/exam', extensionVersion: '1', status: 'FINISHED', eventsSha256: 'abc' };
  const html = generateReportHtml(session, [createEvent(session.sessionId, 'SESSION_FINISHED')]);
  assert.match(html, /Relatório de Avaliação Prática/);
  assert.match(html, /session-1/);
  assert.match(html, /&lt;Aluno&gt;/);
  assert.doesNotMatch(html, /cdn|https?:\/\//i);
});
