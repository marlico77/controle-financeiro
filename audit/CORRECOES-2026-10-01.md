# Correções da revisão — 01/10/2026

Branch: `codex/correcoes-seguranca-integridade`.

As alterações que já existiam no front e em `server.js` foram preservadas, incluindo a data final dos eventos. As correções foram feitas no código local; não houve deploy, migração do banco real nem envio de e-mail, push ou WhatsApp durante a validação.

## Resultado por achado

Os números correspondem ao relatório original `RELATORIO-REVISAO-2026-10-01.md`. As linhas daquele relatório se referem ao código anterior à correção.

| Achado | Alteração implementada |
|---|---|
| 01 | Download consulta registro e autorização antes do storage; rota pública aceita somente imagens de especialidade registradas. Política privada do bucket deve ser conferida no ambiente. |
| 02 | Todas as rotas de planejamento exigem login; alterações exigem administração. |
| 03 | Relação familiar em `person_guardians`, atribuída por administração; nome e edição do perfil não concedem acesso. Vínculos antigos exigem revisão manual. |
| 04 | Escape em relatórios, especialidades, calendário, logs, galeria e templates de e-mail; dados removidos de handlers inline sensíveis; alertas sanitizados e URLs HTTP/HTTPS. |
| 05 | Segredos removidos dos defaults/seed, configuração obrigatória, senha desconhecida individual ou convite, troca obrigatória aplicada no servidor. Rotacionar credenciais antigas no ambiente. |
| 06 | JWT carrega versão de sessão; servidor consulta papel atual e revoga sessão após alteração de credenciais/papel. |
| 07 | Recuperação pública somente por CPF desativada; recuperação usa token aleatório, hash, expiração e e-mail verificado. Comparação literal de login. |
| 08 | Limites por origem e operação persistidos no PostgreSQL para login, recuperação, verificação e contato; recuperação responde genericamente. |
| 09 | Transações reservam uma conexão e liberam o cliente em `finally`. |
| 10 | Edição parcial preserva campos omitidos; unidade e vínculos só podem ser alterados pela administração. |
| 11 | Membro não sobrescreve pagamento aprovado; conferências concorrentes só alteram registro pendente e retornam 409 após processamento. |
| 12 | Valores positivos em centavos, limites de precisão, mês/ano válidos, meses sem duplicidade e rateio sem perda de centavos. |
| 13 | Lote de pagamentos usa uma transação; falha reverte o lote. Storage externo não integra a transação: uploads órfãos ainda podem ocorrer em caso de rollback. |
| 14 | Pagamento de evento exige inscrição e respeita modalidade; evento único não recebe mês/ano. |
| 15 | Mensalidades, eventos, vendas e despesas usam o ano selecionado, incluindo eventos únicos pela data do evento. Totais representam movimento anual, sem saldo inicial acumulado. |
| 16 | PostgreSQL retorna DATE como data civil; front mantém tratamento consistente de datas e aniversários. |
| 17 | Migrações versionadas criam schema básico, `end_date` e restrições; inicialização ocorre antes de rotas/workers atenderem. Aplicação real do SQL ainda requer homologação. |
| 18 | Worker habilitado explicitamente; claim atômico, estados `queued`, `skipped`, `error` e `sent` baseados no processamento da fila. |
| 19 | Envio usa IDs selecionados explicitamente; busca e selecionar todos não viram broadcast implícito. |
| 20 | TLS remoto verifica certificado; CA configurável. Desabilitação é uma configuração explícita para desenvolvimento local. |
| 21 | Imagens decodificadas e convertidas; formatos ativos rejeitados; PDF reconhecido pela assinatura e servido como anexo; `nosniff` e `no-store` nos comprovantes. Isso não é antivírus nem validação semântica completa do PDF. |
| 22 | Leitura de notificações por usuário; avisos globais entram na consulta; novos broadcasts criam avisos individuais. |
| 23 | Administração (`admin`/`secretário`) alinhada nas principais operações financeiras, pessoas, eventos, relatórios e planejamento; gestão de credenciais/papéis e integração continua restrita. |
| 24 | Parser ampliado apenas para mídia do chat; limite de 10 MB no front e validação no back. |
| 25 | Modal duplicado removido; IDs HTML e referências locais verificados. |
| 26 | Download unificado inclui vendas/despesas e autorização familiar, tanto no banco quanto no storage. |
| 27 | Retenção configurável (padrão 365 dias, mínimo 90); IP usa proxies explicitamente confiáveis; mutações bem-sucedidas auditadas sem registrar corpos/segredos. Logs continuam em banco, sem garantia criptográfica de imutabilidade. |
| 28 | `updated_at` persistido e retornado nas consultas de pagamentos. Registros antigos recebem data da migração, pois a data histórica real não pode ser reconstruída. |
| 29 | PWA normaliza query dos assets, precache tolera falhas opcionais e abrange páginas/módulos; APIs privadas usam somente rede e resposta explícita de indisponibilidade offline. |
| 30 | Código criptográfico com hash/expiração, limite de tentativas, normalização e índice único de e-mail; confirmação atômica trata conflito. |
| 31 | Pessoa e credenciais atualizadas em transação; sincronização aguardada, protegida por lock e unicidade; responsáveis não são criados por coincidência de nome. |
| 32 | Fuso oficial compartilhado por tela, bloqueio e cron; horário civil convertido explicitamente; claim/deduplicação persistidos para lembretes. |

## Validação

`npm test`: **43 testes passaram, zero falhas**. Inclui sintaxe do código e scripts HTML, IDs/arquivos locais, HTTP real em loopback, autorização, revogação JWT, validação monetária, rollback, comprovantes, XSS, seleção de destinatários, conversão de fuso e configuração TLS.

Banco/storage são simulados nos testes. Não houve teste em PostgreSQL real nem teste completo das telas em navegador. Nenhuma execução real de Resend, Supabase, W-API ou push foi feita. Migrações, políticas de storage, entrega de mensagens, concorrência entre instâncias e atualização do PWA precisam de homologação antes do deploy. A lista de preparação está em `IMPLANTACAO.md`.

## Limpeza do ambiente de teste local (05/10/2026)

A instância PostgreSQL temporária usada para testar a aplicação, seus dados, credenciais geradas, logs, binários e scripts auxiliares não referenciados foram removidos do computador. Esses arquivos estavam fora do controle de versão. O `.env` local aponta para um banco remoto e foi preservado; ele continua ignorado pelo Git e pelo Docker. Arquivos `.env.*` futuros também ficam excluídos, exceto o modelo sem segredos `.env.example`.
