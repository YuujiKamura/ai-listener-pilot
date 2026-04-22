# AI Listener Pilot

> ブラウザから OS オーディオをキャプチャ → Gemini CLI が 5 秒チャンクを解析 → ほぼリアルタイムの音楽解析フィードをスクロール表示するパイロット実装。

## これは何か (One-liner)

パソコンで鳴っている音 (YouTube / Spotify / ライブ配信 / DAW のマスター出力など) をブラウザの `getDisplayMedia` でキャプチャし、5 秒ごとに `webm/opus` へ書き出して Flask サーバに送ります。サーバは `gemini --yolo -p "@chunk.webm ..."` をサブプロセスで起動し、キー / BPM / 楽器 / メロディ / 雰囲気を JSON で返し、フロントエンドがフィードに流します。

ゴールは「完璧な音楽認識」ではなく、**AI に音を聴かせて感想を連射させる**という体験の実機検証 (pilot) です。

## Prerequisites

- **Python 3.9+**
  Flask 2.3 以上が動けばバージョンは問いません。
- **Gemini CLI がインストール済み & 認証済み**
  事前にターミナルで一度 `gemini` を実行し、OAuth フロー (ブラウザが開く) を完了させておいてください。サーバは `gemini --yolo -p "@chunk.webm ..."` を非対話で呼び出すため、初回認証だけは手動で済ませる必要があります。
  認証状態は `gemini` を単体で叩いて確認できます。Quota (1 日あたりのリクエスト上限) も同時に確認しておくこと。
- **Chrome または Edge の最新版**
  `getDisplayMedia({ video: true, audio: true })` で OS オーディオを取得するため、Chromium 系ブラウザが必要です。Firefox はタブ音声のみ対応しておらずシステム音声は取れないので不可。Safari も同様に不可。
- **OS**: Windows / macOS / Linux いずれも可。ただし `getDisplayMedia` のオーディオ共有は OS / ブラウザで挙動差があります (後述の Limitations 参照)。

## Setup

```bash
# 1. リポジトリを clone した後
cd ai-listener-pilot

# 2. 依存をインストール (venv 推奨)
python -m venv .venv
source .venv/bin/activate        # Windows は .venv\Scripts\activate
pip install -r requirements.txt

# 3. サーバ起動
python server.py
```

起動すると `http://localhost:5173` で待ち受けます。

## Usage

1. ブラウザで `http://localhost:5173` を開く。
2. **START** ボタンをクリック。
3. Chrome / Edge の共有ダイアログが出るので、
   - 「**タブ**」または「**画面全体**」を選択
   - ダイアログ下部の「**音声も共有する (Share audio / Share tab audio)**」チェックボックスを **必ず ON** にする
   - 共有を許可する
4. 音源を再生する (YouTube / Spotify / ローカル音楽プレイヤーなど何でも可)。
5. 5 秒ごとに音声チャンクがサーバへ POST され、およそ 10〜15 秒のラグで右側のフィードに解析結果が流れてくる。
6. **STOP** でキャプチャを停止。

オーディオメーターが動いていれば音は取れています。START 後もメーターが無反応なら「音声も共有する」のチェックを入れ忘れているので、一度 STOP して共有ダイアログからやり直してください。

## Architecture

```
+------------------+       getDisplayMedia        +-------------------+
|                  |  (video:true, audio:true)    |                   |
|  Chrome / Edge   +----------------------------->+  MediaStream      |
|                  |                              |  (audio track)    |
+------------------+                              +---------+---------+
                                                            |
                                                            | MediaRecorder
                                                            | (5s chunks,
                                                            |  audio/webm;codecs=opus)
                                                            v
                                                  +---------+---------+
                                                  |  Blob (webm/opus) |
                                                  +---------+---------+
                                                            |
                                                            | POST /chunk
                                                            | multipart/form-data
                                                            v
+-------------------------------------------------------------------------+
|  Flask server (server.py) :5173                                         |
|                                                                         |
|   1. chunk を chunks/<timestamp>.webm に保存                            |
|   2. subprocess.run(["gemini", "--yolo", "-p",                          |
|                      "@chunks/<...>.webm analyze as JSON ..."])         |
|   3. stdout を JSON として parse                                         |
|   4. jsonify して返す                                                    |
+-------------------------------------------------------------------------+
                                                            |
                                                            | JSON response
                                                            v
+------------------+                              +-------------------+
|  index.html /    |  fetch('/chunk') の         |  Analysis Feed    |
|  app.js          |<-----------------------------+  (scrolling div) |
|                  |  結果を prepend で積む       |                   |
+------------------+                              +-------------------+
```

要点:

- **ブラウザは常にフロントエンド**。推論は全てサーバ側の Gemini CLI に寄せる。
- **サーバは状態を持たない**。チャンクごとに独立した `gemini` 呼び出しなので、セッション / コンテキストは引き継がない (将来引き継ぐなら Gemini Files API に寄せる)。
- **フロントエンドの描画は JSON を `<pre>` で整形表示**するだけ。スキーマは Gemini の自由回答に任せている。

## Example Output

Gemini が返す JSON の一例 (プロンプトで明示的にキーを要求しているため、だいたい以下の形に揃います)。

```json
{
  "timestamp": "2026-04-22T10:15:30Z",
  "duration_sec": 5,
  "key": "C# minor",
  "bpm": 128,
  "time_signature": "4/4",
  "instruments": [
    "four-on-the-floor kick",
    "sidechained synth bass",
    "plucked lead synth",
    "closed hi-hat 16ths",
    "vocal chop"
  ],
  "melody": "rising minor arpeggio (C#4 -> E4 -> G#4), then stepwise descent back to C#4",
  "mood": "energetic, melancholic, late-night club",
  "genre_guess": "progressive house / melodic techno",
  "notes": "sidechain pumping clearly audible at ~480ms interval"
}
```

フィードには各チャンクの JSON が時系列で積まれます。不定形フィールド (`notes` など) は Gemini の気分で増減するので、フロントエンドは pretty-print するだけで特定のキーに依存しません。

## Limitations

- **Chromium 系のみ (Chrome / Edge)**
  Firefox は `getDisplayMedia` のオーディオ共有が未対応。Safari も同様。Brave / Opera / Arc などは Chrome 相当なら動くはず (未検証)。
- **10〜15 秒のラグ**
  5 秒チャンク + Gemini 推論 (数秒) + ネットワーク / サブプロセス起動オーバーヘッドの合算。リアルタイム (<1 秒) ではない。
- **ポリフォニック / 歪み系音源は精度低下**
  ノイジーなロック、デスメタル、トランスのレイヤード音源は楽器特定が怪しくなります。逆にピアノソロ / ボーカル + ギター程度のシンプルな編成は安定して当たります。
- **Gemini CLI の quota に依存**
  1 分あたり 12 チャンク (5 秒刻み) × 連続使用で quota を溶かします。長時間回すと途中で `429` 系エラーで停止します。事前に `gemini` で残量を確認すること。
- **認証はブラウザごとに 1 度必要**
  `gemini` CLI 側は OAuth (Code Assist) で動いているため、初回の手動実行で認証を済ませておく必要があります。サーバが認証を代行する仕組みはありません。
- **チャンクファイルが残る**
  `chunks/` にデバッグ用途で `.webm` を書き出しています。長時間運転すると数百 MB に育ちます。不要なら定期的に削除するか、`server.py` 側で書き出しを無効化してください (`.gitignore` 済み)。
- **HTTPS ではなく localhost 専用**
  `getDisplayMedia` は secure context (HTTPS or `localhost`) でしか動きません。LAN 越しに別マシンから叩くなら別途 HTTPS 化が必要です。

## Why not GitHub Pages?

このアプリは **Python プロセス (Flask) と Gemini CLI サブプロセス** が常駐する必要があります。GitHub Pages は静的ホスティング専用なので、サーバサイドで `subprocess.run(["gemini", ...])` を走らせることはできません。

同じ理由で Cloudflare Pages / Vercel Static / Netlify の static プランでも動きません。動かすなら Cloud Run / Fly.io / Railway などの Python ワーカーが走る環境に持っていくか、今回のように **ローカル実行** してください。パイロットとしてはローカルで十分です。

## Project Status

**PILOT / 実験段階**。以下はあえて実装していません:

- 認証 (誰でも `localhost:5173` を叩ける)
- HTTPS / CORS / CSP
- マルチユーザー (サーバはグローバル共有の 1 プロセス)
- 永続化 (結果は揮発、リロードで消える)
- エラーリカバリ (Gemini が落ちたら単に 500 が返る)
- テスト

production 投入するならここが全部埋まるのが前提です。今は「ブラウザで音取れる → Gemini に流せる → それっぽい解析が返ってくる」を確認するためだけの最小実装です。

## Stack

- **Flask** (Python web server)
- **Gemini CLI** (推論バックエンド、OAuth で認証)
- **Web Audio API** (`AudioContext`, `AnalyserNode` でメーター表示)
- **MediaRecorder API** (`audio/webm;codecs=opus` で 5 秒チャンク)
- **Fetch API** (`multipart/form-data` で `/chunk` に POST)

## Related Project

姉妹プロジェクト: [ai-chiptune-lab](https://github.com/YuujiKamura/ai-chiptune-lab)

複数の AI バックエンド (Claude / Gemini / Codex) を並列に使って chiptune を作曲させるマルチエージェント作曲実験。こちらは「AI が作る側」、ai-listener-pilot は「AI が聴く側」。対になるパイロットです。

## License

MIT
