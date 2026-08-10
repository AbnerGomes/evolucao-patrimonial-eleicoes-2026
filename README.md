# Eleições 2026 — Patrimônio dos Candidatos

Site estático que lista todos os candidatos registrados no TSE para as
**Eleições Gerais 2026** (Presidente, Governador, Senador, Deputado Federal,
Deputado Estadual/Distrital, e respectivos vices/suplentes), com o diferencial
de comparar o **patrimônio declarado em 2026 com o de 2022**.

- Se o candidato concorreu em 2022, mostra o patrimônio somado daquele ano e a
  variação (R$ e %).
- Se o candidato **não concorreu em 2022** (primeira candidatura, ou concorreu
  em outro ano que não 2022), o patrimônio de 2022 é exibido como **R$ 0,00**,
  com a etiqueta "1ª candidatura", como pedido.

Fonte dos dados: [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/)
(arquivos `consulta_cand` e `bem_candidato`). Nenhuma chave de API é necessária
— são arquivos CSV públicos.

## ⚠️ Sobre os dados estarem parciais

Hoje (10/08/2026) o prazo para partidos registrarem candidaturas no TSE **vai
até 15/08/2026, às 19h**. Isso significa que o arquivo `consulta_cand_2026`
ainda está sendo atualizado diariamente pelo TSE — a lista de candidatos
cresce a cada dia até o prazo final (e pode sofrer pequenos ajustes depois,
por indeferimentos/recursos). O site já deixa isso avisado num banner no topo
e mostra a data de geração dos dados no rodapé. **Recomenda-se rodar o
pipeline de novo (veja abaixo) próximo ou depois de 15/08/2026** para ter a
lista completa.

## Estrutura do projeto

```
eleicoes-2026/
├── scripts/
│   └── build_data.py      # baixa os CSVs do TSE e gera public/data.json
├── data_cache/             # cache local dos .zip baixados do TSE (não versionado)
├── public/                 # o site estático em si — é isso que vai pro Render
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data.json           # gerado pelo build_data.py
└── README.md
```

## Como os dados são cruzados

1. Baixa `consulta_cand_2026` (lista de candidatos 2026, todo o Brasil) e
   `bem_candidato_2026` (bens declarados 2026), soma os bens por candidato.
2. Baixa `consulta_cand_2022` e `bem_candidato_2022` da mesma forma.
3. Como o identificador de candidato (`SQ_CANDIDATO`) muda a cada eleição, o
   cruzamento entre os dois anos é feito pelo **CPF do candidato**
   (`NR_CPF_CANDIDATO`), que é o mesmo em qualquer ano. O CPF é usado só
   internamente no cruzamento — **não é publicado no site** (o `data.json`
   final não contém CPF de ninguém).
4. Para cada candidato de 2026, verifica se o CPF aparece em
   `consulta_cand_2022`. Se não aparecer, é "1ª candidatura" e o patrimônio
   2022 fica em 0, conforme pedido.

## Rodando localmente

Pré-requisito: Python 3 (nenhuma dependência externa — só biblioteca padrão).

```bash
# 1) Gerar/atualizar public/data.json a partir dos dados do TSE
python3 scripts/build_data.py            # usa cache local em data_cache/ se já existir
python3 scripts/build_data.py --refresh  # força baixar tudo de novo do TSE

# 2) Servir o site estático
cd public
python3 -m http.server 8765
```

Acesse **http://localhost:8765** no navegador.

## Publicando no Render como Static Site

1. Suba este repositório (ou pelo menos as pastas `public/` e `scripts/`) num
   repositório Git (GitHub/GitLab).
2. No Render, crie um **Static Site** apontando pro repositório.
3. Configuração recomendada:
   - **Build Command:** `python3 scripts/build_data.py --refresh`
     (isso faz o Render buscar os dados mais recentes do TSE a cada deploy —
     ótimo para manter a lista atualizada conforme o TSE libera novos
     registros até 15/08 e depois disso).
   - **Publish directory:** `public`
4. Cada novo deploy manual (ou push) vai regerar o `data.json` com os dados
   mais recentes do TSE.

Se preferir não depender de acesso à internet no build do Render, é só **não**
definir o Build Command — o `public/data.json` já commitado no repositório
será servido do jeito que estiver (gerado localmente antes do push).

## Limitações e observações sobre os dados

- **Autodeclarado:** o patrimônio vem da autodeclaração de bens do candidato
  na Justiça Eleitoral — não é auditado pelo TSE nem por este site. De vez em
  quando aparecem valores absurdos na base (ex.: um candidato declarando
  bilhões em um único bem) que são provavelmente erro de digitação do próprio
  candidato/partido no preenchimento — isso é fiel ao dado público do TSE, o
  site não faz nenhum filtro ou "correção" desses valores.
- **Uma linha por candidato, todos os cargos do pleito geral:** Presidente,
  Vice-Presidente, Governador, Vice-Governador, Senador, 1º e 2º Suplente,
  Deputado Federal, Deputado Estadual e Deputado Distrital (DF). Eleições
  municipais (prefeito/vereador) não fazem parte do pleito de 2026.
- **"Concorreu em 2022"** é calculado por CPF batendo em `consulta_cand_2022`
  — não significa necessariamente que o candidato disputou o *mesmo* cargo,
  só que teve alguma candidatura registrada naquele ano.

## Re-executando o pipeline

O script é idempotente e usa cache (`data_cache/*.zip`) para não baixar de novo
sem necessidade. Use `--refresh` para forçar novo download quando quiser dados
mais recentes do TSE (o portal atualiza esses arquivos diariamente).
