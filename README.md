# SENAI Exam Logger

Protótipo educacional privado de uma extensão do Visual Studio Code para registrar localmente a evolução de arquivos durante avaliações práticas, de forma independente de linguagem. Os registros são evidências de auditoria; o projeto não é um sistema de bloqueio nem atribui irregularidade automaticamente.

## Estado atual e arquitetura

- `commands/`: fluxo dos comandos e coleta dos dados obrigatórios.
- `session/`: ciclo de vida, sessão única ativa e recuperação após reload.
- `monitoring/`: listeners oficiais do workspace para documentos e arquivos.
- `storage/`: metadados, fila serial de JSONL e snapshots.
- `report/`: métricas, agrupamento visual e relatório HTML offline.
- `utils/`: hashing, correlação determinística, limites de conteúdo e caminhos seguros.
- `types.ts`: contratos tipados de sessão e eventos.

Não há captura global de teclado/clipboard, tela, navegador ou outros aplicativos; não há autenticação, servidor ou API remota.

## Iniciar e finalizar uma prova

É obrigatório abrir primeiro a pasta da avaliação no VS Code. Execute **SENAI Exam Logger: Iniciar Prova**, escolha a pasta oficial quando houver múltiplas pastas e informe aluno, turma e avaliação. Todos os campos são obrigatórios e apenas uma sessão pode estar ativa.

Use **Status** para consultar a sessão e **Finalizar Prova** para criar snapshots finais, concluir as escritas, gerar `report.html` e marcar a sessão como `FINISHED`. Uma sessão `ACTIVE` é recuperada depois de reload/crash quando o mesmo workspace oficial está aberto. **Mostrar Relatório da Última Prova** abre o último relatório no navegador padrão.

## Armazenamento e formato

Nada é gravado no projeto do aluno. Os dados ficam no `ExtensionContext.globalStorageUri`, localização gerenciada pelo VS Code para cada sistema operacional:

```text
globalStorageUri/
└── sessions/<sessionId>/
    ├── session.json
    ├── events.jsonl
    ├── report.html
    └── snapshots/<caminho-seguro>/<timestamp>-<hash>.txt
```

`session.json` contém ID, aluno, turma, avaliação, início/fim, URI e caminho do workspace, versão e estado. `events.jsonl` contém um objeto JSON por linha, com ID, sessão, timestamp, tipo e dados aplicáveis. A escrita de eventos é serializada para evitar concorrência entre appends.

Eventos: `SESSION_STARTED`, `SESSION_RECOVERED`, `SESSION_FINISHED`, `DOCUMENT_OPENED`, `DOCUMENT_CLOSED`, `DOCUMENT_ACTIVATED`, `DOCUMENT_DEACTIVATED`, `EXTERNAL_DOCUMENT_OPENED`, `DOCUMENT_CHANGED`, `DOCUMENT_SAVED`, `FILE_CREATED`, `FILE_DELETED`, `FILE_RENAMED`, `BULK_INSERT`, `POSSIBLE_INTERNAL_COPY`, `IDLE_STARTED`, `IDLE_ENDED`, `SNAPSHOT_CREATED` e `REPORT_GENERATED`.

Alterações armazenam todas as `contentChanges`. Textos de até 4096 caracteres são registrados integralmente; acima disso, ficam tamanho total, SHA-256, `truncated=true` e preview de 500 caracteres. Por padrão, `BULK_INSERT` indica apenas uma alteração com pelo menos 100 caracteres **ou** 5 linhas. O evento inclui intervalos desde a última edição/atividade e eventual inatividade recém-encerrada. O evento não comprova origem ou irregularidade.

Em `BULK_INSERT`, somente documentos internos já abertos são comparados. Correspondência exata usa substring; a parcial usa proporção de caracteres em linhas normalizadas idênticas, sem algoritmo quadrático. Acima da similaridade configurada (0,85), `POSSIBLE_INTERNAL_COPY` registra uma **possível** origem interna, nunca uma origem comprovada. Conteúdos abaixo de 40 caracteres não são correlacionados.

Inatividade significa exclusivamente ausência de alteração, save, troca de editor ativo ou operação de arquivo observável pela extensão. Após 60 segundos, registra-se um único `IDLE_STARTED`; a próxima atividade gera `IDLE_ENDED` com início, fim, duração e arquivo ativo. Isso não mede presença física nem atividade em outros programas.

Snapshots são feitos em saves, finalização e, por padrão, após bulk insert. Um cache de SHA-256 evita snapshots consecutivos idênticos. `session.json` recebe o SHA-256 final de `events.jsonl`; como tudo é local, esse hash auxilia verificação e não impede adulteração por usuário privilegiado.

## Configurações

- `bulkInsertCharacterThreshold`: 100.
- `bulkInsertLineThreshold`: 5.
- `internalCopySimilarityThreshold`: 0,85.
- `idleThresholdSeconds`: 60.
- `maxStoredInsertedTextLength`: 4096.
- `snapshotOnBulkInsert`: `true`.

**Os logs locais não constituem uma barreira de segurança contra um usuário com acesso administrativo à máquina.**

O comando **Abrir Pasta de Logs** existe somente para desenvolvimento/testes e poderá ser removido ou restringido na versão destinada aos computadores dos alunos.

## Desenvolvimento e teste no Windows

Requisitos: Node.js 22, npm e VS Code 1.85 ou posterior.

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Para testar: clone e abra a pasta no VS Code Windows, execute `npm install`, abra uma pasta de avaliação pelo menu **File > Open Folder**, pressione `F5` e, no **Extension Development Host**, use `Ctrl+Shift+P` para executar os comandos. O build ocorre antes da abertura do host. `npm run watch` recompila continuamente.

## Distribuição privada e laboratório

Execute `npm run package` para gerar `senai-exam-logger-<versão>.vsix`; não há publicação no Marketplace. Instale em outra máquina com:

```bash
code --install-extension caminho-do-arquivo.vsix
```

No computador do aluno são necessários apenas VS Code e o VSIX instalado — não são necessários Node.js, npm, TypeScript nem o código-fonte. Fluxo: instalar o VSIX; abrir a pasta da avaliação; usar `Ctrl+Shift+P` e **Iniciar Prova**; preencher identificação; realizar a avaliação; executar **Finalizar Prova**; então o relatório é gerado.

Localizações aproximadas do `globalStorageUri` seguem o padrão de armazenamento do VS Code: `%APPDATA%\Code\User\globalStorage\senai-private.senai-exam-logger` no Windows, `~/.config/Code/User/globalStorage/senai-private.senai-exam-logger` no Linux e `~/Library/Application Support/Code/User/globalStorage/senai-private.senai-exam-logger` no macOS. Variantes do VS Code podem usar outra raiz; **Abrir Pasta de Logs** é a referência confiável.

## Limitações do protótipo

- Logs e snapshots são locais, sem assinatura, envio remoto ou proteção contra administrador.
- A recuperação exige que o workspace oficial esteja aberto e escolhe a sessão `ACTIVE` mais recente se houver armazenamento inconsistente com múltiplas sessões ativas.
- Eventos de arquivo representam operações observadas pelas APIs do VS Code; mudanças que não chegam ao workspace do editor podem não ser registradas.
- `BULK_INSERT` é uma heurística quantitativa, não uma conclusão sobre a ação do usuário.
- A API estável informa editor/documento ativo, mas não prova atenção do usuário, origem do clipboard, Ctrl+V ou atividade fora do VS Code.
- Correlação interna considera documentos de texto internos carregados na instância; não varre agressivamente todo o workspace a cada tecla.
- O agrupamento de edições existe apenas no HTML; `events.jsonl` preserva cada evento individual.
