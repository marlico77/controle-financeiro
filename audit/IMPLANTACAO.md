# Preparação para implantação

Este procedimento deve ser realizado por um operador autorizado, primeiro em homologação. Não foi executado no ambiente real durante as correções.

1. Faça backup recuperável do PostgreSQL e dos comprovantes. Use Node.js 22 ou superior e `npm ci`.
2. Configure `.env` conforme `.env.example`: `APP_URL` oficial, `APP_TIMEZONE`, segredo JWT aleatório, Supabase e canal Resend. Informe os CIDRs reais em `TRUST_PROXY`; deixe vazio quando não houver proxy confiável.
3. Rotacione chaves e credenciais anteriormente embutidas, caso estivessem em uso. A troca do JWT e a nova versão de sessão encerram sessões antigas. Não publique `.env`.
4. Confira TLS com o PostgreSQL remoto. Para CA privada, forneça seu conteúdo PEM em `DATABASE_CA`. Não use `DATABASE_SSL=false` para contornar erro de certificado em produção.
5. Inspecione duplicidades existentes antes de iniciar. Índices únicos podem impedir migração se houver username/e-mail duplicado, mais de uma conta por pessoa, participante repetido ou pagamentos repetidos no mesmo período. Não exclua registros financeiros automaticamente: concilie valores e comprovantes antes de decidir qual registro manter.
6. Execute `npm test`; inicie a aplicação em uma cópia do banco com `npm start`. Migrações são aplicadas em ordem, com lock e transação por arquivo. Uma migração que falha é revertida; arquivos anteriores já aplicados permanecem registrados. Verifique `schema_migrations` e teste também instalação em banco vazio. Não há ferramenta de rollback automático: use backup ou migração corretiva revisada.
7. Verifique o administrador principal. Se inexistente, use `npm run bootstrap:admin` com variáveis `BOOTSTRAP_ADMIN_*`. Para recuperação local de uma única conta principal, use `npm run bootstrap:admin -- --reset-primary` com senha temporária individual. Esse comando altera credenciais e revoga sessões. Apague a senha do ambiente depois. Contas antigas com `must_change_password=true` não são liberadas com a antiga senha compartilhada: precisam de ativação administrativa.
8. Cadastre/valide as contas de responsáveis e atribua os vínculos por ID em Pessoas. A migração deixa os vínculos vazios para evitar vincular famílias erradas por homônimos. Confirme proprietário, responsável autorizado e terceiro nos acessos a pessoas, pagamentos e comprovantes.
9. Verifique que o bucket `receipts` é privado e que políticas/RLS não permitem download anônimo direto nem listagem pública. A proteção das rotas Express não revoga uma política pública do Supabase. Planeje transferir imagens institucionais para bucket público separado com migração de URLs e arquivos; esta branch restringe a rota pública por registro, mas mantém o bucket existente.
10. Teste convites, e-mail verificado, recuperação, mudança de papel, upload e conferência com dados de teste. Convites são enviados após o cadastro; falha de envio mantém a conta criada e exige nova ativação pela administração. O storage externo não participa da transação do PostgreSQL e uploads órfãos podem exigir limpeza posterior.
11. Habilite WhatsApp apenas no ambiente de envio pretendido (`WHATSAPP_WORKER_ENABLED=true` e configuração `enabled`). Confirme `queued` → `sent` ou `error`. Uma interrupção durante uma chamada externa pode ter resultado indeterminado: itens antigos em processamento são marcados como erro e precisam de conferência antes de reenviar. Não há garantia de entrega exatamente uma vez sem idempotência do provedor. Lembretes vencidos enquanto a aplicação ficou parada precisam de revisão operacional.
12. Teste telas de admin, secretário, membro e responsável no navegador, a atualização do service worker e páginas offline. As APIs privadas exigem conexão; não há cache de dados financeiros por usuário. Confira o ano selecionado: totais são do período, sem saldo acumulado anterior.

Consultas somente de diagnóstico para duplicidades:

```sql
SELECT LOWER(username), COUNT(*) FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1;
SELECT LOWER(TRIM(email)), COUNT(*) FROM users WHERE email IS NOT NULL AND TRIM(email) <> '' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1;
SELECT person_id, COUNT(*) FROM users WHERE person_id IS NOT NULL GROUP BY person_id HAVING COUNT(*) > 1;
SELECT person_id, year, month, COUNT(*) FROM payments GROUP BY person_id, year, month HAVING COUNT(*) > 1;
SELECT event_id, person_id, year, month, COUNT(*) FROM event_payments GROUP BY event_id, person_id, year, month HAVING COUNT(*) > 1;
SELECT event_id, person_id, COUNT(*) FROM event_payments WHERE month IS NULL GROUP BY event_id, person_id HAVING COUNT(*) > 1;
SELECT event_id, person_id, COUNT(*) FROM event_participants GROUP BY event_id, person_id HAVING COUNT(*) > 1;
```
