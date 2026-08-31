# 引き継ぎメモ: 「AIが楽譜を正確に読む」調査 → OMR MCPサーバー構想

作成日: 2026-08-31 (リモートセッションからローカル作業への引き継ぎ)

## 経緯

「AIが正確に楽譜を読めるようにしたい」という要望を起点に、以下の順で調査してきた。

1. 公開されているClaude Skill/GitHubリポジトリで楽譜読み取りに使えるものがないか調査
2. 無料で公式MusicXMLを取得できるか調査(合唱曲一般 → 主要オラトリオ・合唱曲を横断調査)
3. OMR(光学楽譜認識)の仕組み・主要エンジンを技術的に深掘り調査
4. **「定番OSS OMRエンジン(Audiveris・oemer・homr)を直接ラップしたMCPサーバー/Claude Skillが存在しない」という空白領域を埋める新規OSSプロジェクトを作ることに決定**
5. → GitHubでの新規リポジトリ作成を試みたが権限エラーで失敗、ユーザーがリモート作業を終了しローカルに切り替え(今ここ)

## 1. 既に`ototori-app`リポジトリに反映済みのもの

- `docs/free-musicxml-sources.md`(コミット済み・push済み、ブランチ`claude/sheet-music-ai-skill-research-009a79`)
  - 主要オラトリオ・合唱曲について、**ファイル単位でMusicXML/.mxlの実在URLを確認できたもの**の一覧
  - 最有力候補: ブラームス「ドイツ・レクイエム」(CPDL Legge校訂版)、ベートーヴェン交響曲第9番(IMSLPのMuseScore4完全エングレービング)
  - 単曲なら: ヘンデル「ハレルヤ・コーラス」「ザドク・ザ・プリースト」、ヴィヴァルディ「グロリア」(ほぼ全楽章)
  - 大半の大規模オラトリオ(メサイア全曲、マタイ受難曲等)はCPDL/IMSLP上ではPDFのみでMusicXMLは楽章単位の断片しかない、という実態も記録済み
  - 著作権保護期間中の曲(デュリュフレ、オルフ)は対象外と明記済み
  - **注意**: この調査はこの作業環境のネットワークプロキシがcpdl.org/imslp.org/musescore.com等への直接WebFetchをブロックしていたため、WebSearchのスニペットベースの間接調査。採用前に必ず実際にページを開いて中身を確認すること

## 2. OMR(光学楽譜認識)調査で分かったこと

### 仕組み(2世代ある)
- **古典的パイプライン**: 五線検出→**五線除去**(記号と重なった五線を消すと記号も壊れる、というOMR特有の難所)→記号セグメンテーション→分類→再構築。代表は**Audiveris**(ルールベース+CNNのハイブリッド、Java製)
- **エンドツーエンド深層学習**: 一括推論で誤差伝播を減らす。**oemer**(CNN+Watershed)→**homr**(oemerの後継、UNetセグメンテーション+Transformer、Python製、スマホ撮影に強い)、**TrOMR/Polyphonic-TrOMR**(NetEase、純Transformer、多声対応)

### 精度の実情
- 商用アプリ(PlayScore/SmartScore/ScanScore)でも実測レビューでは複雑な譜面は20〜30%の手直しが必要
- LLM(Claude/GPT等)に画像を直接読ませる方式は、音楽記譜法特有のハルシネーションが学術的に報告されており**推奨されない**。専用OMRエンジン + LLMによる後処理検証、という役割分担が妥当という結論

### 既存のギャップ
- melogenai/skillsなど「OMR機能を謳うClaude Skill」は存在するが内部エンジン非公開
- **Audiveris・oemer・homrを直接ラップしたMCPサーバーやClaude Skillは見当たらなかった** → ここが今回作ろうとしている新規プロジェクトの狙い

## 3. 新規プロジェクト「omr-mcp」の決定事項(AskUserQuestionで確定済み)

| 項目 | 決定内容 |
|---|---|
| プロジェクト範囲 | ototori-appとは別の、独立した公開OSSプロジェクト |
| 対応OMRエンジン | Audiveris・homrの両方に対応し、切り替え式(用途に応じて選択できるように) |
| 提供形態 | MCPサーバー |

### 想定していた実装方針(未着手、設計メモのみ)
- 言語: Python(homrがPython製でpipインストール可能、Audiverisはサブプロセス経由でJava CLIを呼ぶ形が自然)
- MCP実装: 公式`mcp` Python SDKの`FastMCP`パターン(`@mcp.tool()`デコレータ)
- ツール例: `transcribe_sheet_music(file_path, engine="auto"|"homr"|"audiveris", hint="scan"|"photo")` → MusicXML/.mxlのパスを返す
- モジュール構成案:
  ```
  src/omr_mcp/
    server.py          # MCPエントリポイント
    config.py          # 各エンジンの実行コマンドパスをenv varで設定
    engines/
      base.py          # 共通インターフェース(available(), transcribe())
      homr_engine.py    # homr CLIをsubprocessで呼ぶ
      audiveris_engine.py  # Audiveris CLI (-batch -export -output) をsubprocessで呼ぶ
    selection.py        # engine="auto"時の自動選択ヒューリスティック
  tests/
  ```
- 自動選択の考え方: 印刷スキャン(公式PDF由来)ならAudiveris、スマホ撮影・多少の歪みがあるならhomr、を既定のヒューリスティックにする案
- ライセンス: ラッパー自体はMITを想定。ただしAudiveris・homrは共にAGPL-3.0系のライセンスなので、公開・配布時のライセンス整合性は要確認(このプロジェクトは各エンジンをバンドルせず、ユーザーが別途インストールする前提にすれば「単なる呼び出し」として扱える可能性が高いが、法的な最終確認はしていない)

## 4. リモートでの中断理由

GitHub上への新規リポジトリ作成を`mcp__github__create_repository`で試みたところ、
```
403 Resource not accessible by integration
```
というエラーで失敗。この作業環境のGitHub連携は「GitHub App」ベースの権限モデルで、付与されているのは**既存リポジトリ(`baribariton7623-eng/ototori-app`)への既存アクセス権**のみであり、「新規リポジトリ作成」はアカウント全体に対する別権限(GitHub Appの`Administration`/`Repository creation`)が必要で、これは付与されていなかった。

→ 解決には、claude.aiのSettings → Connectorsから GitHub 連携を再認可してRepository creation権限を許可するか、あるいは**手元で`omr-mcp`等の空リポジトリをGitHub上に作成する**必要があると案内し、そこでユーザーがリモート作業自体を終了する判断をした。

## 5. ローカルでの再開に向けて

1. GitHub上に空リポジトリを作成(例: `omr-mcp`、public)
2. ローカルでclone、上記のモジュール構成案を元に`FastMCP`ベースのMCPサーバーを実装
3. `homr`(`pip install homr`)と`Audiveris`(Java + jarのセットアップ、または配布バイナリ)をローカル環境にインストールして動作検証
4. 動くようになったら、`ototori-app`側の`scripts/musicxml/`パイプラインと接続し、OMR出力(MusicXML)を取り込んで`<backup>/<forward>`非対応などの既存制約に沿うよう後処理する流れを検証
5. 並行して、`docs/free-musicxml-sources.md`にある「ブラームス ドイツ・レクイエム」「ベートーヴェン第9」あたりから、公式MusicXMLがどこまで使えるか実地検証すると良い
