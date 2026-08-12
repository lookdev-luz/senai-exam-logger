import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const startExam = vscode.commands.registerCommand(
    'senaiExamLogger.startExam',
    () => vscode.window.showInformationMessage(
      'SENAI Exam Logger: sessão de prova iniciada.',
    ),
  );

  const finishExam = vscode.commands.registerCommand(
    'senaiExamLogger.finishExam',
    () => vscode.window.showInformationMessage(
      'SENAI Exam Logger: sessão de prova finalizada.',
    ),
  );

  const status = vscode.commands.registerCommand(
    'senaiExamLogger.status',
    () => vscode.window.showInformationMessage(
      'SENAI Exam Logger está funcionando.',
    ),
  );

  context.subscriptions.push(startExam, finishExam, status);
}

export function deactivate(): void {}
