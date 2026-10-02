# Relatório de revisão do front-end e back-end

Data: 01/10/2026. Projeto: Gestão Financeira — Tribo de Davi.

**Registro histórico anterior às correções.** Consulte `CORRECOES-2026-10-01.md` para o estado da branch corrigida. Linhas e resultados abaixo descrevem o código revisado originalmente; `verification-results.json` preserva a evidência inicial. O comando de verificação agora executa os testes de regressão atuais.

O código apresenta falhas que permitem acesso indevido a comprovantes e dados familiares, além de inconsistências no cadastro e nos valores financeiros. Minha recomendação é corrigir primeiro os controles de acesso e a integridade dos pagamentos, antes de ampliar funcionalidades.

## Escopo e evidências

Revisão estática do código local do servidor, rotas, banco, JavaScript do front-end e integração com HTML/PWA. A revisão considera também as alterações ainda não commitadas em `server.js`, `public/events.html`, `public/js/events.js`, `public/js/reports.js` e `public/js/ui.js`. Não é possível atribuir individualmente a autoria das falhas aos dois agentes apenas pelo código disponível.

Foi verificada a sintaxe dos 26 arquivos JavaScript da aplicação e dos 19 blocos de JavaScript embutidos em HTML. Foram conferidas as referências locais de scripts e duplicações de IDs nas páginas. Não houve erro de sintaxe ou referência de script local inexistente nessas verificações; isso não comprova o funcionamento das telas.

As reproduções executam trechos reais do código com banco, armazenamento, resposta HTTP e DOM simulados. Não iniciam a aplicação, não acessam dados reais, não enviam e-mails/WhatsApp e não executam o HTML malicioso usado como evidência. Não houve teste completo em navegador, acesso ao schema efetivo do banco, inspeção das políticas do Supabase ou auditoria de dependências via serviço externo. Portanto, efeitos dependentes do ambiente estão explicitamente identificados.

Artefatos: [verificações de regressão](D:/Aplicações/gestao-financeira/audit/verify-review.cjs) e [resultados históricos](D:/Aplicações/gestao-financeira/audit/verification-results.json). Execute `node audit/verify-review.cjs` na raiz para validar o comportamento corrigido; os resultados históricos não são regenerados por esse comando.

32 achados abaixo. “Reproduzido” significa comportamento confirmado no teste isolado; “leitura” significa evidência diretamente identificada no código, sem exploração no ambiente real.

## Falhas críticas

### 01. Comprovantes privados acessíveis por rota pública e por usuário de terceiros

**Local:** [server.js:2478](D:/Aplicações/gestao-financeira/server.js:2478) e [server.js:3638](D:/Aplicações/gestao-financeira/server.js:3638). **Evidência:** reproduzido.

`/api/public-images/:filename` baixa qualquer nome do bucket `receipts`, sem autenticação e sem verificar se o arquivo é imagem de especialidade. A rota autenticada `/api/files/receipt/:filename` também devolve o arquivo do Supabase antes de consultar o proprietário. Assim, conhecer o nome de um comprovante permite obtê-lo anonimamente pela primeira rota ou como outro membro pela segunda. Não foi demonstrada enumeração automática de nomes.

**Correção:** separar imagens públicas e comprovantes privados em buckets distintos. Consultar o registro e validar usuário, responsável ou papel administrativo antes de baixar o arquivo. A rota pública deve consultar um registro de imagem pública autorizado, sem aceitar nomes arbitrários do bucket privado. **Validação:** visitante e membro de outra família recebem 403/404; proprietário e responsável autorizado recebem o arquivo, tanto na nuvem quanto no fallback.

### 02. Planejamentos podem ser lidos e alterados sem login

**Local:** [server.js:86](D:/Aplicações/gestao-financeira/server.js:86) e [routes/plannings.js:6](D:/Aplicações/gestao-financeira/routes/plannings.js:6). **Evidência:** leitura.

O router é montado sem `authenticateToken`, e suas rotas não aplicam autenticação nem autorização. Um visitante consegue solicitar consultas, criação, edição e exclusão de atividades/cardápios, desde que as tabelas existam. CORS não substitui autenticação.

**Correção:** montar o router com autenticação e aplicar uma matriz explícita de permissões para leitura e escrita. **Validação:** todas as rotas rejeitam visitantes; membros sem permissão não alteram dados; administradores autorizados conseguem operar.

### 03. Vínculo entre responsável e filhos pode ser manipulado pelo próprio usuário

**Local:** [server.js:1150](D:/Aplicações/gestao-financeira/server.js:1150), [server.js:1599](D:/Aplicações/gestao-financeira/server.js:1599), [public/js/profile.js:57](D:/Aplicações/gestao-financeira/public/js/profile.js:57). **Evidência:** leitura.

O acesso aos filhos depende de `people.responsible` coincidir com o nome do responsável. O próprio responsável pode alterar seu `name` via API de perfil. Alterar esse nome para o de outro responsável pode passar nas consultas de autorização daquela família. Homônimos também podem misturar famílias. Membros podem alterar `responsible`, e a sincronização usa esse texto para criar contas de responsáveis.

**Correção:** criar uma relação por IDs, como `person_guardians(person_id, guardian_user_id)`, com atribuição validada pela administração. Nome e texto de contato não devem conceder autorização. **Validação:** renomear o perfil não muda os filhos acessíveis; homônimos permanecem separados; alterações de vínculo exigem permissão administrativa.

### 04. HTML de dados cadastrados pode executar código nas telas

**Local:** [public/js/reports.js:107](D:/Aplicações/gestao-financeira/public/js/reports.js:107), [public/js/especialidades.js:130](D:/Aplicações/gestao-financeira/public/js/especialidades.js:130), [public/clube.html:1573](D:/Aplicações/gestao-financeira/public/clube.html:1573), [public/js/logs.js:53](D:/Aplicações/gestao-financeira/public/js/logs.js:53). **Evidência:** relatório reproduzido; demais locais por leitura.

Relatórios interpolam nome, unidade e outros campos diretamente em `innerHTML`. Um membro pode cadastrar um nome contendo HTML que será renderizado quando a administração gerar seu relatório. Especialidades e calendário público também interpolam dados sem escape. Nos logs, JSON é inserido em um `onclick` com template literal; substituir apenas aspas duplas não protege crases e expressões JavaScript. `showAlert` e `showStatus` igualmente aceitam HTML.

**Correção:** usar `textContent`/elementos DOM para texto; aplicar escape consistente em templates e sanitização quando HTML for realmente necessário. Remover dados de handlers inline, usando `addEventListener`. Validar URLs antes de colocá-las em atributos. **Validação:** nomes, requisitos, eventos e detalhes de log com HTML são exibidos como texto, sem handlers executáveis. Prioridade elevada porque tokens estão acessíveis ao JavaScript no armazenamento do navegador.

## Falhas de prioridade alta

### 05. Senha inicial compartilhada e credenciais embutidas no código

**Local:** [server.js:61](D:/Aplicações/gestao-financeira/server.js:61), [server.js:91](D:/Aplicações/gestao-financeira/server.js:91), [server.js:460](D:/Aplicações/gestao-financeira/server.js:460), [server.js:703](D:/Aplicações/gestao-financeira/server.js:703), [server.js:1216](D:/Aplicações/gestao-financeira/server.js:1216). **Evidência:** leitura.

Novas contas recebem a mesma senha conhecida pelo código. Há chave privada VAPID e uma credencial de integração no seed. Também existe segredo JWT previsível quando `NODE_ENV` não é `production`. A troca obrigatória só bloqueia a interface: o middleware não exige que ela tenha sido feita. Não foi verificada a validade das credenciais embutidas.

**Correção:** substituir senha padrão por convite individual com token temporário; impor troca obrigatória no servidor; remover segredos e exigir configuração segura para ambientes acessíveis. Revogar/rotacionar credenciais embutidas que estiverem em uso, sem reproduzi-las em relatórios. **Validação:** conta nova não usa uma senha compartilhada nem acessa recursos antes de concluir ativação.

### 06. Mudança de senha e de papel não revogam tokens antigos

**Local:** [server.js:378](D:/Aplicações/gestao-financeira/server.js:378), [server.js:834](D:/Aplicações/gestao-financeira/server.js:834), [server.js:928](D:/Aplicações/gestao-financeira/server.js:928), [server.js:1000](D:/Aplicações/gestao-financeira/server.js:1000). **Evidência:** leitura.

O middleware aceita apenas a assinatura do JWT e usa o papel nele gravado. Tokens podem durar 30 dias. Trocar a senha, redefini-la ou rebaixar um administrador não invalida esses tokens. `/auth/status` atualizar a tela não modifica o papel do token usado nas APIs.

**Correção:** validar versão de sessão/estado atual do usuário no servidor e incrementá-la em recuperação de senha, alteração de papel e revogação. Reduzir duração de access tokens conforme o fluxo escolhido. **Validação:** token anterior perde acesso após redefinição; administrador rebaixado recebe 403 imediatamente.

### 07. Recuperação por CPF permite redefinir senha sem provar controle da conta

**Local:** [server.js:959](D:/Aplicações/gestao-financeira/server.js:959), [server.js:978](D:/Aplicações/gestao-financeira/server.js:978), [server.js:818](D:/Aplicações/gestao-financeira/server.js:818). **Evidência:** leitura.

A rota pública `reset-lost-password` permite troca de senha usando apenas username e CPF. CPF é um dado cadastral, não um segredo de autenticação. `ILIKE` também trata `%` e `_` como curingas: os usernames fornecidos no login e na recuperação não são comparados literalmente.

**Correção:** eliminar recuperação somente por CPF e exigir token enviado a canal previamente verificado ou atendimento administrativo validado. Usar comparação literal com normalização, por exemplo `LOWER(username) = LOWER($1)`. **Validação:** CPF e curingas não permitem selecionar/redefinir conta alheia.

### 08. Rotas públicas sensíveis não têm limitação de tentativas

**Local:** [server.js:147](D:/Aplicações/gestao-financeira/server.js:147), [server.js:810](D:/Aplicações/gestao-financeira/server.js:810), [server.js:897](D:/Aplicações/gestao-financeira/server.js:897), [routes/emailVerification.js:43](D:/Aplicações/gestao-financeira/routes/emailVerification.js:43). **Evidência:** leitura.

Não há limitação de tentativas no código para login, recuperação, contato ou códigos de verificação. Isso permite tentativas repetidas de acesso e disparos repetidos de e-mail. A recuperação ainda revela se existe conta com determinado e-mail.

**Correção:** limitar por conta e origem com armazenamento compartilhado quando houver múltiplas instâncias; aplicar espera progressiva e resposta genérica na recuperação. **Validação:** excesso de solicitações recebe 429 e não causa novo envio. Não foi inspecionada eventual proteção externa por proxy.

### 09. Transações de eventos usam conexões do pool sem reservar um cliente

**Local:** [server.js:1886](D:/Aplicações/gestao-financeira/server.js:1886), [server.js:1915](D:/Aplicações/gestao-financeira/server.js:1915), [database.js:15](D:/Aplicações/gestao-financeira/database.js:15). **Evidência:** leitura.

`BEGIN`, inserções e `COMMIT` são enviados por `db.query`, que usa `pool.query`. Não existe garantia de que todas as instruções usem a mesma conexão. Sob concorrência, um evento pode ficar sem todos os participantes e o rollback pode não proteger as inserções. A documentação do [node-postgres exige o mesmo cliente para toda a transação](https://node-postgres.com/features/transactions).

**Correção:** obter `client = await db.pool.connect()`, executar tudo com `client.query` e liberar em `finally`, seguindo o padrão já usado no cadastro de pessoas. **Validação:** falha proposital na segunda inscrição desfaz evento e inscrições anteriores, inclusive sob concorrência.

### 10. Salvar o perfil apaga unidade e telefone

**Local:** [public/js/profile.js:57](D:/Aplicações/gestao-financeira/public/js/profile.js:57), [server.js:1630](D:/Aplicações/gestao-financeira/server.js:1630). **Evidência:** reproduzido.

O perfil envia nome, responsável, CPF e nascimento. A API substitui também `unit` e `phone`; campos ausentes viram `NULL`. Uma edição simples remove a unidade usada nos relatórios e o telefone usado nas cobranças.

**Correção:** criar endpoint de perfil com campos permitidos, ou atualização parcial que preserve campos omitidos. Campos administrativos devem ter autorização própria. **Validação:** alterar nome ou CPF preserva unidade e telefone existentes.

### 11. Membro pode sobrescrever pagamento aprovado

**Local:** [server.js:1451](D:/Aplicações/gestao-financeira/server.js:1451), [server.js:2165](D:/Aplicações/gestao-financeira/server.js:2165), [public/js/financial.js:90](D:/Aplicações/gestao-financeira/public/js/financial.js:90). **Evidência:** mensalidade reproduzida; evento por leitura.

A interface esconde salvar para pagamentos aprovados, mas a API atualiza qualquer pagamento encontrado para a pessoa/período, sem validar o status anterior. Um membro pode alterar valor e transformar `approved` em `pending`, mudando saldo e registros já conferidos.

**Correção:** aplicar máquina de estados no servidor: membro reenvia apenas registros pendentes/recusados; ajuste de aprovado exige permissão e histórico de alteração. **Validação:** reenvio sobre aprovado recebe 409/403 e não modifica registro.

### 12. Valores, meses e lote não recebem validação financeira suficiente

**Local:** [server.js:1383](D:/Aplicações/gestao-financeira/server.js:1383), [server.js:1411](D:/Aplicações/gestao-financeira/server.js:1411), [server.js:2097](D:/Aplicações/gestao-financeira/server.js:2097), [server.js:2266](D:/Aplicações/gestao-financeira/server.js:2266), [server.js:2415](D:/Aplicações/gestao-financeira/server.js:2415). **Evidência:** valor negativo reproduzido; demais casos por leitura.

Checar apenas presença não rejeita valor negativo, string inválida ou mês fora de 1–12. `months` pode conter duplicações, não ser array ou estar vazio; seu `JSON.parse` ocorre antes do `try`. A divisão seguida de `toFixed(2)` para cada mês altera o total: R$ 100 em três meses resulta em R$ 99,99.

**Correção:** validar esquema completo no servidor, valores finitos e positivos, centavos, meses únicos e intervalo do ano. Dividir em centavos e atribuir o restante a uma parcela. Rejeitar entradas inválidas com 400 JSON. **Validação:** valores inválidos não chegam ao SQL; soma das parcelas é exatamente o total original.

### 13. Pagamento de vários meses pode ser salvo parcialmente

**Local:** [server.js:1448](D:/Aplicações/gestao-financeira/server.js:1448). **Evidência:** leitura.

O loop grava cada mês sem transação. Se uma operação posterior falhar, a resposta será erro, mas meses anteriores já podem estar alterados. A consulta de existência seguida de inserção também depende de restrições do banco para evitar duplicação concorrente; o schema efetivo não foi disponibilizado.

**Correção:** transação em cliente reservado, restrição única para pessoa/mês/ano e operação atômica compatível com a regra de status. Publicar notificações após commit. **Validação:** falha no último mês reverte todo o lote; duas requisições simultâneas não criam registros duplicados.

### 14. Pagamento de evento não valida inscrição nem modalidade

**Local:** [server.js:2097](D:/Aplicações/gestao-financeira/server.js:2097), [server.js:2152](D:/Aplicações/gestao-financeira/server.js:2152). **Evidência:** leitura.

A rota autoriza a pessoa, mas não consulta se ela está inscrita naquele evento nem o `payment_type`. O corpo decide se o registro é único ou parcelado. Um usuário pode criar pagamento para evento em que não participa ou gravar modalidade incompatível, gerando valores que não aparecem na grade dos participantes.

**Correção:** carregar evento e inscrição antes da gravação; derivar modalidade do evento, exigir mês/ano somente para parcelado e definir regra explícita para pagamento por terceiros. **Validação:** inscrição ausente e modalidade incompatível são rejeitadas.

### 15. Saldo e gráficos misturam períodos diferentes

**Local:** [public/js/core.js:616](D:/Aplicações/gestao-financeira/public/js/core.js:616), [public/js/dashboard.js:29](D:/Aplicações/gestao-financeira/public/js/dashboard.js:29), [public/js/dashboard.js:57](D:/Aplicações/gestao-financeira/public/js/dashboard.js:57). **Evidência:** leitura.

Mensalidades são carregadas pelo ano selecionado; pagamentos de eventos, vendas e despesas são carregados sem o mesmo filtro. O saldo soma/subtrai esses conjuntos juntos. O gráfico de eventos usa o mês sem filtrar o ano. Trocar o ano muda apenas parte dos totais.

**Correção:** definir se o indicador representa saldo acumulado ou movimento do ano. Para movimento anual, filtrar todas as fontes pelo mesmo período; para saldo acumulado, incluir saldo de abertura e todas as movimentações até a data de corte. Preferir cálculo central no servidor. **Validação:** dados de dois anos produzem números separados e reconciliáveis.

### 16. Contrato de datas do banco quebra relatórios e gráfico de vendas

**Local:** [public/js/reports.js:242](D:/Aplicações/gestao-financeira/public/js/reports.js:242), [public/js/reports.js:319](D:/Aplicações/gestao-financeira/public/js/reports.js:319), [public/js/dashboard.js:64](D:/Aplicações/gestao-financeira/public/js/dashboard.js:64). **Evidência:** parser do `pg` instalado reproduzido.

O parser padrão de `DATE` da dependência instalada retorna um `Date`, serializado como timestamp ISO. As telas concatenam `T00:00:00` ou `T12:00:00` a essa resposta, formando uma data inválida. O teste confirmou isso para uma data civil de 01/10/2026. O efeito depende do tipo das colunas reais; `sales.date` é explicitamente `DATE` no código.

**Correção:** padronizar datas civis da API como `YYYY-MM-DD`, sem conversão por fuso; timestamps devem permanecer timestamps. Reutilizar formatadores que conheçam o contrato. **Validação:** eventos, vendas e aniversário têm a mesma data em São Paulo e UTC; relatório não exibe data inválida.

### 17. Mudança recente exige coluna sem migração; instalação em banco vazio é incompleta

**Local:** [server.js:590](D:/Aplicações/gestao-financeira/server.js:590), [server.js:804](D:/Aplicações/gestao-financeira/server.js:804), [server.js:1887](D:/Aplicações/gestao-financeira/server.js:1887), [README.md:70](D:/Aplicações/gestao-financeira/README.md:70). **Evidência:** leitura; schema real não inspecionado.

O diff atual passa a inserir `events.end_date`, mas não há migração dessa coluna no repositório. Se ela não existir no banco de destino, criar eventos falha. Também faltam definições de tabelas essenciais, como users, people, payments, events e plannings. `initDB()` e sincronização iniciam sem espera, e o servidor aceita requisições mesmo se a inicialização falhar.

**Correção:** incluir migrations versionadas para schema inicial e `end_date`; executar e aguardar migrations antes de aceitar tráfego, interrompendo startup em falhas essenciais. Documentar Supabase, e-mail e demais variáveis obrigatórias. O README indica Node 14, mas [Express 5 exige Node 18 ou superior](https://expressjs.com/en/api/). **Validação:** banco vazio inicia e cria evento com data final; atualização de banco antigo aplica a coluna antes do novo código.

### 18. Fila de WhatsApp não envia, mas agendamentos podem constar como enviados

**Local:** [server.js:2679](D:/Aplicações/gestao-financeira/server.js:2679), [server.js:2944](D:/Aplicações/gestao-financeira/server.js:2944), [server.js:3622](D:/Aplicações/gestao-financeira/server.js:3622). **Evidência:** leitura.

`processWhatsAppQueue()` retorna imediatamente, por desativação temporária. Envio em lote e cobranças continuam enfileirando, e o agendamento passa para `sent` após enfileirar, sem confirmar entrega. O chat tem chamadas diretas separadas; esse achado não implica que todo envio do chat esteja desligado.

**Correção:** representar a desativação na configuração e UI; diferenciar agendado, enfileirado, enviado e falhou. Reativar worker somente com claim atômico, tratamento de retries e recuperação de itens interrompidos. **Validação:** nenhum agendamento aparece como entregue quando o worker está desativado; sucesso depende do retorno real do provedor.

### 19. “Selecionar todos” após busca envia para todos os membros

**Local:** [public/js/core.js:122](D:/Aplicações/gestao-financeira/public/js/core.js:122), [public/js/core.js:139](D:/Aplicações/gestao-financeira/public/js/core.js:139), [server.js:2623](D:/Aplicações/gestao-financeira/server.js:2623). **Evidência:** reproduzido.

O checkbox seleciona apenas itens visíveis quando existe filtro, mas o submit converte o checkbox marcado em `userIds = null`. O servidor interpreta isso como transmissão global. Uma mensagem destinada a um grupo filtrado pode atingir todo o clube.

**Correção:** sempre enviar IDs efetivamente selecionados; transmissão global deve ser uma ação distinta com contagem de destinatários. **Validação:** buscar uma unidade e selecionar todos envia apenas os IDs daquela seleção.

### 20. Conexão PostgreSQL desativa validação do certificado TLS

**Local:** [database.js:9](D:/Aplicações/gestao-financeira/database.js:9). **Evidência:** leitura.

`rejectUnauthorized: false` desativa a validação do certificado do servidor, enfraquecendo a verificação da identidade da conexão com o banco.

**Correção:** configurar CA do provedor e verificar o certificado; separar configuração local da conexão de produção. **Validação:** certificado inválido é recusado e conexão válida continua funcionando.

### 21. Upload aceita arquivos ativos e os serve na origem da aplicação

**Local:** [server.js:316](D:/Aplicações/gestao-financeira/server.js:316), [server.js:27](D:/Aplicações/gestao-financeira/server.js:27), [server.js:2494](D:/Aplicações/gestao-financeira/server.js:2494). **Evidência:** leitura.

Multer limita tamanho, mas não os tipos. Arquivos não reconhecidos como imagem permanecem intactos, e falha de conversão de imagem preserva o original. O endpoint devolve o MIME sem forçar download; um HTML enviado como comprovante pode ser aberto na mesma origem da aplicação. Isso amplia o problema de execução de conteúdo ativo.

**Correção:** aceitar apenas formatos necessários, verificar assinatura/conteúdo e rejeitar falha de decodificação. Servir conteúdo não confiável em origem separada ou como anexo, com `nosniff`. **Validação:** HTML/SVG ativo e MIME falsificado são rejeitados; imagem e PDF permitidos mantêm o fluxo esperado.

## Falhas de prioridade média

### 22. Notificação global não aparece no sino; leitura é compartilhada

**Local:** [server.js:1054](D:/Aplicações/gestao-financeira/server.js:1054), [server.js:2602](D:/Aplicações/gestao-financeira/server.js:2602), [server.js:2628](D:/Aplicações/gestao-financeira/server.js:2628), [public/js/core.js:1024](D:/Aplicações/gestao-financeira/public/js/core.js:1024). **Evidência:** leitura.

Broadcast insere `user_id = NULL`, mas o front busca `/api/notifications`, que filtra somente o usuário atual. Além disso, a rota de leitura de uma notificação global modifica uma única linha compartilhada: um leitor marca como lida para todos na consulta de não lidas.

**Correção:** criar registro por destinatário ou tabela de leitura por usuário; unificar API e tela. **Validação:** todos recebem o aviso e cada conta tem leitura independente.

### 23. Permissões do secretário divergem entre tela e servidor

**Local:** [public/js/core.js:483](D:/Aplicações/gestao-financeira/public/js/core.js:483), [public/js/core.js:554](D:/Aplicações/gestao-financeira/public/js/core.js:554), [public/js/financial.js:80](D:/Aplicações/gestao-financeira/public/js/financial.js:80), [public/js/ui.js:330](D:/Aplicações/gestao-financeira/public/js/ui.js:330), [server.js:1516](D:/Aplicações/gestao-financeira/server.js:1516). **Evidência:** leitura e comparação de string reproduzida.

A API permite ao secretário cadastrar pessoas, vendas e despesas, enquanto navegação esconde/bloqueia essas páginas. O modal de mensalidade mostra ações administrativas ao secretário, mas aprovar/excluir exige admin na API. Mensagens aparecem para secretário, mas envio exige admin. Há ainda comparação literal com `secretÃ¡rio` em `ui.js`, que não corresponde a `secretário` do servidor.

**Correção:** decidir e documentar a matriz de permissões e aplicá-la em ambos os lados; usar identificadores estáveis, sem acento, e corrigir a codificação UTF-8. **Validação:** cada papel vê somente ações que a API realmente autoriza.

### 24. Anexos do chat excedem o limite JSON antes de chegar à rota

**Local:** [server.js:84](D:/Aplicações/gestao-financeira/server.js:84), [server.js:3194](D:/Aplicações/gestao-financeira/server.js:3194), [public/js/chat.js:518](D:/Aplicações/gestao-financeira/public/js/chat.js:518). **Evidência:** leitura do código e do body-parser instalado.

O chat converte arquivo para base64 e envia JSON. `express.json()` usa o limite padrão de 100 KB na dependência instalada, e base64 aumenta o tamanho. Muitos anexos comuns são rejeitados com 413 antes da rota de mídia. O limite de 10 MB do Multer não se aplica a esse JSON.

**Correção:** preferir multipart com limite explícito no endpoint de mídia, validação de tamanho no front e resposta JSON para excesso. **Validação:** anexo permitido é enviado; anexo excedente recebe mensagem clara.

### 25. Tela de relatórios contém nove IDs duplicados

**Local:** [public/reports.html:272](D:/Aplicações/gestao-financeira/public/reports.html:272) e [public/reports.html:899](D:/Aplicações/gestao-financeira/public/reports.html:899). **Evidência:** reproduzido por varredura.

Seletores e botão de gerar aparecem tanto na página quanto no modal com os mesmos IDs. `getElementById` resolve apenas um elemento, então alterações e leitura do modal podem atingir o formulário da página. Duplicados incluem tipo, membro, evento, filtro, participante e botão.

**Correção:** manter um único formulário reutilizado ou atribuir IDs distintos e consultar dentro do container correto. **Validação:** alterar o seletor do modal gera o relatório correspondente ao que o usuário escolheu nele.

### 26. Fallback dos comprovantes de vendas e familiares é incompleto

**Local:** [server.js:2507](D:/Aplicações/gestao-financeira/server.js:2507), [server.js:2530](D:/Aplicações/gestao-financeira/server.js:2530), [public/js/sales.js:29](D:/Aplicações/gestao-financeira/public/js/sales.js:29). **Evidência:** leitura.

Vendas gravam o binário no banco quando o upload na nuvem falha, mas a rota de download não consulta `sales`. O comprovante salvo fica indisponível nesse fallback. A autorização do fallback de mensalidades/eventos também não contempla responsável visualizando filho nem secretário de outros membros, embora outras APIs permitam essas visualizações.

**Correção:** centralizar resolução do comprovante para todas as fontes e reutilizar a mesma política de autorização no download da nuvem e do banco. **Validação:** com Supabase indisponível, comprovantes de venda e familiares autorizados continuam acessíveis.

### 27. Auditoria perde registros rapidamente e possui lacunas

**Local:** [server.js:333](D:/Aplicações/gestao-financeira/server.js:333), [server.js:365](D:/Aplicações/gestao-financeira/server.js:365), [server.js:1552](D:/Aplicações/gestao-financeira/server.js:1552), [server.js:1588](D:/Aplicações/gestao-financeira/server.js:1588), [routes/plannings.js:38](D:/Aplicações/gestao-financeira/routes/plannings.js:38). **Evidência:** leitura.

Logs são excluídos após um dia. Rejeição/exclusão de mensalidade e operações de planejamento não registram auditoria nesses handlers. O IP é extraído diretamente de `x-forwarded-for`, sem estabelecer confiança no proxy. Isso dificulta reconstruir uma alteração financeira e pode registrar IP forjado.

**Correção:** definir retenção adequada ao uso do sistema, auditar operações financeiras e permissões com antes/depois, configurar proxies confiáveis e usar a origem validada. **Validação:** cada alteração relevante gera registro pesquisável pelo período de retenção escolhido. Isto é avaliação técnica, não conclusão de conformidade legal.

### 28. Relatórios pedem data que a API não fornece

**Local:** [public/js/reports.js:134](D:/Aplicações/gestao-financeira/public/js/reports.js:134), [public/js/reports.js:185](D:/Aplicações/gestao-financeira/public/js/reports.js:185), [server.js:1339](D:/Aplicações/gestao-financeira/server.js:1339), [server.js:1962](D:/Aplicações/gestao-financeira/server.js:1962). **Evidência:** leitura.

Relatórios usam `updated_at`, mas as consultas de pagamentos não retornam esse campo. A coluna de data tende a ficar vazia. Criado, enviado, aprovado e pago também representam momentos diferentes e não devem ser confundidos.

**Correção:** definir a data exibida, persistir o evento correspondente e incluí-lo no contrato da API. **Validação:** lançamento aprovado mostra a data definida pelo negócio e não um traço por ausência de campo.

### 29. PWA promete fallback de API que não alimenta e cacheia URLs diferentes

**Local:** [public/sw.js:1](D:/Aplicações/gestao-financeira/public/sw.js:1), [public/sw.js:68](D:/Aplicações/gestao-financeira/public/sw.js:68), [public/login.html:910](D:/Aplicações/gestao-financeira/public/login.html:910). **Evidência:** leitura.

O fallback de `/api/` consulta cache, mas as respostas da API nunca são gravadas. Os assets pré-carregados usam caminhos sem query, enquanto as páginas solicitam scripts com `?v=mpa`; essas são chaves diferentes. `cache.addAll` depende ainda de terceiros e falha como conjunto quando um asset não pode ser carregado. Páginas/módulos de planejamentos, especialidades e uniformes não estão no precache.

**Correção:** definir o alcance offline real; usar manifest coerente de arquivos/versionamento e separar assets externos opcionais. Para dados privados, projetar cache por usuário e limpeza na saída antes de implementá-lo. **Validação:** instalação com terceiro indisponível e abertura offline de páginas previamente suportadas têm comportamento previsível; mutações offline informam indisponibilidade.

### 30. Verificação de e-mail não garante unicidade até o momento da confirmação

**Local:** [routes/emailVerification.js:12](D:/Aplicações/gestao-financeira/routes/emailVerification.js:12), [routes/emailVerification.js:22](D:/Aplicações/gestao-financeira/routes/emailVerification.js:22), [routes/emailVerification.js:58](D:/Aplicações/gestao-financeira/routes/emailVerification.js:58), [server.js:674](D:/Aplicações/gestao-financeira/server.js:674). **Evidência:** leitura; restrições externas não inspecionadas.

Existência do e-mail é checada ao solicitar código, mas não ao confirmar. Duas contas podem iniciar a verificação do mesmo endereço e confirmar depois; o código local não cria unicidade de e-mail. Os códigos usam `Math.random`, e a normalização do endereço não é consistente. Recuperação de senha seleciona apenas a primeira conta encontrada.

**Correção:** normalizar endereço, gerar código com `crypto`, aplicar limite de tentativas e restrição única no banco; fazer confirmação atômica e tratar conflito. **Validação:** duas confirmações concorrentes para o mesmo e-mail não vinculam o endereço a duas contas.

### 31. Atualização e sincronização de pessoas podem deixar dados parciais

**Local:** [server.js:449](D:/Aplicações/gestao-financeira/server.js:449), [server.js:1630](D:/Aplicações/gestao-financeira/server.js:1630), [server.js:1634](D:/Aplicações/gestao-financeira/server.js:1634). **Evidência:** leitura; duplicação efetiva depende de constraints do banco.

A pessoa é alterada antes das credenciais, sem transação. Se username conflitar, a resposta pode ser erro apesar de o cadastro já ter mudado. `syncMemberUsers()` inicia sem ser aguardado em vários fluxos e usa consulta seguida de inserção; chamadas concorrentes podem disputar a criação de pessoa/conta do responsável. A chave de vínculo por nome agrava o problema descrito no achado 03.

**Correção:** transação para cadastro e credenciais; relação por ID; restrições únicas apropriadas e sincronização idempotente com controle de concorrência. **Validação:** conflito de credenciais não modifica parcialmente a pessoa; duas sincronizações não criam responsáveis duplicados.

### 32. Agendamento e bloqueio de horário usam regras inconsistentes

**Local:** [server.js:398](D:/Aplicações/gestao-financeira/server.js:398), [server.js:3518](D:/Aplicações/gestao-financeira/server.js:3518), [server.js:3558](D:/Aplicações/gestao-financeira/server.js:3558), [public/js/ui.js:214](D:/Aplicações/gestao-financeira/public/js/ui.js:214). **Evidência:** leitura.

Cron não define timezone; usa horário do processo, enquanto parte do cálculo usa `CURRENT_DATE` do banco. A espera para sábado é um timer em memória, perdido em reinício. O claim de lembretes é feito depois da leitura, sem condição atômica; múltiplas instâncias podem enfileirar o mesmo agendamento. O bloqueio aceita fuso informado pelo cliente, mas uploads feitos com `fetch` manual omitem esse header, usando São Paulo no servidor.

**Correção:** estabelecer fuso/regra oficial, configurar cron explicitamente e persistir a execução futura; usar claim atômico e chave de idempotência. Uniformizar envio do fuso se a regra realmente for por usuário, usando configuração validada no servidor. **Validação:** reinício e duas instâncias não perdem nem duplicam lembrete; front e back concordam no limite de horário.

## Ordem sugerida de correção

1. Fechar a rota pública de comprovantes, aplicar autorização antes do download e proteger planejamentos. Corrigir vínculo familiar por IDs e pontos de execução de HTML (01–04).
2. Remover credenciais compartilhadas/embutidas, corrigir recuperação e revogação de sessões, limitar tentativas e restringir upload (05–08, 21).
3. Corrigir perfil, pagamentos aprovados, validação monetária e transações; adicionar migrations e contrato de datas; reconciliar saldo por período (09–17).
4. Corrigir fila, destinatários e leitura individual de avisos; alinhar permissões, relatórios e comprovantes no fallback (18–19, 22–28).
5. Consolidar PWA, unicidade de e-mail, sincronização e agendamento; fortalecer TLS e retenção de auditoria conforme ambiente (20, 27, 29–32).

Para dividir o trabalho entre os agentes: back-end deve assumir autorização, vínculo familiar, migrations, sessão, transações e validações; front-end deve assumir DOM seguro, formulários, IDs, feedback e alinhamento com o contrato da API. Datas, permissões, estados financeiros e notificações precisam de contrato combinado entre os dois. A troca de contrato deve entrar junto dos dois lados para evitar regressões.

## Verificações recomendadas após as correções

Cobrir visitante, membro, responsável, secretário, administrador e administrador principal. Testar dois anos financeiros, responsável homônimo, Supabase indisponível, token anterior a redefinição, erro no último item de um lote e duas requisições concorrentes. Usar banco de teste separado para migrations e concorrência e navegador para DOM, PWA e fluxos dos papéis.

O projeto hoje não tem suíte funcional configurada: `npm test` executa um comando que falha propositalmente. Criar verificações de regressão para os casos acima e executá-las no CI, priorizando autorização e integridade monetária. A revisão não alterou arquivos funcionais do sistema; apenas adicionou este relatório e os artefatos de verificação em `audit/`.
