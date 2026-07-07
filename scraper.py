# -*- coding: utf-8 -*-
"""pokemon-card.com からスタンダードレギュレーションのカード情報を取得するスクレイパー。

- 一覧API (resultAPI.php) でカードIDの全量を取得し、保存済みデータとの差分だけ
  詳細ページ (details.php) を取得してパースする。
- データは data/cards.json に保存する。
"""
import html
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://www.pokemon-card.com"
LIST_API = BASE + "/card-search/resultAPI.php"
DETAIL_URL = BASE + "/card-search/details.php/card/{id}/regu/XY"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DATA_FILE = os.path.join(DATA_DIR, "cards.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) pokecaList/1.0 (personal card list tool)"
WORKERS = 2
REQ_INTERVAL = 0.6  # 全スレッド合計のリクエスト間隔（秒）。サーバー負荷・レート制限対策

ICON2JP = {
    "grass": "草", "fire": "炎", "water": "水",
    "lightning": "雷", "electric": "雷", "thunder": "雷",
    "psychic": "超", "fighting": "闘",
    "darkness": "悪", "dark": "悪",
    "metal": "鋼", "steel": "鋼",
    "fairy": "フェアリー", "dragon": "ドラゴン",
    "colorless": "無", "none": "無", "void": "無",
}

TRAINER_TYPES = ["グッズ", "ポケモンのどうぐ", "サポート", "スタジアム"]
ENERGY_TYPES = ["特殊エネルギー", "基本エネルギー"]


_throttle_lock = threading.Lock()
_next_ok = [0.0]


def _throttle():
    with _throttle_lock:
        now = time.time()
        wait = _next_ok[0] - now
        _next_ok[0] = max(now, _next_ok[0]) + REQ_INTERVAL
    if wait > 0:
        time.sleep(wait)


def http_get(url, retries=4):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last_err = None
    for i in range(retries):
        _throttle()
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return res.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 403:  # CloudFrontのレート制限。長めに待って再試行
                time.sleep(90)
            else:
                time.sleep(2 * (i + 1))
        except Exception as e:  # タイムアウト等
            last_err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"GET failed: {url}: {last_err}")


def fetch_list(se_ta, page):
    params = {
        "keyword": "", "se_ta": se_ta, "regulation_sidebar_form": "XY",
        "pg": "", "illust": "", "sm_and_keyword": "true", "page": page,
    }
    url = LIST_API + "?" + urllib.parse.urlencode(params)
    return json.loads(http_get(url))


def fetch_all_ids(progress=None):
    """カテゴリ別に全ページを走査し {cardID: {category, name, img}} を返す。"""
    cards = {}
    for se_ta, category in (("pokemon", "pokemon"), ("trainer", "trainer"), ("energy", "energy")):
        page = 1
        max_page = 1
        while page <= max_page:
            d = fetch_list(se_ta, page)
            max_page = int(d.get("maxPage") or 1)
            for c in d.get("cardList", []):
                cards[str(c["cardID"])] = {
                    "category": category,
                    "name": c.get("cardNameViewText") or c.get("cardNameAltText") or "",
                    "img": c.get("cardThumbFile") or "",
                }
            if progress:
                progress(f"一覧取得中: {category} {page}/{max_page}ページ")
            page += 1
    return cards


# ---------- 詳細ページのパース ----------

TAG_RE = re.compile(r"<[^>]+>")
ICON_SPAN_RE = re.compile(r'<span class="icon-([a-zA-Z]+) icon"></span>')


def icons_to_jp(html_fragment):
    return [ICON2JP.get(m, m) for m in ICON_SPAN_RE.findall(html_fragment)]


def clean_text(fragment):
    """HTML断片をプレーンテキスト化。エネルギーアイコンは【草】の形式に置換。"""
    s = ICON_SPAN_RE.sub(lambda m: "【" + ICON2JP.get(m.group(1), m.group(1)) + "】", fragment)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>\s*<p[^>]*>", "\n", s)
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t　]+", lambda m: m.group(0)[0], s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def parse_detail(card_id, page_html):
    card = {"id": card_id}
    m = re.search(r'<h1 class="Heading1[^"]*">(.*?)</h1>', page_html, re.S)
    if m:
        card["name"] = clean_text(m.group(1))
    m = re.search(r'<img class="fit" src="([^"]+)"', page_html)
    if m:
        card["img"] = m.group(1)
    m = re.search(r'regulation_logo[^/"]*/([A-Za-z0-9\-]+)\.\w+"', page_html)
    if m:
        card["set"] = m.group(1)
    m = re.search(r"&nbsp;(\d+)&nbsp;/&nbsp;(\d+)&nbsp;", page_html)
    if m:
        card["number"] = f"{m.group(1)}/{m.group(2)}"
    m = re.search(r'rarity/ic_rare_([a-z_]+?)(?:_c)?\.\w+"', page_html)
    if m:
        card["rarity"] = m.group(1).upper().replace("_", "")

    m = re.search(r'class="RightBox-inner">(.*?)<div class="clear">', page_html, re.S)
    inner = m.group(1) if m else ""

    # 弱点・抵抗力・にげる のテーブル
    tm = re.search(r"<table.*?</table>", inner, re.S)
    if tm:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tm.group(0), re.S)
        if len(tds) >= 3:
            w = clean_text(tds[0])
            card["weakness"] = w if w and w != "--" else "--"
            r = clean_text(tds[1])
            card["resistance"] = r if r and r != "--" else "--"
            card["retreat"] = len(ICON_SPAN_RE.findall(tds[2]))
        inner = inner.replace(tm.group(0), "")

    # TopInfo: 区分 / HP / タイプ
    tm = re.search(r'<div class="TopInfo.*?<h2|<div class="TopInfo.*$', inner, re.S)
    top = tm.group(0) if tm else ""
    m = re.search(r'<span class="type">(.*?)</span>', top, re.S)
    if m:
        card["stage"] = re.sub(r"\s+", "", clean_text(m.group(1)))
    m = re.search(r'<span class="hp-num">(\d+)</span>', top)
    if m:
        card["hp"] = int(m.group(1))
    m = re.search(r'<span class="hp-type">.*?icon-([a-zA-Z]+) icon', top, re.S)
    if m:
        card["type"] = ICON2JP.get(m.group(1), m.group(1))

    # h2 見出しでセクション分割
    parts = re.split(r"<h2[^>]*>(.*?)</h2>", inner, flags=re.S)
    pre = parts[0]
    sections = []  # (見出し, 中身HTML)
    for i in range(1, len(parts) - 1, 2):
        sections.append((clean_text(parts[i]), parts[i + 1]))

    # TopInfoより後・最初のh2より前の説明文（テラスタル等のルール文）
    pre_after_top = pre
    tm = re.search(r'<div class="TopInfo', pre)
    if tm:
        # TopInfo ブロック終了後のみを対象にする（<p class="mt20"> を拾う）
        pre_after_top = pre[tm.start():]
    rules = [clean_text(p) for p in re.findall(r'<p class="mt20">(.*?)</p>', pre_after_top, re.S)]

    abilities = []
    moves = []
    texts = []

    for title, body in sections:
        if title == "特性":
            for hm in re.finditer(r"<h4[^>]*>(.*?)</h4>\s*<p[^>]*>(.*?)</p>", body, re.S):
                abilities.append({"name": clean_text(hm.group(1)), "text": clean_text(hm.group(2))})
        elif title in ("ワザ", "GXワザ", "VSTARパワー"):
            for hm in re.finditer(r"<h4[^>]*>(.*?)</h4>\s*(?:<p[^>]*>(.*?)</p>)?", body, re.S):
                h4 = hm.group(1)
                cost = icons_to_jp(h4)
                dm = re.search(r'<span class="f_right[^"]*">(.*?)</span>', h4, re.S)
                damage = clean_text(dm.group(1)) if dm else ""
                name_html = ICON_SPAN_RE.sub("", h4)
                if dm:
                    name_html = name_html.replace(dm.group(0), "")
                name = clean_text(name_html)
                if title != "ワザ" and name:
                    name = f"[{title}] {name}"
                moves.append({
                    "name": name, "cost": cost, "damage": damage,
                    "text": clean_text(hm.group(2) or ""),
                })
        elif title in ("特別なルール",):
            t = clean_text(body)
            if t:
                rules.append(t)
        elif title in TRAINER_TYPES:
            card["trainerType"] = title
            t = clean_text(body)
            if t:
                texts.append(t)
        elif title in ENERGY_TYPES:
            card["energyType"] = title
            t = clean_text(body)
            if t:
                texts.append(t)
            card["types"] = sorted(set(icons_to_jp(body)))
        else:
            t = clean_text(body)
            if t:
                texts.append(f"■{title}\n{t}")

    if "trainerType" in card:
        card["category"] = "trainer"
    elif "energyType" in card:
        card["category"] = "energy"
    else:
        card["category"] = "pokemon"
        card["abilities"] = abilities
        card["moves"] = moves
    if rules:
        card["rule"] = "\n".join(rules)
    if texts:
        card["text"] = "\n".join(texts)
    return card


def fetch_detail(card_id):
    return parse_detail(card_id, http_get(DETAIL_URL.format(id=card_id)))


# ---------- データ保存・更新 ----------

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"updated_at": None, "cards": {}, "last_diff": None}


def save_data(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def update(progress=None, limit=None):
    """差分更新を実行し、(追加カード, 削除カード) の情報を返す。

    progress: callable(dict) 進捗通知。 limit: 新規取得数の上限（テスト用）。
    """
    def notify(**kw):
        if progress:
            progress(kw)

    notify(phase="list", message="カード一覧を取得しています…")
    listed = fetch_all_ids(lambda msg: notify(phase="list", message=msg))

    data = load_data()
    old_ids = set(data["cards"].keys())
    new_ids = set(listed.keys())

    added_ids = sorted(new_ids - old_ids, key=int)
    removed_ids = sorted(old_ids - new_ids, key=int)
    if limit is not None:
        added_ids = added_ids[:limit]

    removed = [{"id": i, "name": data["cards"][i].get("name", "")} for i in removed_ids]
    for i in removed_ids:
        del data["cards"][i]

    total = len(added_ids)
    notify(phase="detail", message=f"新規カード {total}枚の詳細を取得します", done=0, total=total)
    added = []
    errors = []
    lock = threading.Lock()
    done = [0]

    def work(cid):
        card = fetch_detail(cid)
        # 一覧側の情報で補完
        info = listed[cid]
        card.setdefault("name", info["name"])
        card.setdefault("img", info["img"])
        if card["category"] != info["category"]:
            card["category"] = info["category"]
        return card

    if added_ids:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(work, cid): cid for cid in added_ids}
            for fut in as_completed(futs):
                cid = futs[fut]
                try:
                    card = fut.result()
                    with lock:
                        data["cards"][cid] = card
                        added.append({"id": cid, "name": card.get("name", "")})
                except Exception as e:
                    errors.append({"id": cid, "error": str(e)})
                with lock:
                    done[0] += 1
                    if done[0] % 10 == 0 or done[0] == total:
                        notify(phase="detail", done=done[0], total=total,
                               message=f"詳細取得中 {done[0]}/{total}")
                    if done[0] % 200 == 0:  # 中断に備えて途中保存
                        save_data(data)

    data["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    data["last_diff"] = {
        "time": data["updated_at"],
        "added": sorted(added, key=lambda c: int(c["id"])),
        "removed": removed,
        "errors": errors,
    }
    save_data(data)
    notify(phase="done", message=f"完了: 追加{len(added)}枚 / 削除{len(removed)}枚 / 失敗{len(errors)}件",
           done=total, total=total)
    return data["last_diff"]


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="新規取得枚数の上限（テスト用）")
    args = ap.parse_args()
    result = update(progress=lambda kw: print(kw.get("message", "")), limit=args.limit)
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in result.items()},
                     ensure_ascii=False, indent=2))
