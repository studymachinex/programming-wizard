> **Em uma frase:** segurança em Kafka é ACL, TLS e isolamento de tenants; upgrade é compatibilidade de protocolo e rolling restart sem perder ordem.

Um cluster Kafka compartilhado por vários times precisa de autenticação, autorização e quotas. Um upgrade mal feito derruba consumidores ou corrompe o formato de mensagem. Operar Kafka é tanto segurança quanto mudança.

## O problema

Um time consegue ler o tópico de pagamentos de outro. Um produtor sem quota satura o cluster. Um upgrade de broker muda o comportamento de compressão e um consumidor antigo falha. Multi-tenancy sem isolamento é um incidente esperando acontecer.

## Como funciona

**Autenticação:** SASL/SCRAM, mTLS ou IAM (MSK). **Autorização:** ACLs por principal, tópico e operação (`READ`, `WRITE`, `CREATE`). **Quotas:** `producer_byte_rate`, `consumer_byte_rate`.

```bash
kafka-acls.sh --bootstrap-server localhost:9092 \
  --add --allow-principal User:pedidos-app \
  --operation Write --topic pedidos
```

**Multi-tenancy:** namespaces por prefixo, ACLs por time, quotas separadas e, se necessário, clusters distintos para dados críticos. Não confie apenas em convenção de nome.

**Upgrade:** compatibilidade de protocolo entre versões; atualize clientes antes ou depois conforme a matriz. Faça rolling restart com um broker por vez e verifique under-replicated partitions. Atualize o `inter.broker.protocol.version` depois de todos os brokers.

## Na prática

Use Schema Registry com compatibilidade `BACKWARD` ou `FULL` e valide no CI. Mensagens antigas precisam continuar legíveis. Para tópicos críticos, retention e replication factor 3 com `min.insync.replicas=2`.

Segredos em vault, nunca em `server.properties` versionado. Rotacione credenciais. Audite ACLs periodicamente.

Upgrade de clientes: mantenha versão mínima suportada; teste em staging com o mesmo volume e schema. Monitore `kafka.server:type=ReplicaManager,Name=UnderReplicatedPartitions`.

## Armadilhas comuns

- ACL `*` para "resolver rápido".
- Sem quota e um produtor monopolizando a rede.
- Tópicos de tenants no mesmo prefixo sem ACL.
- Upgrade de broker sem checar clientes antigos.
- `min.insync.replicas=1` com `acks=all`.

## Checklist de domínio

- [ ] Configuro autenticação e ACL por principal.
- [ ] Aplico quotas por cliente/time.
- [ ] Isolo tenants por ACL e, se preciso, cluster.
- [ ] Planejo upgrade com rolling restart.
- [ ] Versiono schemas com compatibilidade.

## Para ir além

Leia a documentação de security e upgrade do Kafka. Depois configure um cluster local com SCRAM e prove que um principal sem ACL não lê o tópico.
