# -*- coding: utf-8 -*-
"""レギュレーションマーク対応表 (docs/data/marks.json) を生成し、cards.json に mark を焼き込む。

マークはカード画像左下の印字を目視読み取りして作成した（2026-07時点）。
- sets: セット記号 → マーク（セット内で統一されているもの）
- cards: カードID → マーク（プロモ等、セット内で混在するもの）
- 特記: 基本エネルギーはマークなしでも常に使用可 → "基本"
        クラシック(CL*)はマークなしで常に使用可 → "CL"
        MCはH/I/J混在の再録コレクション → "H/I/J"
        旧 = レギュ落ち世代（同名カードの再録がスタンダードにあるため検索に出る）
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "docs", "data", "cards.json")
MARKS = os.path.join(ROOT, "docs", "data", "marks.json")

sys.path.insert(0, ROOT)
from scraper import mark_for_year  # noqa: E402

SETS = {}
for s in ("SV1S SV1V SV1a SV2D SV2P SV2a SV3 SV3a SV4K SV4M SV4a SVAL SVAM SVAW SVB SVC SVD "
          "SVEL SVEM SVF SVG SVJL SVJP WCS23").split():
    SETS[s] = "G"
for s in "SV5K SV5M SV5a SV6 SV6a SV7 SV7a SV8 SV8a SVI SVM SVN SVHK SVHM SVK SVLN SVLS".split():
    SETS[s] = "H"
for s in "SV9 SV9a SV10 SV11B SV11W SVOD SVOM M1L M1S M2 M2a".split():
    SETS[s] = "I"
for s in "M3 M4 M5".split():
    SETS[s] = "J"
for s in "CLF CLK CLL".split():
    SETS[s] = "CL"
SETS["MC"] = "H/I/J"
for s in ("20th BGSt BGSv BKB BKR BKW BKZ BKc BKt BKv BTV BW BW1-Bb BW1-Bw BW3-Bp BW4-B BW5-Brn "
          "BW7-B BW9-B BWP Bb Bd Bk Br CP4 CP6 DP1 DP2 DP3 DP4 DP5 DPP DPs-Sd DPs-Sg DPt-EPd "
          "DPt-EPg DPt-EPp DPt-GBhi DPt-GBna DPt-GBpi DPt-GBpo DPt2-Se DPt2-Sg DPt3-Sg DPt3-Sl "
          "DPt4-B DPt4-Sgf DPt4-Slp DPtP EP08 Em GBR HSPm HSPp HSPt HSZm HSZp HSZt HSm HSp HSt "
          "HXY KK KLD L1-Bhg L1-Bss L2-B L2-Sh LP MDB MG MMB-P MMB-S PBG PPD S-P S10b S11a S12a "
          "S1H S1W S2 S3a S4a S5R S7R S8a S8a-G S8b S9 SA SB SC2 SCS SD SEF SEK SF SGG SGI SH SI "
          "SJ SK SLD SLL SM10 SM11 SM11a SM12a SM1M SM1S SM1p SM2p SM3p SM4p SM5M SM5S SM5p SM6 "
          "SM6b SM7 SM7a SM8 SM8b SM9 SM9a SM9b SMA SMB SMC SMD SME SMF SMG SMH SMI SMJ SMK SML "
          "SMM SMN SMP SN SNPo SO SP2 SP4 SPD SPZ SZD WAK WCP X30 XY1-By XY2 XY5-Bg XY7-B XYA XYB "
          "XYC XYD XYE XYF XYG XYH XYP Y30").split():
    SETS[s] = "旧"

# セット内混在（画像目視読み取り）。基本エネルギーはここに含めず名前ルールで処理。
_SEQ = {
    # SV-P
    "G": [42901, 42902, 42953, 42954, 42955, 43118, 43120, 43121, 43129, 43134, 43135, 43136,
          44237, 44238, 44239, 44240, 44241, 44242, 44243, 44244, 45400, 45407, 45408, 45409,
          45414, 45415, 45416, 45659, 45660, 45661, 45798, 46142, 46143, 46144, 46306, 46307,
          46308, 46451, 47006, 47007, 47008, 47292, 47293, 47294, 47359, 47360, 47361, 47500,
          47501, 47502, 47709, 47710, 47711, 47712, 47713, 47714, 47715, 47727, 47728, 47729,
          47730],
    "H": [45395, 45396, 45398, 45401, 45403, 45404, 45405, 45406, 45793, 45794, 45796, 45797,
          45799, 45841, 45842, 45843, 46124, 46125, 46126, 46131, 46132, 46133, 46148, 46228,
          46229, 46294, 46295, 46296, 46297, 46298, 46299, 46300, 46301, 46302, 46303, 46304,
          46305, 46309, 46310, 46447, 46449, 46450, 46452, 46454, 47159, 47160, 47161, 47162,
          47163, 47166, 47171, 47172, 47175, 47295, 47494, 47496, 47498, 47726, 47731, 47733,
          49610,
          # M-P
          48249, 48252, 48256, 48257, 48258, 48316, 48317, 48483, 50037,
          # MP1
          49587, 49588, 49589, 49594, 49595, 49596, 49597, 49598,
          # MBD
          48293, 48294, 48298, 48300,
          # MBG
          48270, 48271, 48274, 48277,
          # MA
          47863, 47867, 47868, 47870, 47876, 47877, 47880, 47881, 47883, 47885, 47886, 47888,
          47890, 47894, 47899],
    "I": [47164, 47165, 47167, 47168, 47169, 47170, 47174, 47362, 47363, 47364, 47492, 47493,
          47495, 47497, 47499, 47716, 47725, 47732, 48254, 48261, 49613, 49614, 49615, 49616,
          49617, 49618, 49619, 49620, 49633,
          # M-P
          48247, 48248, 48250, 48251, 48253, 48255, 48259, 48260, 48318, 48319, 48320, 48321,
          48330, 48331, 48340, 48479, 48480, 48481, 48482, 48484, 48485, 48486, 49714, 49715,
          49717, 50039, 50041, 50042, 50043, 50044, 50045, 50046, 50047, 50168, 50169, 50170,
          50172, 50173, 50178, 50180, 50181, 50182,
          # MP1
          49590, 49591, 49593, 49600, 49602, 49604, 49609,
          # MBD
          48285, 48286, 48287, 48288, 48289, 48290, 48291, 48292, 48295, 48296, 48297, 48299,
          48301, 48302, 48303, 48304, 48305, 48306,
          # MBG
          48262, 48263, 48264, 48265, 48266, 48267, 48268, 48269, 48272, 48273, 48275, 48276,
          48278, 48279, 48280, 48281, 48282, 48283,
          # MA
          47860, 47862, 47871, 47879, 47882, 47884, 47889, 47898, 47900, 47901, 47902],
    "J": [49716, 50035, 50036, 50038, 50040, 50171, 50174, 50175, 50176, 50177, 50301,
          # MP1
          49592, 49599, 49601, 49603, 49605, 49606, 49607, 49608],
}
CARDS = {}
for mark, ids in _SEQ.items():
    for i in ids:
        assert str(i) not in CARDS, f"duplicate id {i}"
        CARDS[str(i)] = mark


def card_mark(card, sets, card_overrides):
    if card.get("category") == "energy" and str(card.get("name", "")).startswith("基本"):
        return "基本"
    m = card_overrides.get(str(card["id"]))
    if m:
        return m
    return sets.get(card.get("set") or "") or mark_for_year()


def main():
    marks = {"sets": SETS, "cards": CARDS}
    with open(MARKS, "w", encoding="utf-8") as f:
        json.dump(marks, f, ensure_ascii=False, indent=1)

    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    stats = {}
    unknown = []
    for c in data["cards"].values():
        m = card_mark(c, SETS, CARDS)
        c["mark"] = m
        stats[m] = stats.get(m, 0) + 1
        is_known = str(c["id"]) in CARDS or (c.get("set") or "") in SETS
        if not is_known and not (c.get("category") == "energy" and str(c.get("name", "")).startswith("基本")):
            unknown.append((c.get("set"), c["id"], c.get("name")))
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, DATA)
    print("mark stats:", dict(sorted(stats.items())))
    print("unknown:", unknown[:30])


if __name__ == "__main__":
    main()
