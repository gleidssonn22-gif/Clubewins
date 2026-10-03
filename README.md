# Clubewins 💜

Site estático do Clubewins, preparado para publicação no Cloudflare Pages.

## Estrutura

- `index.html` - aplicação completa em uma única página
- `_headers` - cabeçalhos de segurança compatíveis com Cloudflare Pages
- `_redirects` - fallback para SPA
- `README.md` - instruções

## Publicação no Cloudflare Pages

1. Envie estes arquivos para o repositório GitHub.
2. No Cloudflare, abra **Workers & Pages**.
3. Crie um projeto Pages conectado ao GitHub.
4. Escolha o repositório `Clubewins`.
5. Branch: `main`.
6. Framework preset: `None`.
7. Build command: deixe vazio.
8. Build output directory: `/`.
9. Faça o deploy.

O site não precisa de Node.js ou npm para esta versão.

## Observação sobre dados

Esta versão salva perfil, eventos, mural e preferências no navegador usando `localStorage`. Ela não expõe nenhuma chave secreta no código.

Para contas reais, sincronização entre dispositivos, autenticação, moderação e banco de dados, a integração com Supabase deve ser configurada em uma etapa separada.

## AdSense

O código inclui o publisher informado para o Clubewins:
`ca-pub-8005983262078707`

A aprovação e a exibição efetiva dos anúncios dependem da configuração e aprovação da conta do Google AdSense.
