import * as vscode from 'vscode';
import { SessionManager } from '../session/sessionManager';
import { WorkspaceMonitor } from '../monitoring/workspaceMonitor';

async function requiredInput(prompt: string): Promise<string | undefined> {
  return vscode.window.showInputBox({ prompt, ignoreFocusOut: true, validateInput: (value) => value.trim() ? undefined : 'Este campo é obrigatório.' }).then((value) => value?.trim());
}

export function registerCommands(context: vscode.ExtensionContext, sessions: SessionManager, monitor: WorkspaceMonitor): vscode.Disposable[] {
  const start = vscode.commands.registerCommand('senaiExamLogger.startExam', async () => {
    if (sessions.current) { await vscode.window.showInformationMessage('SENAI Exam Logger: já existe uma sessão de prova ativa.'); return; }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { await vscode.window.showInformationMessage('SENAI Exam Logger: abra primeiro a pasta da avaliação para iniciar a prova.'); return; }
    const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Selecione a pasta oficial da prova' });
    if (!folder) return;
    const studentName = await requiredInput('Nome do aluno'); if (!studentName) return;
    const className = await requiredInput('Turma'); if (!className) return;
    const examName = await requiredInput('Nome ou identificação da avaliação'); if (!examName) return;
    const session = await sessions.start(folder, studentName, className, examName);
    await monitor.sessionStarted(vscode.window.activeTextEditor);
    await vscode.window.showInformationMessage(`SENAI Exam Logger: sessão de prova iniciada. ID: ${session.sessionId}`);
  });
  const finish = vscode.commands.registerCommand('senaiExamLogger.finishExam', async () => {
    if (!sessions.current) { await vscode.window.showInformationMessage('SENAI Exam Logger: nenhuma prova ativa para finalizar.'); return; }
    try { await monitor.prepareFinish(); const session = await sessions.finish(vscode.workspace.textDocuments); if (!session?.finishedAt) throw new Error('A sessão não retornou metadados finais.'); monitor.sessionFinished(); const minutes = Math.max(1, Math.round((session.durationMs ?? 0) / 60_000)); await vscode.window.showInformationMessage(`SENAI Exam Logger: prova de ${session.studentName} finalizada (${minutes} min). Relatório gerado. ID: ${session.sessionId}`); }
    catch (error) { console.error('SENAI Exam Logger: falha ao finalizar a sessão.', error); await vscode.window.showErrorMessage(`SENAI Exam Logger: não foi possível finalizar a prova. A sessão permanece ativa para nova tentativa. ${error instanceof Error ? error.message : String(error)}`); }
  });
  const status = vscode.commands.registerCommand('senaiExamLogger.status', async () => {
    const session = sessions.current;
    if (!session) { await vscode.window.showInformationMessage('SENAI Exam Logger está funcionando. Nenhuma prova ativa.'); return; }
    await vscode.window.showInformationMessage(`Aluno: ${session.studentName} | Turma: ${session.className} | Avaliação: ${session.examName} | Início: ${new Date(session.startedAt).toLocaleString()} | Workspace: ${session.workspacePath} | ID: ${session.sessionId}`);
  });
  // Comando de desenvolvimento; poderá ser removido ou restringido nas máquinas dos alunos.
  const logs = vscode.commands.registerCommand('senaiExamLogger.openLogs', async () => {
    const target = sessions.current ? vscode.Uri.joinPath(context.globalStorageUri, 'sessions', sessions.current.sessionId) : await sessions.sessionStorage.latestSessionDirectory() ?? context.globalStorageUri;
    await vscode.workspace.fs.createDirectory(target);
    await vscode.commands.executeCommand('revealFileInOS', target);
  });
  const report = vscode.commands.registerCommand('senaiExamLogger.showLastReport', async () => {
    try { const uri = await sessions.sessionStorage.latestFinishedReport(); if (!uri) throw new Error('Nenhuma sessão finalizada foi encontrada.'); await vscode.env.openExternal(uri); } catch(error) { await vscode.window.showErrorMessage(`SENAI Exam Logger: não foi possível abrir o relatório. ${error instanceof Error ? error.message : String(error)}`); }
  });
  const regenerate = vscode.commands.registerCommand('senaiExamLogger.regenerateLastReport', async () => { try { const uri=await sessions.sessionStorage.regenerateLatest(); await vscode.window.showInformationMessage('SENAI Exam Logger: arquivos derivados regenerados.'); await vscode.env.openExternal(uri); } catch(error) { console.error('SENAI Exam Logger: falha na regeneração.',error); await vscode.window.showErrorMessage(`SENAI Exam Logger: não foi possível regenerar o relatório. ${error instanceof Error ? error.message : String(error)}`); } });
  return [start, finish, status, logs, report, regenerate];
}
