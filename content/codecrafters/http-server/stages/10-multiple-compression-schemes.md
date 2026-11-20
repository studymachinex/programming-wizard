`Accept-Encoding` pode listar vários schemes, com pesos (`q`) e schemes desconhecidos. O servidor deve escolher gzip somente quando ele for aceitável.

Casos que o tester cobre:

| Accept-Encoding | Deve comprimir? |
|---|---|
| `br` | não |
| `br, gzip` | sim |
| `gzip;q=0` | não |

## O que você vai aprender

- parsing de listas separadas por vírgula;
- parâmetros de qualidade (`q=0` a `q=1`);
- fallback quando nenhum scheme é suportado.

## O que fazer

1. Separe o valor de `Accept-Encoding` por vírgulas.
2. Para cada item, separe o scheme dos parâmetros com `;`.
3. Leia `q` (default `1`).
4. Considere gzip aceitável se:
   - o scheme for `gzip` ou `x-gzip`, e `q > 0`; ou
   - o scheme for `*` com `q > 0` (fallback).
5. Se gzip for aceitável, adicione `Content-Encoding: gzip`.
6. Ignore schemes desconhecidos (`br`, `deflate` etc.) neste desafio.

```java
boolean acceptsGzip(String header) {
  if (header == null) return false;
  for (String part : header.split(",")) {
    String[] pieces = part.trim().split(";");
    String scheme = pieces[0].trim().toLowerCase(Locale.ROOT);
    double q = 1.0;
    for (int i = 1; i < pieces.length; i++) {
      String p = pieces[i].trim();
      if (p.startsWith("q=")) q = Double.parseDouble(p.substring(2));
    }
    if (q > 0 && (scheme.equals("gzip") || scheme.equals("x-gzip") || scheme.equals("*"))) {
      return true;
    }
  }
  return false;
}
```

## Como o tester valida

- `br` → **sem** `Content-Encoding`;
- `br, gzip` → **com** `Content-Encoding: gzip`;
- `gzip;q=0` → **sem** `Content-Encoding`.

## Dicas

- `q=0` significa "não aceito", não "baixa prioridade".
- O header pode ter espaços extras. Use `trim()`.
- Não basta `contains("gzip")`: `gzip;q=0` contém gzip, mas não deve ser usado.

## Critério de conclusão

O servidor negocia gzip corretamente nos três cenários.
