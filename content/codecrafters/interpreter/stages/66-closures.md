Uma função interna devolvida continua enxergando as variáveis da função que a criou — mesmo
depois que ela retornou. Isso é uma **closure**.

```lox
fun contador() {
  var n = 0;
  fun inc() {
    n = n + 1;
    return n;
  }
  return inc;
}
var c = contador();
c();
print c();
```

Saída:

```
2
```

## O que você vai aprender

- closures: função + ambiente capturado.

## O que fazer

Guarde no `Function` o ambiente **da declaração** (não o global) e use-o como pai do ambiente
de cada chamada.

## Como o tester valida

- um contador (cada instância com o próprio estado) e um somador parcial.

## Critério de conclusão

Closures funcionam.
