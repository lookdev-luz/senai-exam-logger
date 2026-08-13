# SENAI Exam Logger

Extensão open source para Visual Studio Code desenvolvida para auxiliar na aplicação, acompanhamento e análise de avaliações práticas de programação.

O SENAI Exam Logger registra localmente a evolução dos arquivos durante uma sessão de avaliação, de forma independente da linguagem de programação utilizada, e gera evidências técnicas e relatórios para posterior análise pelo professor.

> Os registros produzidos são evidências auxiliares de auditoria. O SENAI Exam Logger não é um sistema de bloqueio, não determina automaticamente a ocorrência de irregularidades e não substitui a análise do professor.

## Principais recursos

* Registro de início e término da sessão de avaliação.
* Identificação de aluno, turma e avaliação.
* Monitoramento de documentos e arquivos manipulados no Visual Studio Code.
* Registro da evolução dos arquivos durante a avaliação.
* Registro de alterações de conteúdo.
* Detecção heurística de inserções de grande quantidade de conteúdo (`BULK_INSERT`).
* Identificação de possível similaridade com conteúdo de outros arquivos internos abertos (`POSSIBLE_INTERNAL_COPY`).
* Registro de períodos de inatividade observável dentro do Visual Studio Code.
* Criação automática de snapshots.
* Recuperação de sessões após reload ou encerramento inesperado do VS Code.
* Geração de relatório HTML offline.
* Exportação de eventos e métricas em JSON e CSV.
* Funcionamento totalmente local, sem necessidade de servidor externo.

## Privacidade e escopo de monitoramento

O SENAI Exam Logger utiliza APIs disponibilizadas oficialmente pelo Visual Studio Code.

A extensão **não realiza captura global** de:

* teclado;
* área de transferência;
* tela;
* câmera;
* microfone;
* navegador;
* outros aplicativos;
* tráfego de rede.

Também não existe autenticação, servidor próprio ou API remota utilizada para envio dos registros da avaliação.

Os dados são armazenados localmente no computador utilizando o `ExtensionContext.globalStorageUri`, localização gerenciada pelo próprio Visual Studio Code.

A extensão observa exclusivamente eventos disponibilizados pelas APIs do editor e do workspace.

## Arquitetura

O projeto é organizado nos seguintes módulos:

* `commands/`: fluxo dos comandos e coleta dos dados obrigatórios.
* `session/`: ciclo de vida, sessão única ativa e recuperação após reload.
* `monitoring/`: listeners oficiais do workspace para documentos e arquivos.
* `storage/`: metadados, fila serial de JSONL e snapshots.
* `report/`: métricas, agrupamento visual e geração do relatório HTML offline.
* `utils/`: hashing, correlação determinística, limites de conteúdo e caminhos seguros.
* `types.ts`: contratos tipados de sessão e eventos.

## Iniciando uma avaliação

Antes de iniciar uma sessão, é necessário abrir no Visual Studio Code a pasta que será utilizada para a avaliação.

Abra a Command Palette:

`Ctrl+Shift+P`

Execute:

**SENAI Exam Logger: Iniciar Prova**

Quando solicitado:

1. selecione a pasta oficial da avaliação, caso existam múltiplas pastas abertas;
2. informe o aluno;
3. informe a turma;
4. informe a avaliação.

Todos os campos são obrigatórios.

Apenas uma sessão de avaliação pode permanecer ativa simultaneamente.

## Durante a avaliação

O comando:

**SENAI Exam Logger: Status**

permite consultar informações sobre a sessão atualmente ativa.

Durante a sessão, a extensão registra eventos observáveis relacionados aos documentos e arquivos manipulados dentro do Visual Studio Code.

Uma sessão com estado `ACTIVE` pode ser recuperada após reload ou encerramento inesperado do editor quando o mesmo workspace oficial estiver aberto novamente.

## Finalizando uma avaliação

Execute:

**SENAI Exam Logger: Finalizar Prova**

Durante a finalização, a extensão:

1. cria os snapshots finais;
2. conclui as escritas pendentes;
3. consolida as métricas;
4. gera os arquivos derivados;
5. gera o relatório `report.html`;
6. altera o estado da sessão para `FINISHED`.

O comando:

**SENAI Exam Logger: Mostrar Relatório da Última Prova**

abre o último relatório disponível no navegador padrão.

Caso o relatório HTML esteja ausente, ele poderá ser reconstruído automaticamente a partir dos registros canônicos da sessão.

O comando:

**SENAI Exam Logger: Regenerar Relatório da Última Prova**

permite reconstruir explicitamente os arquivos derivados utilizando o `session.json` finalizado e o JSONL canônico.

Sessões ainda em estado `ACTIVE` não são finalizadas implicitamente durante esse processo.

## Armazenamento

Nada é gravado diretamente dentro do projeto do aluno.

Os dados ficam no `ExtensionContext.globalStorageUri`, localização gerenciada pelo Visual Studio Code para cada sistema operacional.

Estrutura aproximada:

```text
globalStorageUri/
└── sessions/<sessionId>/
    ├── session.json
    ├── summary.json
    ├── files-summary.csv
    ├── events.jsonl
    ├── events/
    │   ├── events.jsonl
    │   ├── events.pretty.json
    │   └── events.csv
    ├── report.html
    └── snapshots/<caminho-seguro>/<timestamp>-<hash>.txt
```

`session.json` contém informações como ID da sessão, aluno, turma, avaliação, início, término, URI e caminho do workspace, versão da extensão e estado da sessão.

`events.jsonl` contém um objeto JSON por linha, com ID, sessão, timestamp, tipo do evento e dados aplicáveis.

A escrita dos eventos é serializada para evitar concorrência entre operações de append.

## Arquivos gerados

### `session.json`

Contém os metadados finais da sessão, duração, estado e hash do log.

### `events.jsonl`

Log canônico bruto e append-only da sessão.

### `events/events.jsonl`

Cópia organizada do log para facilitar inspeção e navegação.

### `events/events.pretty.json`

Todos os eventos ordenados e formatados para inspeção humana.

### `events/events.csv`

Eventos exportados em UTF-8 com BOM e colunas apropriadas para análise em ferramentas como Microsoft Excel.

### `files-summary.csv`

Métricas consolidadas por arquivo.

### `summary.json`

Resumo estruturado contendo informações da sessão, estatísticas, arquivos e eventos.

### `snapshots/`

Versões dos arquivos registradas em momentos relevantes da avaliação, deduplicadas por hash.

### `report.html`

Relatório offline principal destinado à análise pelo professor.

Normalmente, o professor deverá consultar o `report.html`. Os demais arquivos existem principalmente para auditoria, inspeção técnica e reconstrução dos relatórios.

## Eventos registrados

A extensão pode registrar os seguintes eventos:

* `SESSION_STARTED`
* `SESSION_RECOVERED`
* `SESSION_FINISHED`
* `DOCUMENT_OPENED`
* `DOCUMENT_CLOSED`
* `DOCUMENT_ACTIVATED`
* `DOCUMENT_DEACTIVATED`
* `EXTERNAL_DOCUMENT_OPENED`
* `DOCUMENT_CHANGED`
* `DOCUMENT_SAVED`
* `FILE_CREATED`
* `FILE_DELETED`
* `FILE_RENAMED`
* `BULK_INSERT`
* `POSSIBLE_INTERNAL_COPY`
* `IDLE_STARTED`
* `IDLE_ENDED`
* `SNAPSHOT_CREATED`
* `REPORT_GENERATED`

## Registro de alterações

As alterações observadas pelo Visual Studio Code armazenam suas respectivas `contentChanges`.

Por padrão, textos de até 4096 caracteres são registrados integralmente.

Acima desse limite são armazenados:

* tamanho total;
* SHA-256;
* `truncated=true`;
* preview limitado do conteúdo.

O limite pode ser alterado nas configurações da extensão.

## Bulk Insert

Por padrão, um evento `BULK_INSERT` é registrado quando uma única alteração contém pelo menos:

* 100 caracteres; **ou**
* 5 linhas.

O evento pode incluir informações sobre os intervalos desde a última edição ou atividade observável e eventual período de inatividade recém-encerrado.

`BULK_INSERT` é exclusivamente uma heurística quantitativa.

> A ocorrência de `BULK_INSERT` não comprova que o conteúdo tenha sido copiado de uma fonte externa e não representa, isoladamente, uma irregularidade.

## Possível cópia interna

Durante um `BULK_INSERT`, documentos internos previamente carregados podem ser comparados com o conteúdo inserido.

Para correspondências exatas, a extensão utiliza comparação por substring.

Para correspondências parciais, utiliza uma proporção de caracteres presentes em linhas normalizadas idênticas, evitando algoritmos quadráticos.

Quando a similaridade ultrapassa o limite configurado, pode ser registrado:

`POSSIBLE_INTERNAL_COPY`

Por padrão, o limite de similaridade é `0.85`.

O evento representa exclusivamente uma **possível origem interna**.

> `POSSIBLE_INTERNAL_COPY` não comprova a origem do conteúdo e deve ser interpretado pelo professor juntamente com as demais evidências da avaliação.

Conteúdos abaixo de 40 caracteres não são utilizados para correlação.

## Inatividade

Inatividade significa exclusivamente ausência de eventos observáveis pela extensão, como:

* alteração de documento;
* salvamento;
* troca de editor ativo;
* operações de arquivo observáveis.

Por padrão, após 60 segundos sem atividade observável, é registrado um único:

`IDLE_STARTED`

Quando uma nova atividade é detectada, é registrado:

`IDLE_ENDED`

O evento contém informações como início, término, duração e arquivo ativo.

> A inatividade registrada não determina presença física do usuário e não identifica atividades realizadas em outros aplicativos.

## Snapshots

Snapshots são criados em situações como:

* salvamento de arquivos;
* finalização da avaliação;
* `BULK_INSERT`, quando habilitado.

Um cache baseado em SHA-256 evita snapshots consecutivos idênticos.

Ao final da sessão, `session.json` recebe o SHA-256 de `events.jsonl`.

Esse hash auxilia na verificação de integridade dos registros.

Como todo o armazenamento é local, o mecanismo não impede adulteração por um usuário que possua acesso privilegiado ao computador.

## Configurações

### `senaiExamLogger.bulkInsertCharacterThreshold`

Padrão: `100`

Quantidade mínima de caracteres em uma alteração para registrar `BULK_INSERT`.

### `senaiExamLogger.bulkInsertLineThreshold`

Padrão: `5`

Quantidade mínima de linhas inseridas em uma alteração para registrar `BULK_INSERT`.

### `senaiExamLogger.internalCopySimilarityThreshold`

Padrão: `0.85`

Similaridade mínima necessária para registrar uma possível origem em outro arquivo interno.

### `senaiExamLogger.idleThresholdSeconds`

Padrão: `60`

Quantidade de segundos sem atividade observável antes de registrar `IDLE_STARTED`.

### `senaiExamLogger.maxStoredInsertedTextLength`

Padrão: `4096`

Quantidade máxima de caracteres de uma alteração armazenados integralmente.

### `senaiExamLogger.snapshotOnBulkInsert`

Padrão: `true`

Define se um snapshot deve ser criado após uma inserção em massa.

## Instalação pelo Visual Studio Marketplace

O SENAI Exam Logger pode ser distribuído por meio do Visual Studio Marketplace.

No Visual Studio Code, abra a área de extensões:

`Ctrl+Shift+X`

Pesquise por:

`SENAI Exam Logger`

e selecione **Install**.

## Instalação manual por VSIX

Também é possível instalar a extensão utilizando um pacote `.vsix`.

Exemplo:

```bash
code --install-extension senai-exam-logger-1.0.0.vsix
```

No computador onde a extensão será utilizada são necessários apenas o Visual Studio Code compatível e a extensão instalada.

Node.js, npm, TypeScript e o código-fonte não são necessários para utilização normal.

## Fluxo básico de utilização

1. Instale o SENAI Exam Logger.
2. Abra a pasta da avaliação no Visual Studio Code.
3. Pressione `Ctrl+Shift+P`.
4. Execute **SENAI Exam Logger: Iniciar Prova**.
5. Preencha as informações solicitadas.
6. Realize a avaliação normalmente.
7. Execute **SENAI Exam Logger: Finalizar Prova**.
8. Consulte o relatório gerado.

## Localização dos registros

O armazenamento utiliza `ExtensionContext.globalStorageUri`.

Para a versão publicada pelo publisher `lookdev`, o identificador da extensão é:

```text
lookdev.senai-exam-logger
```

Localizações típicas:

### Windows

```text
%APPDATA%\Code\User\globalStorage\lookdev.senai-exam-logger
```

### Linux

```text
~/.config/Code/User/globalStorage/lookdev.senai-exam-logger
```

### macOS

```text
~/Library/Application Support/Code/User/globalStorage/lookdev.senai-exam-logger
```

Variantes do Visual Studio Code podem utilizar outra raiz.

O comando:

**SENAI Exam Logger: Abrir Pasta de Logs**

é a maneira mais confiável de localizar o armazenamento utilizado pela instalação atual.

## Desenvolvimento

Requisitos:

* Node.js 22;
* npm;
* Visual Studio Code 1.85 ou posterior.

Clone o repositório e execute:

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Para testar a extensão em ambiente de desenvolvimento:

1. clone e abra o projeto no Visual Studio Code;
2. execute `npm install`;
3. abra uma pasta de avaliação;
4. pressione `F5`;
5. utilize a nova janela **Extension Development Host**;
6. pressione `Ctrl+Shift+P` para acessar os comandos.

Para recompilação contínua durante o desenvolvimento:

```bash
npm run watch
```

## Empacotamento

Para gerar um pacote `.vsix`:

```bash
npm run package
```

O arquivo gerado seguirá o padrão:

```text
senai-exam-logger-<versão>.vsix
```

Por exemplo:

```text
senai-exam-logger-1.0.0.vsix
```

## Limitações

* Logs e snapshots são armazenados localmente.
* Não existe assinatura criptográfica externa ou envio para servidor remoto.
* Um usuário com privilégios suficientes sobre a máquina pode modificar arquivos locais.
* A recuperação exige que o workspace oficial esteja disponível.
* Em situações inconsistentes com múltiplas sessões `ACTIVE`, a recuperação pode selecionar a sessão ativa mais recente.
* Eventos de arquivos representam operações observadas pelas APIs do Visual Studio Code.
* Mudanças que não chegam às APIs do workspace podem não ser registradas.
* `BULK_INSERT` é uma heurística quantitativa e não uma conclusão sobre a ação do usuário.
* `POSSIBLE_INTERNAL_COPY` representa similaridade e não comprovação de origem.
* O Visual Studio Code informa documentos e editores ativos, mas isso não comprova atenção do usuário.
* A extensão não determina a origem global do clipboard.
* A extensão não identifica `Ctrl+V` globalmente.
* A extensão não monitora atividades realizadas fora do Visual Studio Code.
* A correlação interna considera documentos de texto carregados na instância e não realiza varredura agressiva de todo o workspace a cada alteração.
* O agrupamento visual de edições ocorre no relatório HTML; `events.jsonl` preserva os eventos individuais.

## Segurança

Os logs locais não constituem uma barreira de segurança contra um usuário com acesso administrativo à máquina.

O SENAI Exam Logger foi projetado como uma ferramenta de **registro, auditoria e apoio à análise de avaliações**, e não como mecanismo de segurança, bloqueio ou detecção automática de fraude.

As informações produzidas pela extensão devem ser interpretadas dentro do contexto da avaliação e analisadas pelo responsável pela aplicação da prova.

## Código-fonte

O SENAI Exam Logger é open source.

Repositório oficial:

https://github.com/lookdev-luz/senai-exam-logger

Problemas, sugestões e contribuições podem ser registrados por meio do GitHub Issues.

## Licença

Distribuído sob a licença ISC.
