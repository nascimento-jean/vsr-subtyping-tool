# VSR Subtyping Tool

Aplicativo web instalável (PWA) para registrar amostras GAL, informar valores de CT para VSR-A/VSR-B e gerar o relatório de subtipagem em PDF.

## Acessar o aplicativo

**[Abrir o VSR Subtyping Tool](https://nascimento-jean.github.io/vsr-subtyping-tool/)**

O aplicativo funciona pelo navegador e pode ser instalado na tela inicial de celulares Android e iPhone. Não é necessário criar conta ou informar credenciais.

## Como utilizar

1. Abra o aplicativo e preencha os dados da execução, como kits e data.
2. Toque em **Fotografar GAL**.
3. Centralize no quadro o texto da etiqueta que começa com `GAL -`.
4. Toque em **Capturar e reconhecer**.
5. Confira o número sugerido comparando-o com a imagem ampliada. Corrija-o se necessário.
6. Informe o CT de **VSR-A** e/ou **VSR-B**.
7. Toque em **Adicionar à execução**.
8. Repita o procedimento para as demais amostras.
9. Preencha os responsáveis e toque em **Baixar PDF** ou **Baixar Excel**.

O modo **Tentar código de barras** permanece disponível como alternativa. Para etiquetas dobradas, curvadas ou danificadas, recomenda-se fotografar o texto do GAL e realizar a conferência visual.

## Instalar no Android

1. Abra o [link do aplicativo](https://nascimento-jean.github.io/vsr-subtyping-tool/) no **Google Chrome**.
2. Toque no menu de três pontos (`⋮`).
3. Selecione **Instalar aplicativo** ou **Adicionar à tela inicial**.
4. Confirme a instalação.
5. Abra o **VSR Subtyping Tool** pelo ícone criado na tela do celular.

Em alguns aparelhos, o próprio Chrome exibe automaticamente o botão **Instalar app**.

## Instalar no iPhone

1. Abra o [link do aplicativo](https://nascimento-jean.github.io/vsr-subtyping-tool/) no **Safari**.
2. Toque no botão **Compartilhar** — o quadrado com uma seta apontando para cima.
3. Role as opções e selecione **Adicionar à Tela de Início**.
4. Confirme o nome **VSR Subtyping Tool** e toque em **Adicionar**.
5. Abra o aplicativo pelo ícone criado na tela inicial.

## Recursos

- fotografia e reconhecimento do número GAL por OCR;
- imagem ampliada para conferência e correção do GAL;
- leitura opcional de código de barras;
- registro dos CTs de VSR-A e VSR-B;
- aviso de GAL duplicado;
- armazenamento automático no próprio aparelho;
- geração do relatório em PDF;
- geração de planilha Excel com abas `Relatório` e `Dados`;
- importação de fotografia ou PDF de formulário preenchido;
- conversão automática de cada página do PDF em imagem no aparelho;
- revisão dos registros, nomes, CTs e resultados antes da inclusão;
- funcionamento sem cadastro de usuário.

## Privacidade e observações

Os dados da execução ficam armazenados localmente no navegador do aparelho. A fotografia é processada no navegador para reconhecimento do GAL e não é incorporada ao relatório.

O número reconhecido automaticamente deve ser conferido antes da inclusão da amostra, especialmente quando a etiqueta apresentar dobras, curvatura, reflexos ou caracteres parcialmente encobertos.

## Desenvolvimento local

```bash
pnpm install
pnpm dev
```

A versão de produção para o GitHub Pages é gerada na pasta `docs` com:

```bash
pnpm build
```
