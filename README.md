# 🎰 Clube Wins - Cloudflare Pages

> Site oficial do Clube Wins hospedado na Cloudflare - `clubewins.com.br`

[[Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-orange?logo=cloudflare)](https://pages.cloudflare.com/)
[[Deploy](https://img.shields.io/badge/deploy-manual-blue)](https://dash.cloudflare.com)

## 📋 Sobre

Projeto do site Clube Wins com deploy automático e manual na Cloudflare. 
Domínio principal: **clubewins.com.br**

## 🚀 Tecnologias

- Node.js + Vite / React
- Cloudflare Pages & Workers
- Wrangler CLI
- `_redirects` para regras de redirecionamento

## 📁 Estrutura de pastas

```
clubewins/
├── public/
│   ├── _redirects       # Regras de redirecionamento (www -> sem www)
│   └── favicon.ico
├── src/
│   ├── pages/
│   └── components/
├── dist/                # Build gerado (não subir no Git, só no deploy manual)
├── wrangler.toml        # Config do Cloudflare
├── package.json
└── README.md
```

## 🌐 Deploy - 2 jeitos

### Jeito 1 - Automático (GitHub conectado) - RECOMENDADO pro celular

1. Conecta o repositório no painel:
   `dash.cloudflare.com > Workers e Pages > clubewins > Configurações > Compilações > Conectar GitHub`

2. Configurações de build:
   - **Comando de compilação:** `npm install && npm run build`
   - **Diretório de saída:** `dist`
   - **Comando de implantação:** (deixar vazio)

3. Todo `git push` na `main` já sobe automático.

### Jeito 2 - Manual (Wrangler - Direct Upload)

Use quando desconectar o GitHub:

```bash
# 1. Instalar Wrangler
npm install -g wrangler

# 2. Logar na Cloudflare
npx wrangler login

# 3. Gerar build
npm install
npm run build

# 4. Deploy
npx wrangler pages deploy ./dist --project-name=clubewins
```

Ou pelo painel: `Criar aplicativo > Pages > Upload de ativos > Selecionar pasta dist`

## 🔀 Redirecionamentos

O arquivo `public/_redirects` já resolve o www:

```
https://www.clubewins.com.br/* https://clubewins.com.br/:splat 301!
/* /index.html 200
```

Para SPA (React), descomente a última linha.

## 🌍 Domínio personalizado

Depois do deploy:
`Workers e Pages > clubewins > Domínios personalizados > Adicionar domínio > clubewins.com.br`

Adicione também `www.clubewins.com.br` - o `_redirects` já cuida do redirecionamento.

## ⚙️ Variáveis de ambiente

Não subir `.env` no Git. Configure no painel:
`clubewins > Configurações > Variáveis e segredos`

## 📱 Como editar pelo celular

1. `github.com` no Chrome > modo computador
2. Abra o arquivo > lápis para editar
3. `Commit changes` - se o GitHub estiver conectado, já deploya sozinho.

## 🛠️ Comandos úteis

```bash
npm run dev      # rodar local
npm run build    # gerar dist/
npx wrangler pages deployment list --project-name=clubewins  # listar deploys
```

## 📄 Licença

Projeto privado - Clube Wins

---

Feito com ❤️ para `clubewins.com.br`
