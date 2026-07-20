# VSR Subtyping Tool

Aplicativo web instalável (PWA) para registrar amostras GAL, informar valores de CT para VSR-A/VSR-B e gerar o relatório de subtipagem em PDF.

## Protótipo 0.1

- Instalação pelo Chrome no Android ou pela Tela de Início do Safari no iPhone.
- Leitura de código de barras pela câmera.
- Entrada e confirmação manual do GAL.
- Registro dos CTs de VSR-A e VSR-B.
- Aviso de GAL duplicado.
- Persistência local automática.
- Geração e compartilhamento do PDF.
- Operação sem servidor e sem envio dos dados para a internet.

## Executar localmente

Use `pnpm install`, depois `pnpm dev`. A versão publicada deve ser acessada por HTTPS para permitir câmera e instalação.

## Próximas validações

- Confirmar qual informação é retornada pelo código de barras real das etiquetas.
- Definir a regra oficial de interpretação do CT e do campo Resultado.
- Adicionar OCR do texto `GAL - ...` para etiquetas cujo código esteja curvado ou danificado.
- Ajustar o PDF para equivalência visual final com o modelo do laboratório.
