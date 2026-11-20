> **Em uma frase:** na AWS, identidade e rede são o perímetro de segurança — antes de escolher serviço, saiba quem pode chamar o quê e de onde.

IAM responde "quem pode fazer o quê". VPC responde "de onde e para onde o tráfego pode ir". A maioria dos incidentes de segurança em cloud nasce de uma dessas duas respostas frouxa: role com `*:*` ou subnet pública com banco acessível.

## O problema

Um serviço em ECS precisa ler um bucket S3. A solução rápida é criar um usuário com chave de acesso e colocar no código. Funciona até a chave vazar no repositório. Outro serviço precisa chamar uma API interna; colocam o banco na subnet pública "para funcionar". O castelo está aberto.

## Como funciona

**IAM:** usuário é identidade de longo prazo; role é identidade assumida temporariamente. Prefira roles e credentials temporárias. A policy tem `Effect`, `Action`, `Resource` e `Condition`. Least privilege começa negando e abrindo o necessário.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::meu-bucket/pedidos/*"
  }]
}
```

**VPC:** subnets públicas têm rota para Internet Gateway; privadas saem via NAT Gateway. Security groups são stateful e permitem regras por origem; NACLs são stateless. O banco fica em subnet privada, acessível apenas pelo security group da aplicação.

```hcl
resource "aws_security_group" "app" {
  name   = "pedidos-app"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

## Na prática

Use o IAM Access Analyzer para encontrar recursos compartilhados externamente e o `GeneratePolicy` a partir de CloudTrail. Ative MFA para humanos. Nunca coloque access key em código; use `DefaultCredentialsProvider` no Java, que busca role, profile ou variável temporária.

Em Kubernetes/EKS, IRSA (IAM Roles for Service Accounts) dá credenciais por pod, sem nó com permissão ampla. Em ECS, task role. Em Lambda, execution role.

## Armadilhas comuns

- `Action: "*"` e `Resource: "*"` "para depois ajustar".
- Banco em subnet pública com security group `0.0.0.0/0`.
- NAT Gateway único para alta disponibilidade.
- Credenciais de longo prazo em CI.
- Confundir security group (stateful) com NACL (stateless).

## Checklist de domínio

- [ ] Explico user vs role vs policy.
- [ ] Sei desenhar subnets públicas/privadas e rotas.
- [ ] Aplico least privilege com condição de recurso.
- [ ] Uso credenciais temporárias no Java.
- [ ] Sei isolar acesso a banco por security group.

## Para ir além

Leia as best practices de IAM e o guia de VPC da AWS. Depois audite um projeto seu com Access Analyzer e remova uma permissão ampla.
