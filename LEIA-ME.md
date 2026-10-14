# Futsal Lab

App da equipa, numa só PWA que funciona sem rede: plantel e época, caderno com prancheta animada, treinos com modo campo, jogos com convocatória e notas, **Ao vivo** para o banco (o antigo Control-Stats) e **Vídeo** para a análise (o antigo Marcador de Futsal). Sincroniza entre telemóvel, iPad e PC pelo **OneDrive**, sem servidor.

## Estrutura

```
index.html              app (Hoje, Época, Plantel, Caderno, Mais)
marcador.html           marcador de vídeo; com ?jogo=<id> fica ligado a um jogo da app
js/marcador/main.js     lógica do marcador (css/marcador.css para o estilo)
js/taxonomia.js         eventos, teclas e descrições rápidas do marcador (editáveis em Mais)
js/epoca-excel.js       Excel da época
js/marcador/acerto.js   acerto entre o Ao vivo e o Vídeo
tools/clips.py          clips no PC a partir dos dados da app
js/db.js                IndexedDB: cada registo com id, updatedAt e lápide ao apagar
js/sync.js              sincronização (fornecedores: OneDrive ou servidor próprio)
js/sync/onedrive.js     login Microsoft (OAuth PKCE) + ficheiros no OneDrive
js/live/engine.js       motor do jogo ao vivo (sem DOM, testado)
js/live/excel.js        Excel do jogo ao vivo no formato do Control-Stats
js/importar-excel.js    importa o Excel de equipa do Control-Stats (plantel + Situações)
js/views/               ecrãs
server/sync_server.py   servidor próprio opcional (para quando houver máquina sempre ligada)
tests/                  testes (tests/run.sh para a lógica; tests/e2e.py no browser)
```

## Publicar no GitHub Pages

1. Cria um repositório novo (por exemplo `Futsal-Lab`) e envia o conteúdo desta pasta, mantendo as subpastas.
2. Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
3. Abre `https://devclaudiosousa.github.io/Futsal-Lab/` e instala:
   - **Android (Chrome):** menu ⋮ → Instalar aplicação.
   - **iPad (Safari):** Partilhar → Adicionar ao ecrã principal. **Usa sempre a app instalada**: o Safari apaga os dados de sites abertos no browser que não uses durante 7 dias.
   - **PC (Chrome/Edge):** ícone de instalar na barra de endereço.

A pasta `server/` e `tests/` não fazem mal no Pages, mas podem ficar de fora.

## Ligar o OneDrive (uma vez, no PC)

A app precisa de um "ID da aplicação" registado no Microsoft Entra. É grátis, mas com conta Microsoft pessoal a Microsoft exige primeiro uma **conta Azure gratuita** (pede cartão só para verificação; o registo de aplicações não tem custo).

1. Cria a conta Azure gratuita com a mesma conta Microsoft do teu OneDrive (azure.microsoft.com → conta gratuita).
2. Entra em **entra.microsoft.com** → Identidade → Aplicações → **Registos de aplicações** → **Novo registo**.
3. Nome: `Futsal Lab`. Tipos de conta: **Apenas contas Microsoft pessoais**.
4. URI de redirecionamento: plataforma **Aplicação de página única (SPA)**, endereço exatamente igual ao que a app mostra em *Mais → Sincronização* (por exemplo `https://devclaudiosousa.github.io/Futsal-Lab/`).
5. **Registar** e copia o **ID da aplicação (cliente)**.
6. Na app: *Mais → Sincronização → OneDrive*, cola o ID → **Guardar e entrar na conta Microsoft** → aceita o acesso à pasta da app.
7. Repete o passo 6 em cada aparelho (o ID é o mesmo).

Os dados ficam no OneDrive em `Aplicações/<nome da app>/data/`, um ficheiro por registo. Num conflito fica a versão alterada mais recentemente. A Microsoft pede para voltar a entrar ao fim de 24 h; até lá, e depois, a app continua a gravar no aparelho e sincroniza quando voltares a entrar.

## Ao vivo (o antigo Control-Stats)

Na página do jogo → **Ao vivo**. Os jogadores vêm da convocatória.

- **Antes do início:** toca num jogador em campo e noutro do banco para trocar o cinco inicial. Pressão longa no cartão muda a posição (GR, FIXO, ALA, PIVÔ).
- **Início 1H / 2H / ET1 / ET2**, **Paragem** (para só o tempo útil), **Pausa** (para os dois relógios), **Fim da parte**.
- **Substituição:** dois toques, um em campo e outro no banco, em qualquer ordem. Quem entra fica com a posição de quem sai.
- **Golos e remates:** toque soma; pressão longa anula o último. O golo conta como remate e guarda os 5 em campo.
- **Situações** (5 Inicial, 3-1, 4-0, bolas paradas, 4x3, 3x4, 4x5, 5x4): toque regista; se tiver preset, faz as trocas. Pressão longa define o preset. **Repor** volta aos 5 de antes do primeiro preset. **Desfazer** anula a última troca.
- Cada toque fica gravado com a hora: fechar a app, bloquear o ecrã ou ficar sem bateria não perde o jogo nem estraga os tempos.
- **Exportar Excel** gera as mesmas folhas do Control-Stats (Match Info, Team Info, Match Events, Playing Stats).

O nome da equipa e a época (em *Mais*) também sincronizam entre aparelhos.

Para trazer o plantel e os presets do Control-Stats: *Plantel → Importar Excel do Control-Stats* (o teu ficheiro de equipa com a folha Situações).

## Ver no vídeo o que marcaste no Ao vivo

No Vídeo de um jogo com Ao vivo aparece o painel **Do Ao vivo**:
1. Vai ao apito inicial de cada parte no vídeo e carrega em **Começa agora** (ou usa o botão *Início da parte*).
2. A lista mostra os golos, faltas e substituições do banco no tempo do vídeo; tocar salta para 4 s antes.
3. Se tudo estiver desfasado nessa parte (vídeo cortado, por exemplo), usa o **ajuste** de ±1 s.
4. **Trazer para o Vídeo** cria esses golos (com autor e assistência), faltas (com quem fez e zona) e quem esteve em campo, sem duplicar o que já marcaste no vídeo. Os remates não vêm, porque o Ao vivo não sabe se foram enquadrados.

Funciona porque o Ao vivo guarda a hora real de cada toque e uma gravação contínua anda também em tempo real.

## Corrigir depois do jogo

No Ao vivo, *Golos, remates e faltas* lista tudo o que foi marcado, com a parte e o tempo útil. **Editar** muda o autor, a assistência ou a zona; **✕** apaga. O que ficou "sem autor" aparece assinalado.

## Importar jogos antigos

*Época → Importar jogos antigos*:
- **Control-Stats:** escolhe os ficheiros `.txt` do Save Match (vários de uma vez). Cada um vira um jogo com o Ao vivo reconstruído: os tempos por jogador e parte, as rotações, os golos com os 5 em campo e as situações batem com os do Control-Stats. Os remates só existem como totais nesses ficheiros, por isso ficam no fim da última parte e sem autor. Jogadores que não existam no plantel são criados.
- **Marcador antigo:** no marcador antigo, *Guardar CSV*; aqui, abre o jogo → *Vídeo* → abre o vídeo → *Abrir CSV*.

## Vídeo: YouTube ou ficheiro

Na página do jogo → **Vídeo**. Duas maneiras, com as mesmas marcações:
- **YouTube:** cola o link (watch, youtu.be, live ou com `?t=`) e carrega em *Abrir YouTube*. O link fica guardado no jogo (também o podes pôr em *Dados do jogo → Vídeo do jogo*) e da próxima vez retoma onde paraste. Precisa de rede. Velocidades até 2× (limite do YouTube).
- **Ficheiro do aparelho:** *Escolher ficheiro de vídeo* ou arrastar. Funciona sem rede e permite até 3×.

Se o dono do vídeo não deixar ver fora do YouTube, a app avisa: descarrega o vídeo com `futsal_clips.py download "<link>"` e abre o ficheiro; as marcações continuam válidas porque o tempo do vídeo é o mesmo.

## Ao vivo: faltas

Botão **Falta**: escolhe MD ou MO e quem fez, dos que estão em campo. Mostra as faltas da equipa na parte e avisa a partir da 5.ª (a 6.ª dá livre de 10 m). Pressão longa anula a última. Entram no Excel da época como faltas cometidas MD/MO.

## Excel da época

*Época → Excel da época* (filtros por competição e datas). É refeito a partir de todos os jogos; com o OneDrive ligado fica também em `exportacoes/`.

- **Estatísticas por jogador** (época) e **Por jogador e jogo**: minutos (tempo útil), golos, assistências, **+ / − / +/−**, em campo em golo marcado e sofrido, faltas cometidas e sofridas por MD/MO (tal como marcadas, do nosso ponto de vista), amarelos, vermelhos, nota; na época também remates, passes, perdas, recuperações e valores por 40 min.
- **+/−**: cada golo ou assistência vale +1; cada golo sofrido com o jogador em campo vale −1.
- **Golos**: cada golo com marcador, assistência, GR, quarteto e os 5 em campo. **Quartetos**: minutos, golos marcados e sofridos de cada quarteto na época.
- Também: Jogos, Minutos (jogador × jogo), Totais por jogo, Eventos (tempos em m,ss) e uma folha Notas.

No Ao vivo: depois de "golo" a app pergunta quem marcou e quem assistiu; depois de "remate", quem rematou (tudo pode saltar-se). No Vídeo, o autor é quem tem a bola e a assistência é o último passe.
Faltas sofridas: no Vídeo, a falta do adversário (Shift+L) pergunta quem a sofreu.

## Eventos do Vídeo

*Mais → Eventos e lances do Vídeo*: mudar nomes e teclas, esconder eventos, criar eventos novos (ex.: "Duelo ganho") e editar as 9 descrições rápidas de lances. Fica sincronizado entre aparelhos.

## Clips (no PC)

`tools/clips.py` lê os jogos diretamente da pasta do OneDrive (`Aplicações/Futsal Lab/data`) e corta os clips a partir do que está marcado no **Vídeo**. Precisa de Python 3.8+, ffmpeg e, para o YouTube, yt-dlp (`winget install Python.Python.3.12 Gyan.FFmpeg yt-dlp.yt-dlp`).

```
python tools/clips.py jogos                                   lista os jogos
python tools/clips.py cortar angrense                         lances e golos do jogo (procura por data ou adversário)
python tools/clips.py cortar 2026-10-18 --o-que golos,faltas --jogador 7 --zona MO
python tools/clips.py cortar angrense --video jogo.mp4        usa um ficheiro em vez do link do YouTube do jogo
python tools/clips.py lances angrense                         folha de lances (Início;Fim;Descrição em m,ss) para o Excel
```

Sem OneDrive, usa uma cópia de *Mais → Guardar cópia*: `--dados futsal-lab-2026-10-18.json`. Os clips de eventos pontuais (golos, faltas…) vão de 6 s antes a 3 s depois (`--antes`, `--depois`); os lances usam o início e o fim marcados. `--rapido` corta sem recodificar.

## Testes

```
tests/run.sh                 # motor do jogo ao vivo, troca com o OneDrive, Excel
python3 tests/e2e.py <pasta> # no browser (Playwright), com a app servida em http://127.0.0.1:8790
```
