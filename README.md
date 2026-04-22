> ⚠ **Superseded by [listener-lab](https://github.com/YuujiKamura/listener-lab)**
>
> This project (Flask sidecar + bookmarklet) has been integrated into the
> **listener-lab** Lisp terminal hub. All future development and improvements
> are happening there. This repo is kept for archival / reference only.

---

# AI Listener Pilot

> OS オーディオをブラウザでキャプチャ → webm 保存 → host ページの `/api/inject` 経由で Gemini に送り込む小型ドックウィジェット.

## 何をするか

1. ホスト側 (例: **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)**) の HTML に 1 行 `<script src="http://localhost:8173/listener-dock.js"></script>` を追加するだけで, 右上に浮く小さい録音ドックが自動インストールされる.
2. ドック内の **● REC** で `getDisplayMedia` が OS 音声をキャプチャ, **■ STOP** で録音終了.
3. ドックが webm を sidecar (`http://localhost:8173/save`) にアップロード → 絶対パスが返る.
4. ドックがホストの `/api/inject?text=@<abs_path> 音楽解析...` を叩く → ホストが PTY に流す → Gemini が解析 → ghostty-web ターミナルに応答がストリーム表示される.

Gemini TUI は photo-ai-lisp の **本物の ghostty-web WASM ターミナル** で描画される. この pilot は xterm.js を使わない — 独自に並みの品質しか出せないターミナルを載せるより, 既にある高品質な terminal に乗っかる方が賢い (という判断).

## Prerequisites

- **Python 3.9+** (Flask 2.3 + Flask-CORS 4)
- **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)** などの host page. 必須要件は:
  - `/api/inject?text=...` エンドポイント (GET で受け取って PTY/端末に流す)
  - 何らかのターミナル描画 (ghostty-web 推奨) が ↑ の注入結果を表示できる
  - host page 内で Gemini CLI が走ってる (事前に起動しておく)
- **Chrome または Edge** (Firefox は system audio 非対応)
- **Gemini CLI 認証済み** (`gemini` を一度手動起動して OAuth を通しておく)

## Setup

```bash
cd ai-listener-pilot
pip install -r requirements.txt

# sidecar を起動
python server.py
# → http://localhost:8173 で待ち受け
```

カスタムポートは `PORT=9000 python server.py`.

## 統合方法

### A. Bookmarklet (推奨 — リポ間結合ゼロ)

ホストの HTML に一切触らず, その都度 dock を注入する方式. sidecar のテストページ `http://localhost:8173/` を開いて, ページ中の「🎧 Install Listener Dock」ボタンをブラウザのブックマークバーにドラッグ&ドロップで保存.

以降は photo-ai-lisp などを開いた状態でブックマークをクリックすると, その瞬間だけ dock が注入される (リロードで消える). ホスト repo への変更不要.

Bookmarklet の中身 (手動で作る場合):
```js
javascript:(function(){if(window.__listenerDockInstalled)return;var s=document.createElement('script');s.src='http://localhost:8173/listener-dock.js';document.body.appendChild(s);})();
```

### B. 恒久的な HTML 改変 (非推奨)

sidecar が常時起動してる前提でいいなら, ホスト HTML の `</body>` 直前に:

```html
<script src="http://localhost:8173/listener-dock.js"></script>
```

ただし ホスト repo にこの行を commit すると「sidecar 前提」という結合が永続化する. bookmarklet 方式のほうが repo の独立性を保てる.

### フロー

1. photo-ai-lisp のターミナル (ghostty-web iframe) 内で `gemini` を起動しておく
2. Gemini のプロンプト (`>`) が出たら待機状態
3. 🎧 ドックの **● REC** をクリック
4. Chrome 共有ダイアログ:
   - タブを選択 (or 画面全体) + **「音声も共有」チェック ON**
5. 音源を再生 (YouTube / Spotify / DAW 何でも) - 数秒〜数十秒
6. **■ STOP**
7. ドックが以下を自動実行:
   - webm を sidecar にアップロード (`POST /save`)
   - 返ってきた abs path を使って `/api/inject?text=@<path> 録音を音楽解析...` を GET
   - 400ms gap 後 `/api/inject?text=\n` で Enter (2 フェーズ注入)
8. Gemini が音声ファイルを解析 → 応答が ghostty-web ターミナルにストリーム表示

### 2 フェーズ注入について

photo-ai-lisp の chat-bar と同じパターン. Gemini CLI は `"text\r"` を「改行挿入」扱いにするバグがあるので, 「本文 → 400ms → LF」と分けて送る必要がある. dock は自動でこれをやる.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Host page (photo-ai-lisp @ :8090)                          │
│                                                            │
│   <iframe id="terminal"> (ghostty-web WASM) ← Gemini 本体   │
│   + sidebar + chat-bar + …                                 │
│   +                                                        │
│   <script src="http://localhost:8173/listener-dock.js">    │
│        ↓ 自動インストール                                   │
│   [🎧 EAR dock]                                             │
│     ● REC / ■ STOP / meter / status                        │
│        ↓ POST webm → :8173/save (CORS)                     │
│                          ↓                                 │
│                     chunks/rec_XXXX.webm 保存              │
│                     → abs_path を返却                      │
│        ↓ GET /api/inject?text=@<abs_path> 音楽解析…         │
│        ↓ 400ms gap                                         │
│        ↓ GET /api/inject?text=\n  (submit)                 │
│                          ↓                                 │
│                     host が PTY に書き込む                  │
│                          ↓                                 │
│                     Gemini が @file を読んで解析            │
│                          ↓                                 │
│                     ghostty-web iframe に応答描画           │
└────────────────────────────────────────────────────────────┘
```

## Sidecar endpoints

| Method | Path | 用途 |
|---|---|---|
| `GET`  | `/`                    | standalone テストページ (dock を読み込むだけ) |
| `GET`  | `/health`              | `{"ok": true}` 生存確認 |
| `POST` | `/save`                | `multipart audio` 受信, `chunks/rec_*.webm` 保存 → `{abs_path, size_kb, id}` |
| `GET`  | `/listener-dock.js`    | dock ウィジェット JS 配信 (host に `<script src=>` で注入) |

CORS は全オリジン許可 (開発用). 本番運用するなら `flask_cors.CORS(app, origins=['http://localhost:8090'])` 等で絞ること.

## Standalone テストモード

photo-ai-lisp がなくても, sidecar 単体で動作確認できる:

```bash
python server.py
# http://localhost:8173 を開く
```

→ テストページに dock が出る. REC → STOP で webm が `chunks/` に保存される. このサーバには `/api/inject` が無いので dock は「404」エラーをステータス表示するが, webm 保存ステップは動作確認できる.

## Limitations

- **Chrome / Edge のみ** — Firefox は system audio 非対応, Safari も同様
- **Host 依存** — `/api/inject` を持つホストが必須. 無いと dock の後半ステップが失敗
- **Gemini quota** — 長い録音はそれだけ Gemini の 1 回あたりの処理が重い. 30 秒程度が現実的上限 (実測必要)
- **polyphonic 精度** — Gemini は general-purpose audio なので, 複数楽器の mix からメロディラインだけを正確に抽出するのは苦手. 単独楽器 or vocal-heavy で best
- **file:// 不可** — dock スクリプトは CORS で絞られるので `http://localhost:8173` 経由でロードする必要あり

## なぜ GitHub Pages で公開しないか

- `http://localhost:8173` の sidecar + Python subprocess が必要 → static pages で動かない
- 録音は完全ローカル完結 (webm がサーバ外に出ない) なので, クラウド配信の意味が薄い
- clone して `python server.py` が一番シンプル

## 関連プロジェクト

- **[ai-chiptune-lab](https://github.com/YuujiKamura/ai-chiptune-lab)** — 複数 AI が NES 風チップチューンを競作する sibling プロジェクト. Gemini の耳を借りて評価させてる.
- **[photo-ai-lisp](https://github.com/YuujiKamura/photo-ai-lisp)** — Common Lisp で書かれた写真処理 UI. ghostty-web iframe + ConPTY + `/api/inject` を持ってるのでこの dock のホストとして最適.

## Status

**PILOT** — 局所実装. 本番運用は想定せず, 「ブラウザからの OS 音声キャプチャ + Gemini への注入」が技術的に可能であることを実機で確認するのが目的.

## License

MIT — `LICENSE` 参照.
