#!/usr/bin/env python3
"""Clips do Futsal Lab: corta os lances e eventos marcados no Vídeo, a partir dos dados da app.

Lê os jogos da pasta sincronizada do OneDrive (Aplicações/Futsal Lab/data) ou de uma cópia JSON
(Mais → Guardar cópia). Só precisa de Python 3.8+, ffmpeg e, para descarregar do YouTube, yt-dlp.

    python clips.py jogos                         lista os jogos
    python clips.py cortar angrense               corta lances e golos do jogo (procura por data, adversário ou id)
    python clips.py cortar 2026-10-18 --o-que lances,golos,faltas --jogador 7 --zona MO
    python clips.py cortar angrense --video jogo.mp4     usa um ficheiro em vez do link do YouTube guardado no jogo
    python clips.py lances angrense               escreve a folha de lances (Início | Fim | Descrição, em m,ss)
    python clips.py download angrense             só descarrega o vídeo do YouTube do jogo

Opções comuns: --dados <pasta data ou ficheiro .json>, --saida <pasta>, --antes 6 --depois 3 (segundos à volta
dos eventos pontuais), --rapido (corta sem recodificar: muito mais rápido, mas o início pode desviar até 2 s).
"""
import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

LBL = {"remate_enquadrado": "remate enquadrado", "remate_fora": "remate fora", "remate_bloqueado": "remate bloqueado",
       "golo": "golo", "perda": "perda", "recuperacao": "recuperacao", "canto": "canto", "falta": "falta",
       "amarelo": "amarelo", "vermelho": "vermelho", "marca": "marcador"}
GRUPOS = {"lances": {"lance"}, "golos": {"golo"}, "faltas": {"falta"}, "cartoes": {"amarelo", "vermelho"},
          "remates": {"remate_enquadrado", "remate_fora", "remate_bloqueado", "golo"}, "perdas": {"perda"},
          "recuperacoes": {"recuperacao"}, "cantos": {"canto"}}
ZONAS = {"D10": "D10M", "F10": "F10M", "MD": "MD", "MO": "MO"}


def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower().strip()


def ms(s):
    s = max(0, int(round(s or 0)))
    return f"{s // 60},{s % 60:02d}"   # minutos continuam acima de 60 (70,12)


# ---------------------------------------------------------------- dados

def pastas_onedrive():
    bases = [os.environ.get(k) for k in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial")]
    bases += [str(Path.home() / "OneDrive")]
    for b in filter(None, bases):
        for apps in ("Aplicações", "Aplicacoes", "Apps", "Applications"):
            for nome in ("Futsal Lab", "Futsal-Lab", "FutsalLab"):
                p = Path(b) / apps / nome / "data"
                if p.is_dir():
                    yield p


def carregar(dados):
    """Devolve (jogos, atletas) a partir da pasta data/ do OneDrive ou de uma cópia .json da app."""
    if dados:
        p = Path(dados)
    else:
        p = next(pastas_onedrive(), None)
        if not p:
            sys.exit("Não encontrei a pasta do Futsal Lab no OneDrive. Indica-a com --dados "
                     "(ex.: --dados \"C:\\Users\\eu\\OneDrive\\Aplicações\\Futsal Lab\\data\") ou usa uma cópia .json.")
    if p.is_file():
        d = json.loads(p.read_text(encoding="utf-8"))
        jogos, atletas = d.get("jogos", []), d.get("atletas", [])
    else:
        if (p / "data").is_dir():
            p = p / "data"
        ler = lambda sub: [json.loads(f.read_text(encoding="utf-8")) for f in sorted((p / sub).glob("*.json"))] if (p / sub).is_dir() else []
        jogos, atletas = ler("jogos"), ler("atletas")
    jogos = [j for j in jogos if not j.get("deleted")]
    jogos.sort(key=lambda j: j.get("data") or "")
    return jogos, [a for a in atletas if not a.get("deleted")]


def escolher(jogos, termo):
    t = norm(termo)
    hits = [j for j in jogos if t and (t in norm(j.get("data")) or t in norm(j.get("adversario")) or str(j.get("id", "")).startswith(termo))]
    if not hits:
        sys.exit(f'Nenhum jogo encontrado para "{termo}". Vê a lista com: python clips.py jogos')
    if len(hits) > 1:
        print(f'Há {len(hits)} jogos para "{termo}"; uso o mais recente. Para outro, escreve a data (AAAA-MM-DD).')
    return hits[-1]


def eventos_video(j):
    return sorted(((j.get("marcador") or {}).get("video") or {}).get("events") or [], key=lambda e: (e.get("parte", 1), e.get("t", 0)))


def titulo(j):
    return f'{j.get("data") or "sem data"} {j.get("adversario") or "?"}'.strip()


# ---------------------------------------------------------------- vídeo

def youtube_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/(?:live|shorts|embed)/)([\w-]{11})", url or "")
    return m.group(1) if m else None


def descarregar(j, pasta):
    url = j.get("videoUrl") or (f'https://youtu.be/{((j.get("marcador") or {}).get("video") or {}).get("yt")}'
                                if ((j.get("marcador") or {}).get("video") or {}).get("yt") else None)
    if not url:
        sys.exit("Este jogo não tem link do YouTube guardado. Usa --video <ficheiro>.")
    vid = youtube_id(url) or "video"
    pasta.mkdir(parents=True, exist_ok=True)
    existentes = list(pasta.glob(f"{vid}.*"))
    if existentes:
        return existentes[0]
    if not shutil.which("yt-dlp"):
        sys.exit("Falta o yt-dlp (winget install yt-dlp.yt-dlp) ou usa --video <ficheiro>.")
    print(f"A descarregar {url} …")
    # H.264 primeiro (abre em todo o lado); até 1080p
    cmd = ["yt-dlp", "-f", "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b", "--merge-output-format", "mp4",
           "-o", str(pasta / f"{vid}.%(ext)s"), url]
    if subprocess.run(cmd).returncode != 0:
        sys.exit("O yt-dlp falhou. Tenta atualizá-lo (yt-dlp -U) ou descarrega à mão e usa --video <ficheiro>.")
    return next(pasta.glob(f"{vid}.*"))


def nome_livre(pasta, base, usados):
    base = re.sub(r'[\\/:*?"<>|]+', "-", base).strip(" .")[:120] or "clip"
    nome, k = base, 2
    while nome.lower() in usados:          # Windows não distingue maiúsculas
        nome = f"{base} ({k})"
        k += 1
    usados.add(nome.lower())
    return pasta / f"{nome}.mp4"


def cortar_ffmpeg(video, ini, fim, destino, rapido):
    dur = max(0.5, fim - ini)
    if rapido:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{ini:.2f}", "-i", str(video), "-t", f"{dur:.2f}", "-c", "copy", str(destino)]
    else:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{ini:.2f}", "-i", str(video), "-t", f"{dur:.2f}",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(destino)]
    return subprocess.run(cmd).returncode == 0


# ---------------------------------------------------------------- comandos

def selecionar(evs, o_que, jogador, zona, equipa):
    tipos = set()
    for g in o_que.split(","):
        g = norm(g)
        if g == "todos":
            tipos |= set(LBL) | {"lance"}
        elif g in GRUPOS:
            tipos |= GRUPOS[g]
        elif g in LBL:
            tipos.add(g)
        else:
            sys.exit(f'Não conheço "{g}". Opções: {", ".join(list(GRUPOS) + ["todos"])}')
    out = []
    for e in evs:
        if e.get("type") not in tipos:
            continue
        if equipa and e.get("type") != "lance" and e.get("team") != ("A" if equipa == "nos" else "B"):
            continue
        if jogador and str((e.get("jog") or {}).get("n")) != str(jogador) and str((e.get("assist") or {}).get("n")) != str(jogador) \
                and str((e.get("sofreu") or {}).get("n")) != str(jogador):
            continue
        if zona and ZONAS.get(e.get("zona"), e.get("zona")) != zona.upper() and e.get("zona") != zona.upper():
            continue
        out.append(e)
    return out


def descricao(e):
    if e.get("type") == "lance":
        return e.get("nota") or "lance"
    partes = [LBL.get(e["type"], e["type"])]
    if e.get("team") == "B":
        partes.append("adversario")
    if e.get("jog"):
        partes.append(f'{e["jog"].get("n")} {e["jog"].get("nome") or ""}'.strip())
    if e.get("zona"):
        partes.append(ZONAS.get(e["zona"], e["zona"]))
    return " ".join(partes)


def cmd_jogos(a):
    jogos, _ = carregar(a.dados)
    if not jogos:
        print("Ainda não há jogos.")
    for j in jogos:
        evs = eventos_video(j)
        n_l = sum(1 for e in evs if e.get("type") == "lance")
        n_g = sum(1 for e in evs if e.get("type") == "golo")
        link = j.get("videoUrl") or ""
        print(f'{titulo(j):40}  {len(evs):4} eventos no Vídeo · {n_l} lances · {n_g} golos  {link}')


def cmd_lances(a):
    jogos, _ = carregar(a.dados)
    j = escolher(jogos, a.jogo)
    lances = [e for e in eventos_video(j) if e.get("type") == "lance" and e.get("fim") is not None]
    destino = Path(a.saida or ".") / f'lances {titulo(j)}.csv'
    destino.parent.mkdir(parents=True, exist_ok=True)
    with open(destino, "w", newline="", encoding="utf-8-sig") as f:          # utf-8 com BOM: o Excel abre bem
        w = csv.writer(f, delimiter=";")
        w.writerow(["Início", "Fim", "Descrição"])
        for e in lances:
            w.writerow([ms(e["t"]), ms(e["fim"]), e.get("nota") or ""])
    print(f"{len(lances)} lances em {destino}")


def cmd_download(a):
    jogos, _ = carregar(a.dados)
    j = escolher(jogos, a.jogo)
    print(descarregar(j, Path(a.cache)))


def cmd_cortar(a):
    if not shutil.which("ffmpeg"):
        sys.exit("Falta o ffmpeg (winget install Gyan.FFmpeg).")
    jogos, _ = carregar(a.dados)
    j = escolher(jogos, a.jogo)
    evs = selecionar(eventos_video(j), a.o_que, a.jogador, a.zona, a.equipa)
    if not evs:
        sys.exit(f"Nada para cortar em {titulo(j)} com esses filtros. (O Vídeo do jogo tem {len(eventos_video(j))} eventos.)")
    video = Path(a.video) if a.video else descarregar(j, Path(a.cache))
    if not video.is_file():
        sys.exit(f"Não encontro o vídeo {video}")
    pasta = Path(a.saida or "clips") / re.sub(r'[\\/:*?"<>|]+', "-", titulo(j))
    pasta.mkdir(parents=True, exist_ok=True)
    usados, ok = set(), 0
    for i, e in enumerate(evs, 1):
        if e.get("type") == "lance":
            ini, fim = e["t"], e.get("fim") if e.get("fim") is not None else e["t"] + a.depois
        else:
            ini, fim = e["t"] - a.antes, e["t"] + a.depois
        ini = max(0, ini)
        destino = nome_livre(pasta, f'{i:02d} {descricao(e)} {ms(e["t"]).replace(",", "m")}s', usados)
        if cortar_ffmpeg(video, ini, fim, destino, a.rapido):
            ok += 1
            print(f"  {destino.name}")
        else:
            print(f"  falhou: {destino.name}")
    print(f"{ok}/{len(evs)} clips em {pasta}")


def main():
    ap = argparse.ArgumentParser(description="Clips do Futsal Lab", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--dados", help="pasta data/ do OneDrive ou ficheiro .json de cópia")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("jogos", help="lista os jogos")
    for nome in ("cortar", "lances", "download"):
        s = sub.add_parser(nome)
        s.add_argument("jogo", help="data (AAAA-MM-DD), parte do nome do adversário ou início do id")
        s.add_argument("--saida", help="pasta de saída")
        s.add_argument("--cache", default="videos", help="pasta para os vídeos descarregados (por defeito ./videos)")
        if nome == "cortar":
            s.add_argument("--video", help="ficheiro de vídeo (por defeito descarrega o link do YouTube do jogo)")
            s.add_argument("--o-que", default="lances,golos", help="lances, golos, faltas, cartoes, remates, perdas, recuperacoes, cantos ou todos (separados por vírgula)")
            s.add_argument("--jogador", help="número da camisola")
            s.add_argument("--zona", help="D10M, F10M, MD ou MO")
            s.add_argument("--equipa", choices=["nos", "adv"], help="só eventos de uma equipa")
            s.add_argument("--antes", type=float, default=6, help="segundos antes de um evento pontual (por defeito 6)")
            s.add_argument("--depois", type=float, default=3, help="segundos depois (por defeito 3)")
            s.add_argument("--rapido", action="store_true", help="sem recodificar (rápido, início menos preciso)")
    # --dados pode vir depois do subcomando
    argv = sys.argv[1:]
    if "--dados" in argv and argv.index("--dados") > 0 and argv[0] != "--dados":
        i = argv.index("--dados")
        argv = argv[i:i + 2] + argv[:i] + argv[i + 2:]
    a = ap.parse_args(argv)
    {"jogos": cmd_jogos, "cortar": cmd_cortar, "lances": cmd_lances, "download": cmd_download}[a.cmd](a)


if __name__ == "__main__":
    main()
