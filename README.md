# SENAI Exam Logger

Protótipo educacional privado de uma extensão do Visual Studio Code para registrar localmente a evolução de arquivos durante avaliações práticas, de forma independente de linguagem. Os registros são evidências de auditoria; o projeto não é um sistema de bloqueio nem atribui irregularidade automaticamente.

## Estado atual e arquitetura

- `commands/`: fluxo dos comandos e coleta dos dados obrigatórios.
- `session/`: ciclo de vida, sessão única ativa e recuperação após reload.
- `monitoring/`: listeners oficiais do workspace para documentos e arquivos.
- `storage/`: metadados, fila serial de JSONL e snapshots.
- `utils/`: hashing, limites de conteúdo e caminhos seguros.
- `types.ts`: contratos tipados de sessão e eventos.

Não há captura global de teclado/clipboard, tela, navegador ou outros aplicativos; não há autenticação, servidor ou API remota.

## Iniciar e finalizar uma prova

É obrigatório abrir primeiro a pasta da avaliação no VS Code. Execute **SENAI Exam Logger: Iniciar Prova**, escolha a pasta oficial quando houver múltiplas pastas e informe aluno, turma e avaliação. Todos os campos são obrigatórios e apenas uma sessão pode estar ativa.

Use **Status** para consultar a sessão e **Finalizar Prova** para criar snapshots finais, concluir as escritas e marcar a sessão como `FINISHED`. Uma sessão `ACTIVE` é recuperada depois de reload/crash quando o mesmo workspace oficial está aberto.

## Armazenamento e formato

Nada é gravado no projeto do aluno. Os dados ficam no `ExtensionContext.globalStorageUri`, localização gerenciada pelo VS Code para cada sistema operacional:

```text
globalStorageUri/
└── sessions/<sessionId>/
    ├── session.json
    ├── events.jsonl
    └── snapshots/<caminho-seguro>/<timestamp>-<hash>.txt
```

`session.json` contém ID, aluno, turma, avaliação, início/fim, URI e caminho do workspace, versão e estado. `events.jsonl` contém um objeto JSON por linha, com ID, sessão, timestamp, tipo e dados aplicáveis. A escrita de eventos é serializada para evitar concorrência entre appends.

Eventos: `SESSION_STARTED`, `SESSION_RECOVERED`, `SESSION_FINISHED`, `DOCUMENT_OPENED`, `EXTERNAL_DOCUMENT_OPENED`, `DOCUMENT_CHANGED`, `DOCUMENT_SAVED`, `FILE_CREATED`, `FILE_DELETED`, `FILE_RENAMED`, `BULK_INSERT` e `SNAPSHOT_CREATED`.

Alterações armazenam todas as `contentChanges`. Textos de até 4096 caracteres são registrados integralmente; acima disso, ficam tamanho total, SHA-256 e preview de 500 caracteres. Por padrão, `BULK_INSERT` indica apenas uma alteração com pelo menos 100 caracteres **ou** 5 linhas. Os limiares são configuráveis em `senaiExamLogger.bulkInsertCharacterThreshold` e `senaiExamLogger.bulkInsertLineThreshold`. O evento não comprova origem ou irregularidade.

**Os logs locais não constituem uma barreira de segurança contra um usuário com acesso administrativo à máquina.**

O comando **Abrir Pasta de Logs** existe somente para desenvolvimento/testes e poderá ser removido ou restringido na versão destinada aos computadores dos alunos.

## Desenvolvimento e teste no Windows

Requisitos: Node.js 22, npm e VS Code 1.85 ou posterior.

```bash
npm install
npm run typecheck
npm test
npm run build
```

Para testar: clone e abra a pasta no VS Code Windows, execute `npm install`, abra uma pasta de avaliação pelo menu **File > Open Folder**, pressione `F5` e, no **Extension Development Host**, use `Ctrl+Shift+P` para executar os comandos. O build ocorre antes da abertura do host. `npm run watch` recompila continuamente.

## Limitações do protótipo

- Logs e snapshots são locais, sem assinatura, envio remoto ou proteção contra administrador.
- A recuperação exige que o workspace oficial esteja aberto e escolhe a sessão `ACTIVE` mais recente se houver armazenamento inconsistente com múltiplas sessões ativas.
- Eventos de arquivo representam operações observadas pelas APIs do VS Code; mudanças que não chegam ao workspace do editor podem não ser registradas.
- `BULK_INSERT` é uma heurística quantitativa, não uma conclusão sobre a ação do usuário.
