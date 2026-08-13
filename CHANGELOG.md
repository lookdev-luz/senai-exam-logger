# Changelog

Todas as alterações relevantes do SENAI Exam Logger serão documentadas neste arquivo.

## [1.0.0] - 2026-08-13

### Adicionado

- Registro de sessões de avaliações práticas de programação.
- Identificação de aluno, turma e avaliação.
- Monitoramento de abertura, fechamento e ativação de documentos.
- Registro de alterações e salvamentos de arquivos.
- Registro de criação, exclusão e renomeação de arquivos.
- Detecção heurística de inserções em massa (`BULK_INSERT`).
- Detecção de possível similaridade com arquivos internos (`POSSIBLE_INTERNAL_COPY`).
- Registro de períodos de inatividade observáveis no Visual Studio Code.
- Criação automática de snapshots.
- Recuperação de sessões após reinicialização ou reload do Visual Studio Code.
- Geração de relatório HTML offline.
- Exportação de eventos em JSON, JSONL e CSV.
- Geração de resumo de arquivos em CSV.
- Verificação de integridade do log utilizando SHA-256.
- Comandos para consultar status, visualizar logs e regenerar relatórios.
- Configurações personalizáveis para thresholds de monitoramento.
