# Configuração de produção

O Worker `clubewins-worker` está publicado para `clubewins.com.br` e `www.clubewins.com.br`. O D1 `clubewins-data` e a fila `clubewins` estão configurados. R2 está intencionalmente desativado; o site e as APIs que não dependem de arquivos continuam funcionando.

## Estado atual

- Curtidas dos vídeos e seus totais são compartilhados no D1 por identificador anônimo do navegador. Não há cadastro de contas nem recuperação de senha.
- Sem R2, vídeos adicionados ficam somente no armazenamento local do navegador e não são compartilhados. As rotas de upload e mídia do Worker respondem `503` enquanto não houver bucket.
- Sem as chaves do Turnstile, comentários, votos e denúncias compartilhados ficam desativados; a interface informa quando a ação é apenas local.
- O AdSense ainda não está configurado. A tela de perfil mostra um espaço local de publicidade, sem carregar anúncios reais. `/ads.txt` responde `503` até existir um publisher ID válido.
- `ADMIN_API_KEY` já está cadastrado como secret no Worker. Nunca coloque seu valor no HTML ou no repositório.

## Ativar R2 futuramente

1. No Dashboard Cloudflare, habilite R2 e conclua a configuração de cobrança exigida pela conta.
2. Crie o bucket: `npx wrangler r2 bucket create clubewins-video-storage`.
3. Adicione novamente em `wrangler.jsonc` a binding `VIDEOS` apontando para `clubewins-video-storage`.
4. Faça um dry-run e publique com `npx wrangler deploy`.

O código mantém `VIDEOS` opcional: assim o Worker também pode ser publicado sem bucket. Não habilite uploads compartilhados antes de testar o bucket e configurar Turnstile.

## Turnstile

1. Crie um widget Turnstile para os domínios `clubewins.com.br` e `www.clubewins.com.br`.
2. Coloque a site key em `vars.TURNSTILE_SITE_KEY` no `wrangler.jsonc`.
3. Cadastre a secret com `npx wrangler secret put TURNSTILE_SECRET_KEY`.
4. Faça deploy. Ações protegidas só serão compartilhadas após a validação do token.

Uploads compartilhados também exigem R2 ativo. Até lá, o formulário salva o arquivo apenas no navegador que o enviou.

## Moderação

A chave de moderação fica no secret `ADMIN_API_KEY`. Para substituir, gere uma chave longa e aleatória e execute `npx wrangler secret put ADMIN_API_KEY`. No site, abra **Menu → Moderação** e informe a chave.

## Google AdSense

Depois que o domínio e a conta forem aprovados, preencha em `wrangler.jsonc`:

- `vars.ADSENSE_PUBLISHER_ID`: identificador `ca-pub-...` fornecido pelo AdSense.
- `vars.ADSENSE_AD_SLOT`: ID numérico de um bloco aprovado.

Faça deploy e confirme `https://clubewins.com.br/ads.txt` e a veiculação no painel do AdSense. Os cards de patrocínio, afiliados e VIP são ideias de monetização, não processam pagamentos nem geram receita automaticamente.

## Dados e privacidade

O backend usa um identificador anônimo do navegador; não há cadastro de contas. D1 armazena curtidas, seguimentos e interações compartilhadas que passaram pelas validações. O perfil permite remover os vídeos, seguimentos e denúncias locais deste aparelho; essa ação não exclui registros já enviados ao servidor. Enquanto R2 estiver desativado, os arquivos de vídeo enviados pelo formulário ficam no navegador do próprio usuário. Revise retenção de dados, termos e políticas de privacidade antes de ativar uploads públicos.