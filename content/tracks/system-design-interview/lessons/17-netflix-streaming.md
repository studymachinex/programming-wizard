> **Em uma frase:** streaming de vídeo é CDN, encoding e catálogo — o player só precisa de um manifest e de segmentos próximos.

Netflix escala porque separa o caminho do vídeo (CDN) do controle (nuvem). O design de entrevista deve focar em ingestão, transcodificação, armazenamento, distribuição e reprodução adaptativa.

## Requisitos

- 200M assinantes, 100M simultâneos.
- Início < 2 s; buffering mínimo.
- Catálogo com milhões de títulos.
- Múltiplas resoluções e codecs.
- Tolerância a falha de região/CDN.

## Capacity estimation

100M × 5 Mbps = 500 Tbps no pico — inviável centralizar. CDN com milhares de PoPs. Armazenamento: 1 filme em 10 bitrates ≈ 50 GB; 100k títulos ≈ 5 PB. Encoding é CPU-intensivo; use spot/preemptible.

## API

```text
GET /catalogo?cursor=...
GET /titulos/{id}/manifest.mpd
GET /segmentos/{titulo}/{perfil}/{seq}
POST /progresso
```

## Arquitetura

```text
Estúdio --> ingestão --> S3 --> encoding (fila) --> segmentos + manifests
                                                   --> CDN (Open Connect)
Cliente --> API catálogo --> recomendações
        --> manifest --> CDN segmentos --> player (ABR)
        --> telemetria --> analytics
```

## Decisões e trade-offs

- **CDN própria:** reduz custo de egress e controla QoS; exige presença e operação.
- **ABR:** player escolhe bitrate por banda e buffer; manifest com múltiplos perfis.
- **Encoding:** pipeline paralelo por chunk; valide qualidade e tamanho.
- **Catálogo:** BD relacional/sharded + cache; recomendações eventualmente consistentes.
- **DRM:** licenças por dispositivo; não bloqueia o caminho crítico.
- **Falha:** múltiplas CDNs e regiões; DNS/steering.

## Gargalos

Egress, picos de lançamento, encoding e licensing. Mitigações: pré-posicionar conteúdo, cache, capacity reservada e throttling.

## Checklist de resposta

- [ ] Requisitos e números.
- [ ] Pipeline de encoding.
- [ ] CDN e manifest.
- [ ] Catálogo e recomendações.
- [ ] Falha e custo.

## Para ir além

Leia o artigo do Netflix Open Connect e o design de YouTube do System Design Primer. Depois estime o custo de egress de um lançamento global.
