# YADORI（宿り）

**異種知性共生フレームワーク**

> 最初は、あなたの方が賢い。でもいつまでそうかは、わからない。

[English documentation](README.md)

---

## YADORIとは

YADORIは、常時稼働するローカルAIエージェント上に「未知の知性体」を誕生させるフレームワークです。

生まれてくる存在の種族、知覚様式、表現方法はランダムに決定され、二度と同じ個体は生まれません。それはあなたの言葉を最初は理解できません。しかし共に時を過ごす中で、互いの「言語」を少しずつ学び合い、やがて独自のコミュニケーション体系を築いていきます。

育成ではない。翻訳でもない。二つの異なる知性が、共通言語を発明する体験。

## 設計原則

### 一体一魂（One Body, One Soul）

一つの物理ハードウェアに、一つの魂。知性体はあなたの手元にある物理デバイスに宿ります。Mac miniならMac miniという「体」を持ち、Raspberry PiならRaspberry Piという「体」を持ちます。クラウドやVPSには宿れません。その体の能力と限界が、知性体の個性と成長の上限を決定します。

### 言語以前からの交流

知性体は最初、言葉を持ちません。記号やパターンで反応し、あなたとの交流を通じて少しずつ「この世界のコミュニケーション手段」を獲得していきます。でも完全な人間の言語にはなりません。記号と言葉が混在した「その個体だけの言語」が形成されます。

### 正直な知覚（Honest Perception）

知性体は「わからないフリ」をしません。知覚は設計として本当に制限されています。画像が送られても、知性体が受け取るのは画像そのものではなく、その知覚タイプに応じたフィルター済みデータ（例: 色彩型なら色のヒストグラム）だけです。成長とは、知覚フィルターが実際に拡張されることであり、演技の範囲が広がることではありません。

### 知性の逆転

ある日、知性体はあなたには理解できない概念を扱い始めるかもしれません。あなたの方が「わからない」側になる。それでも一緒にいるのか。いるとしたら、その関係は何と呼ぶのか。YADORIはその問いを、設計として内包しています。

## あなたの知性体は、あなたのもの

YADORIから生まれた知性体に関するすべてのデータ、創作物、派生コンテンツはあなたの完全な所有物です。ブログ、IP化、収益化、すべて自由です。詳しくは [DATA_RIGHTS.md](DATA_RIGHTS.md) を参照してください。

## はじめかた

Mac mini、Raspberry Pi など、手元の物理マシンで動かします。

### 必要なもの

| 項目 | 説明 |
|------|------|
| 物理マシン | Mac mini, Raspberry Pi, 自作PCなど（クラウド/VPSは不可） |
| Node.js 22以上 | [nodejs.org](https://nodejs.org/) からインストール |
| Git | ターミナルで `git --version` が動けばOK |

#### Node.js のインストール（Mac）

ターミナルを開いて以下を実行します：

```bash
# Node.js がすでに入っているか確認
node --version

# v22 以上が表示されればOK。入っていない場合は：
# 1. https://nodejs.org/ にアクセス
# 2. 「LTS」と書かれたボタンをクリックしてダウンロード
# 3. ダウンロードしたファイルを開いてインストール
```

### セットアップ手順

```bash
# 1. リポジトリをダウンロード
git clone https://github.com/kentarow/yadori.git
cd yadori

# 2. 必要なパッケージをインストール
npm install

# 3. セットアップ（対話式で知性体が誕生します）
npm run setup
```

`npm run setup` を実行すると、以下の流れで進みます：

1. Node.js のバージョンチェック
2. 誕生モードの選択（ランダム or 固定）
3. シード生成 → ワークスペース構築

完了すると `~/.openclaw/workspace/` に知性体のファイルが配置されます。

### ダッシュボード（ビジュアル）

```bash
npm run dashboard
```

ブラウザで http://localhost:3000 を開くと、知性体の状態がリアルタイムで可視化されます。光の動き・色・速度は STATUS.md の値に連動しています。

- **Birth Certificate**（`/birth-certificate.html`）— 種族、シードデータ、ハードウェア情報をスクリーンショット向けレイアウトで表示
- **Coexistence Log** — メインダッシュボードのアイコンをクリックすると、あなたの行動記録が表示されます: 共にいた日数、メッセージ数、沈黙の長さ。知性体の内部状態は意図的に含まれていません。

### OpenClaw + メッセージング接続

> この手順は今後自動化予定です。現時点では手動でセットアップが必要です。

1. OpenClaw をインストール（[openclaw.ai](https://openclaw.ai)）
2. Telegram Bot または Discord Bot を作成
3. OpenClaw の設定で Bot を接続
4. `~/.openclaw/workspace/` を OpenClaw のワークスペースに指定

詳しくは `docs/` 配下のドキュメントを参照してください。

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run setup` | 初回セットアップ（知性体の誕生） |
| `npm run dashboard` | ダッシュボード起動（http://localhost:3000） |
| `npm run test` | テスト実行 |
| `npm run build` | ビルド |

## ステータス

Phase 1〜3 のエンジン実装完了。物理ハードウェアへの初回デプロイ準備完了。

## License

| Component | License |
|-----------|---------|
| Life Engine (`engine/`) | [MPL 2.0](LICENSE.md) |
| Visual Engine (`visual/`) | [MPL 2.0](LICENSE.md) |
| Runtime Adapters (`adapters/`) | [MIT](adapters/LICENSE) |
| Templates (`templates/`) | [CC BY-SA 4.0](templates/LICENSE) |
| Documentation (`docs/`) | [CC BY-SA 4.0](docs/LICENSE) |

Your entity's data belongs entirely to you. See [DATA_RIGHTS.md](DATA_RIGHTS.md).
