# ⚠ Superseded by [listener-lab](https://github.com/YuujiKamura/listener-lab)`n`n> This project (Flask sidecar + bookmarklet) is superseded by the integrated Lisp terminal hub **listener-lab**. `n> All future development and improvements are happening there.`n`n---`n`n# AI Listener Pilot

> OS 繧ｪ繝ｼ繝・ぅ繧ｪ繧偵ヶ繝ｩ繧ｦ繧ｶ縺ｧ繧ｭ繝｣繝励メ繝｣ 竊・webm 菫晏ｭ・竊・host 繝壹・繧ｸ縺ｮ `/api/inject` 邨檎罰縺ｧ Gemini 縺ｫ騾√ｊ霎ｼ繧蟆丞梛繝峨ャ繧ｯ繧ｦ繧｣繧ｸ繧ｧ繝・ヨ.

## 菴輔ｒ縺吶ｋ縺・
1. 繝帙せ繝亥・ (萓・ **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)**) 縺ｮ HTML 縺ｫ 1 陦・`<script src="http://localhost:8173/listener-dock.js"></script>` 繧定ｿｽ蜉縺吶ｋ縺縺代〒, 蜿ｳ荳翫↓豬ｮ縺丞ｰ上＆縺・鹸髻ｳ繝峨ャ繧ｯ縺瑚・蜍輔う繝ｳ繧ｹ繝医・繝ｫ縺輔ｌ繧・
2. 繝峨ャ繧ｯ蜀・・ **笳・REC** 縺ｧ `getDisplayMedia` 縺・OS 髻ｳ螢ｰ繧偵く繝｣繝励メ繝｣, **笆 STOP** 縺ｧ骭ｲ髻ｳ邨ゆｺ・
3. 繝峨ャ繧ｯ縺・webm 繧・sidecar (`http://localhost:8173/save`) 縺ｫ繧｢繝・・繝ｭ繝ｼ繝・竊・邨ｶ蟇ｾ繝代せ縺瑚ｿ斐ｋ.
4. 繝峨ャ繧ｯ縺後・繧ｹ繝医・ `/api/inject?text=@<abs_path> 髻ｳ讌ｽ隗｣譫・..` 繧貞娼縺・竊・繝帙せ繝医′ PTY 縺ｫ豬√☆ 竊・Gemini 縺瑚ｧ｣譫・竊・ghostty-web 繧ｿ繝ｼ繝溘リ繝ｫ縺ｫ蠢懃ｭ斐′繧ｹ繝医Μ繝ｼ繝陦ｨ遉ｺ縺輔ｌ繧・

Gemini TUI 縺ｯ photo-ai-lisp 縺ｮ **譛ｬ迚ｩ縺ｮ ghostty-web WASM 繧ｿ繝ｼ繝溘リ繝ｫ** 縺ｧ謠冗判縺輔ｌ繧・ 縺薙・ pilot 縺ｯ xterm.js 繧剃ｽｿ繧上↑縺・窶・迢ｬ閾ｪ縺ｫ荳ｦ縺ｿ縺ｮ蜩∬ｳｪ縺励°蜃ｺ縺帙↑縺・ち繝ｼ繝溘リ繝ｫ繧定ｼ峨○繧九ｈ繧・ 譌｢縺ｫ縺ゅｋ鬮伜刀雉ｪ縺ｪ terminal 縺ｫ荵励▲縺九ｋ譁ｹ縺瑚ｳ｢縺・(縺ｨ縺・≧蛻､譁ｭ).

## Prerequisites

- **Python 3.9+** (Flask 2.3 + Flask-CORS 4)
- **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)** 縺ｪ縺ｩ縺ｮ host page. 蠢・郁ｦ∽ｻｶ縺ｯ:
  - `/api/inject?text=...` 繧ｨ繝ｳ繝峨・繧､繝ｳ繝・(GET 縺ｧ蜿励￠蜿悶▲縺ｦ PTY/遶ｯ譛ｫ縺ｫ豬√☆)
  - 菴輔ｉ縺九・繧ｿ繝ｼ繝溘リ繝ｫ謠冗判 (ghostty-web 謗ｨ螂ｨ) 縺・竊・縺ｮ豕ｨ蜈･邨先棡繧定｡ｨ遉ｺ縺ｧ縺阪ｋ
  - host page 蜀・〒 Gemini CLI 縺瑚ｵｰ縺｣縺ｦ繧・(莠句燕縺ｫ襍ｷ蜍輔＠縺ｦ縺翫￥)
- **Chrome 縺ｾ縺溘・ Edge** (Firefox 縺ｯ system audio 髱槫ｯｾ蠢・
- **Gemini CLI 隱崎ｨｼ貂医∩** (`gemini` 繧剃ｸ蠎ｦ謇句虚襍ｷ蜍輔＠縺ｦ OAuth 繧帝壹＠縺ｦ縺翫￥)

## Setup

```bash
cd ai-listener-pilot
pip install -r requirements.txt

# sidecar 繧定ｵｷ蜍・python server.py
# 竊・http://localhost:8173 縺ｧ蠕・■蜿励￠
```

繧ｫ繧ｹ繧ｿ繝繝昴・繝医・ `PORT=9000 python server.py`.

## 邨ｱ蜷域婿豕・
### A. Bookmarklet (謗ｨ螂ｨ 窶・繝ｪ繝晞俣邨仙粋繧ｼ繝ｭ)

繝帙せ繝医・ HTML 縺ｫ荳蛻・ｧｦ繧峨★, 縺昴・驛ｽ蠎ｦ dock 繧呈ｳｨ蜈･縺吶ｋ譁ｹ蠑・ sidecar 縺ｮ繝・せ繝医・繝ｼ繧ｸ `http://localhost:8173/` 繧帝幕縺・※, 繝壹・繧ｸ荳ｭ縺ｮ縲交沁ｧ Install Listener Dock縲阪・繧ｿ繝ｳ繧偵ヶ繝ｩ繧ｦ繧ｶ縺ｮ繝悶ャ繧ｯ繝槭・繧ｯ繝舌・縺ｫ繝峨Λ繝・げ&繝峨Ο繝・・縺ｧ菫晏ｭ・

莉･髯阪・ photo-ai-lisp 縺ｪ縺ｩ繧帝幕縺・◆迥ｶ諷九〒繝悶ャ繧ｯ繝槭・繧ｯ繧偵け繝ｪ繝・け縺吶ｋ縺ｨ, 縺昴・迸ｬ髢薙□縺・dock 縺梧ｳｨ蜈･縺輔ｌ繧・(繝ｪ繝ｭ繝ｼ繝峨〒豸医∴繧・. 繝帙せ繝・repo 縺ｸ縺ｮ螟画峩荳崎ｦ・

Bookmarklet 縺ｮ荳ｭ霄ｫ (謇句虚縺ｧ菴懊ｋ蝣ｴ蜷・:
```js
javascript:(function(){if(window.__listenerDockInstalled)return;var s=document.createElement('script');s.src='http://localhost:8173/listener-dock.js';document.body.appendChild(s);})();
```

### B. 諱剃ｹ・噪縺ｪ HTML 謾ｹ螟・(髱樊耳螂ｨ)

sidecar 縺悟ｸｸ譎りｵｷ蜍輔＠縺ｦ繧句燕謠舌〒縺・＞縺ｪ繧・ 繝帙せ繝・HTML 縺ｮ `</body>` 逶ｴ蜑阪↓:

```html
<script src="http://localhost:8173/listener-dock.js"></script>
```

縺溘□縺・繝帙せ繝・repo 縺ｫ縺薙・陦後ｒ commit 縺吶ｋ縺ｨ縲茎idecar 蜑肴署縲阪→縺・≧邨仙粋縺梧ｰｸ邯壼喧縺吶ｋ. bookmarklet 譁ｹ蠑上・縺ｻ縺・′ repo 縺ｮ迢ｬ遶区ｧ繧剃ｿ昴※繧・

### 繝輔Ο繝ｼ

1. photo-ai-lisp 縺ｮ繧ｿ繝ｼ繝溘リ繝ｫ (ghostty-web iframe) 蜀・〒 `gemini` 繧定ｵｷ蜍輔＠縺ｦ縺翫￥
2. Gemini 縺ｮ繝励Ο繝ｳ繝励ヨ (`>`) 縺悟・縺溘ｉ蠕・ｩ溽憾諷・3. 而 繝峨ャ繧ｯ縺ｮ **笳・REC** 繧偵け繝ｪ繝・け
4. Chrome 蜈ｱ譛峨ム繧､繧｢繝ｭ繧ｰ:
   - 繧ｿ繝悶ｒ驕ｸ謚・(or 逕ｻ髱｢蜈ｨ菴・ + **縲碁浹螢ｰ繧ょ・譛峨阪メ繧ｧ繝・け ON**
5. 髻ｳ貅舌ｒ蜀咲函 (YouTube / Spotify / DAW 菴輔〒繧・ - 謨ｰ遘偵懈焚蜊∫ｧ・6. **笆 STOP**
7. 繝峨ャ繧ｯ縺御ｻ･荳九ｒ閾ｪ蜍募ｮ溯｡・
   - webm 繧・sidecar 縺ｫ繧｢繝・・繝ｭ繝ｼ繝・(`POST /save`)
   - 霑斐▲縺ｦ縺阪◆ abs path 繧剃ｽｿ縺｣縺ｦ `/api/inject?text=@<path> 骭ｲ髻ｳ繧帝浹讌ｽ隗｣譫・..` 繧・GET
   - 400ms gap 蠕・`/api/inject?text=\n` 縺ｧ Enter (2 繝輔ぉ繝ｼ繧ｺ豕ｨ蜈･)
8. Gemini 縺碁浹螢ｰ繝輔ぃ繧､繝ｫ繧定ｧ｣譫・竊・蠢懃ｭ斐′ ghostty-web 繧ｿ繝ｼ繝溘リ繝ｫ縺ｫ繧ｹ繝医Μ繝ｼ繝陦ｨ遉ｺ

### 2 繝輔ぉ繝ｼ繧ｺ豕ｨ蜈･縺ｫ縺､縺・※

photo-ai-lisp 縺ｮ chat-bar 縺ｨ蜷後§繝代ち繝ｼ繝ｳ. Gemini CLI 縺ｯ `"text\r"` 繧偵梧隼陦梧諺蜈･縲肴桶縺・↓縺吶ｋ繝舌げ縺後≠繧九・縺ｧ, 縲梧悽譁・竊・400ms 竊・LF縲阪→蛻・￠縺ｦ騾√ｋ蠢・ｦ√′縺ゅｋ. dock 縺ｯ閾ｪ蜍輔〒縺薙ｌ繧偵ｄ繧・

## Architecture

```
笏娯楳笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏・笏・Host page (photo-ai-lisp @ :8090)                          笏・笏・                                                           笏・笏・  <iframe id="terminal"> (ghostty-web WASM) 竊・Gemini 譛ｬ菴・  笏・笏・  + sidebar + chat-bar + 窶ｦ                                 笏・笏・  +                                                        笏・笏・  <script src="http://localhost:8173/listener-dock.js">    笏・笏・       竊・閾ｪ蜍輔う繝ｳ繧ｹ繝医・繝ｫ                                   笏・笏・  [而 EAR dock]                                             笏・笏・    笳・REC / 笆 STOP / meter / status                        笏・笏・       竊・POST webm 竊・:8173/save (CORS)                     笏・笏・                         竊・                                笏・笏・                    chunks/rec_XXXX.webm 菫晏ｭ・             笏・笏・                    竊・abs_path 繧定ｿ泌唆                      笏・笏・       竊・GET /api/inject?text=@<abs_path> 髻ｳ讌ｽ隗｣譫絶ｦ         笏・笏・       竊・400ms gap                                         笏・笏・       竊・GET /api/inject?text=\n  (submit)                 笏・笏・                         竊・                                笏・笏・                    host 縺・PTY 縺ｫ譖ｸ縺崎ｾｼ繧                  笏・笏・                         竊・                                笏・笏・                    Gemini 縺・@file 繧定ｪｭ繧薙〒隗｣譫・           笏・笏・                         竊・                                笏・笏・                    ghostty-web iframe 縺ｫ蠢懃ｭ疲緒逕ｻ           笏・笏披楳笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏・```

## Sidecar endpoints

| Method | Path | 逕ｨ騾・|
|---|---|---|
| `GET`  | `/`                    | standalone 繝・せ繝医・繝ｼ繧ｸ (dock 繧定ｪｭ縺ｿ霎ｼ繧縺縺・ |
| `GET`  | `/health`              | `{"ok": true}` 逕溷ｭ倡｢ｺ隱・|
| `POST` | `/save`                | `multipart audio` 蜿嶺ｿ｡, `chunks/rec_*.webm` 菫晏ｭ・竊・`{abs_path, size_kb, id}` |
| `GET`  | `/listener-dock.js`    | dock 繧ｦ繧｣繧ｸ繧ｧ繝・ヨ JS 驟堺ｿ｡ (host 縺ｫ `<script src=>` 縺ｧ豕ｨ蜈･) |

CORS 縺ｯ蜈ｨ繧ｪ繝ｪ繧ｸ繝ｳ險ｱ蜿ｯ (髢狗匱逕ｨ). 譛ｬ逡ｪ驕狗畑縺吶ｋ縺ｪ繧・`flask_cors.CORS(app, origins=['http://localhost:8090'])` 遲峨〒邨槭ｋ縺薙→.

## Standalone 繝・せ繝医Δ繝ｼ繝・
photo-ai-lisp 縺後↑縺上※繧・ sidecar 蜊倅ｽ薙〒蜍穂ｽ懃｢ｺ隱阪〒縺阪ｋ:

```bash
python server.py
# http://localhost:8173 繧帝幕縺・```

竊・繝・せ繝医・繝ｼ繧ｸ縺ｫ dock 縺悟・繧・ REC 竊・STOP 縺ｧ webm 縺・`chunks/` 縺ｫ菫晏ｭ倥＆繧後ｋ. 縺薙・繧ｵ繝ｼ繝舌↓縺ｯ `/api/inject` 縺檎┌縺・・縺ｧ dock 縺ｯ縲・04縲阪お繝ｩ繝ｼ繧偵せ繝・・繧ｿ繧ｹ陦ｨ遉ｺ縺吶ｋ縺・ webm 菫晏ｭ倥せ繝・ャ繝励・蜍穂ｽ懃｢ｺ隱阪〒縺阪ｋ.

## Limitations

- **Chrome / Edge 縺ｮ縺ｿ** 窶・Firefox 縺ｯ system audio 髱槫ｯｾ蠢・ Safari 繧ょ酔讒・- **Host 萓晏ｭ・* 窶・`/api/inject` 繧呈戟縺､繝帙せ繝医′蠢・・ 辟｡縺・→ dock 縺ｮ蠕悟濠繧ｹ繝・ャ繝励′螟ｱ謨・- **Gemini quota** 窶・髟ｷ縺・鹸髻ｳ縺ｯ縺昴ｌ縺縺・Gemini 縺ｮ 1 蝗槭≠縺溘ｊ縺ｮ蜃ｦ逅・′驥阪＞. 30 遘堤ｨ句ｺｦ縺檎樟螳溽噪荳企剞 (螳滓ｸｬ蠢・ｦ・
- **polyphonic 邊ｾ蠎ｦ** 窶・Gemini 縺ｯ general-purpose audio 縺ｪ縺ｮ縺ｧ, 隍・焚讌ｽ蝎ｨ縺ｮ mix 縺九ｉ繝｡繝ｭ繝・ぅ繝ｩ繧､繝ｳ縺縺代ｒ豁｣遒ｺ縺ｫ謚ｽ蜃ｺ縺吶ｋ縺ｮ縺ｯ闍ｦ謇・ 蜊倡峡讌ｽ蝎ｨ or vocal-heavy 縺ｧ best
- **file:// 荳榊庄** 窶・dock 繧ｹ繧ｯ繝ｪ繝励ヨ縺ｯ CORS 縺ｧ邨槭ｉ繧後ｋ縺ｮ縺ｧ `http://localhost:8173` 邨檎罰縺ｧ繝ｭ繝ｼ繝峨☆繧句ｿ・ｦ√≠繧・
## 縺ｪ縺・GitHub Pages 縺ｧ蜈ｬ髢九＠縺ｪ縺・°

- `http://localhost:8173` 縺ｮ sidecar + Python subprocess 縺悟ｿ・ｦ・竊・static pages 縺ｧ蜍輔°縺ｪ縺・- 骭ｲ髻ｳ縺ｯ螳悟・繝ｭ繝ｼ繧ｫ繝ｫ螳檎ｵ・(webm 縺後し繝ｼ繝仙､悶↓蜃ｺ縺ｪ縺・ 縺ｪ縺ｮ縺ｧ, 繧ｯ繝ｩ繧ｦ繝蛾・菫｡縺ｮ諢丞袖縺瑚埋縺・- clone 縺励※ `python server.py` 縺御ｸ逡ｪ繧ｷ繝ｳ繝励Ν

## 髢｢騾｣繝励Ο繧ｸ繧ｧ繧ｯ繝・
- **[ai-chiptune-lab](https://github.com/YuujiKamura/ai-chiptune-lab)** 窶・隍・焚 AI 縺・NES 鬚ｨ繝√ャ繝励メ繝･繝ｼ繝ｳ繧堤ｫｶ菴懊☆繧・sibling 繝励Ο繧ｸ繧ｧ繧ｯ繝・ Gemini 縺ｮ閠ｳ繧貞溘ｊ縺ｦ隧穂ｾ｡縺輔○縺ｦ繧・
- **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)** 窶・Common Lisp 縺ｧ譖ｸ縺九ｌ縺溷・逵溷・逅・UI. ghostty-web iframe + ConPTY + `/api/inject` 繧呈戟縺｣縺ｦ繧九・縺ｧ縺薙・ dock 縺ｮ繝帙せ繝医→縺励※譛驕ｩ.

## Status

**PILOT** 窶・螻謇螳溯｣・ 譛ｬ逡ｪ驕狗畑縺ｯ諠ｳ螳壹○縺・ 縲後ヶ繝ｩ繧ｦ繧ｶ縺九ｉ縺ｮ OS 髻ｳ螢ｰ繧ｭ繝｣繝励メ繝｣ + Gemini 縺ｸ縺ｮ豕ｨ蜈･縲阪′謚陦鍋噪縺ｫ蜿ｯ閭ｽ縺ｧ縺ゅｋ縺薙→繧貞ｮ滓ｩ溘〒遒ｺ隱阪☆繧九・縺檎岼逧・

## License

MIT 窶・`LICENSE` 蜿ら・.

