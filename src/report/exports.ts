import type { AuditEvent, ExamSession, FileStatistics } from '../types';
import { calculateFileStatistics, generateReportHtml } from './report';

export function parseJsonLines(content: string): AuditEvent[] {
  return content.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line) as AuditEvent; } catch (error) { throw new Error(`JSONL inválido na linha ${index + 1}: ${String(error)}`); }
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
const changes = (event: AuditEvent) => (event.metadata?.changes as Array<Record<string, unknown>> | undefined) ?? [];
const sum = (event: AuditEvent, key: string) => changes(event).reduce((total, item) => total + Number(item[key] ?? 0), 0);
const safeDetails = (event: AuditEvent): string => JSON.stringify(event.metadata ?? {}, (key, value) => key === 'insertedText' && typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value);

export function eventsCsv(events: AuditEvent[]): string {
  const headings = ['timestamp','time','eventType','relativeFile','sourceFile','destinationFile','languageId','insertedCharacters','removedCharacters','insertedLines','removedLines','durationMs','similarity','details'];
  const rows = events.map((event) => { const metadata = event.metadata ?? {}; return [event.timestamp, event.timestamp.slice(11, 23), event.eventType, event.relativeFile, metadata.sourceFile, metadata.destinationFile, event.languageId, metadata.characterCount ?? sum(event, 'insertedTextLength'), sum(event, 'removedTextLength'), metadata.lineCount ?? sum(event, 'insertedLineCount'), sum(event, 'removedLineCount'), metadata.durationMs, metadata.similarity, safeDetails(event)].map(csvCell).join(','); });
  return `\uFEFF${headings.map(csvCell).join(',')}\r\n${rows.join('\r\n')}\r\n`;
}

export function filesCsv(files: FileStatistics[]): string {
  const headings = ['file','firstOpenedAt','firstEditedAt','lastEditedAt','activeDurationMs','editCount','saveCount','charactersInserted','charactersRemoved','bulkInsertCount'];
  return `\uFEFF${headings.map(csvCell).join(',')}\r\n${files.map((f) => [f.relativeFile,f.firstOpenedAt,f.firstEditedAt,f.lastEditedAt,f.activeDurationMs,f.editCount,f.saveCount,f.charactersInserted,f.charactersRemoved,f.bulkInsertCount].map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function createSummary(session: ExamSession, events: AuditEvent[]) {
  const files = calculateFileStatistics(events, session.finishedAt ?? undefined); const count = (type: string) => events.filter((e) => e.eventType === type).length;
  return { session, statistics: { durationMs: session.durationMs ?? 0, filesCreated: count('FILE_CREATED'), filesDeleted: count('FILE_DELETED'), filesRenamed: count('FILE_RENAMED'), externalDocumentsOpened: count('EXTERNAL_DOCUMENT_OPENED'), editEvents: count('DOCUMENT_CHANGED'), saveEvents: count('DOCUMENT_SAVED'), charactersInserted: files.reduce((n,f)=>n+f.charactersInserted,0), charactersRemoved: files.reduce((n,f)=>n+f.charactersRemoved,0), bulkInsertCount: count('BULK_INSERT'), possibleInternalCopyCount: count('POSSIBLE_INTERNAL_COPY'), idleDurationMs: events.filter(e=>e.eventType==='IDLE_ENDED').reduce((n,e)=>n+Number(e.metadata?.durationMs??0),0) }, files, reviewEvents: events.filter(e=>['BULK_INSERT','EXTERNAL_DOCUMENT_OPENED','POSSIBLE_INTERNAL_COPY','FILE_DELETED','FILE_RENAMED'].includes(e.eventType)) };
}

export function derivedFiles(session: ExamSession, events: AuditEvent[]) {
  const sorted = [...events].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)); const summary = createSummary(session, sorted);
  return { pretty: `${JSON.stringify(sorted, null, 2)}\n`, eventsCsv: eventsCsv(sorted), filesCsv: filesCsv(summary.files), summary: `${JSON.stringify(summary, null, 2)}\n`, report: generateReportHtml(session, sorted) };
}
