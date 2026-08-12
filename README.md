# SENAI Exam Logger

Extensão privada e mínima para Visual Studio Code que servirá como base para o
registro da evolução do código de alunos durante avaliações práticas.

Nesta etapa, a extensão apenas disponibiliza três comandos de diagnóstico. Não
há monitoramento, captura de conteúdo ou persistência de dados.

## Comandos

Abra a Paleta de Comandos (`Ctrl+Shift+P`) e execute:

- **SENAI Exam Logger: Iniciar Prova**
- **SENAI Exam Logger: Finalizar Prova**
- **SENAI Exam Logger: Status**

Cada comando exibe uma mensagem informativa no Visual Studio Code.

## Desenvolvimento

Requisitos:

- Node.js 22
- npm
- Visual Studio Code 1.85 ou mais recente

Instale as dependências e valide o projeto:

```bash
npm install
npm run check
npm run build
```

O bundle da extensão é criado em `dist/extension.js`. Para recompilar
automaticamente durante o desenvolvimento, use `npm run watch`.

## Teste no Windows

1. Clone o repositório e abra sua pasta no Visual Studio Code.
2. Abra um terminal integrado e execute `npm install`.
3. Pressione `F5` (ou escolha **Run > Start Debugging**).
4. Na janela **Extension Development Host**, abra a Paleta de Comandos com
   `Ctrl+Shift+P`.
5. Procure por `SENAI Exam Logger` e execute cada um dos três comandos.

O perfil de depuração executa o build antes de abrir o Extension Development
Host.
