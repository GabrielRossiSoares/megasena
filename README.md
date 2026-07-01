# 🎰 Mega-Sena Dashboard

Dashboard completo com estatísticas, probabilidades e sugestão de jogo — atualização automática em tempo real.

Funciona de **dois modos**:

- **Ao vivo (local):** `node server.js` no seu PC — SSE em tempo real + polling a cada 5 min.
- **Estático (GitHub Pages):** site publicado no seu GitHub, sempre no ar. Um **robô (GitHub Actions)** busca os concursos novos sozinho e republica — sem precisar do seu PC ligado.

## ☁️ Publicar no GitHub Pages (acessar de qualquer lugar)

1. Crie um repositório no GitHub e envie este projeto (veja abaixo).
2. No GitHub, vá em **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**.
3. Vá na aba **Actions**, abra o workflow *"Atualizar dados e publicar site"* e clique em **Run workflow** (a primeira publicação).
4. Pronto: o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

O robô roda automaticamente depois de cada sorteio (Ter/Qui/Sáb) e uma vez por dia, atualizando os dados e as estatísticas. As suas *Minhas Apostas* e *Meus Jogos* ficam salvos no seu navegador (localStorage).

### Enviar para o GitHub pela primeira vez

```bash
git init
git add .
git commit -m "Mega-Sena dashboard"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPO.git
git push -u origin main
```

## 🚀 Como rodar

### Pré-requisitos
- [Node.js](https://nodejs.org/) v16 ou superior

### Instalação

```bash
# 1. Entre na pasta do projeto
cd megasena-dashboard

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
node server.js
```

### Acesso

Abra no navegador: **http://localhost:3000**

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| 📡 **Auto-atualização** | Verifica novos resultados a cada 5 minutos via SSE |
| 🔔 **Notificações** | Alerta no browser quando sair novo resultado |
| 🎯 **Jogo sugerido** | Gerado com base em frequência + atraso + distribuição |
| 🔥 **Mapa de calor** | Visualização dos 60 números por frequência |
| 📊 **Gráficos** | Frequência, soma por sorteio, par/ímpar |
| 📋 **Histórico** | Últimos 50 resultados com scroll |
| 📐 **Padrões** | Soma ideal, pares×ímpares, baixos×altos |

---

## 🧠 Como o jogo é sugerido

A sugestão é calculada com um score composto:

```
score(n) = 50% × frequência_relativa + 50% × tempo_sem_aparecer
```

Depois aplica filtros:
- ✅ No máximo 2 números por faixa de dezena (01–10, 11–20...)
- ✅ Equilíbrio par/ímpar (máximo 4 de um tipo)
- ✅ Soma resultante próxima do intervalo histórico ideal (150–210)

---

## 📡 Endpoints da API

| Rota | Descrição |
|---|---|
| `GET /api/data` | Todos os resultados + estatísticas |
| `GET /api/stats` | Apenas estatísticas calculadas |
| `GET /api/stream` | SSE — stream de eventos em tempo real |

---

## 🛠️ Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor local (modo ao vivo) |
| `npm run fetch` | Baixa todo o histórico para `data.json` |
| `npm run enrich` | Rebaixa tudo p/ preencher jackpot, cidades e premiações |
| `npm run update` | Busca apenas os concursos novos (usado pelo robô) |
| `npm run build` | Gera `public/data.json` e `public/stats.json` (site estático) |

Arquitetura dos dados: `caixa.js` (normalização + gravação atômica) e `stats.js` (cálculo das estatísticas) são compartilhados por `server.js`, `build.js` e `update.js` — uma única fonte da verdade.

## ⚠️ Aviso

A Mega-Sena é **100% aleatória**. A análise estatística mostra padrões históricos, mas não prevê resultados futuros. Jogue com responsabilidade.

---

## 🔧 Personalização

Para alterar o intervalo de polling, edite em `server.js`:

```js
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutos (em ms)
```
