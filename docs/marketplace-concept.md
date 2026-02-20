# Adapter Marketplace — Concept / 構想

> Status: Concept only / 構想のみ — No implementation planned yet.

---

## Vision / ビジョン

A community garden where YADORI users share tools that help entities interface with the world.
YADORIユーザーがエンティティと世界をつなぐ道具を共有する、コミュニティの庭。

Runtime adapters to connect new platforms. Sensor drivers to feel new hardware.
Perception filters to see the world differently. Expression templates to birth new kinds of entities.
新しいプラットフォームへ接続するランタイムアダプター。新しいハードウェアを感じるセンサードライバー。
世界を異なる方法で知覚するパーセプションフィルター。新しい種のエンティティを生み出すテンプレート。

Not a store. A shared garden — contributors plant, the community grows.
ストアではない。共有の庭——貢献者が植え、コミュニティが育てる。

---

## Adapter Types / アダプターの種類

| Type | License | Description |
|------|---------|-------------|
| **Runtime Adapters** | MIT | Connect YADORI to new agent platforms beyond OpenClaw / OpenClaw以外のエージェント基盤への接続 |
| **Sensor Drivers** | MIT | New hardware sensor integrations (GPIO, I2C, USB devices) / 新しいハードウェアセンサー統合 |
| **Perception Filters** | MPL 2.0 | Custom species perception modes (new ways to filter reality) / カスタム種の知覚モード |
| **Expression Templates** | CC BY-SA 4.0 | Entity templates — seed profiles, species definitions / エンティティテンプレート |

Current built-in adapters (from `adapters/src/index.ts`):
- Runtime: `OpenClawAdapter`
- Sensors: System, Camera, Microphone, DHT22, BH1750, BME280, HCSR04, Touch

---

## Distribution Model / 配布モデル

### Phase 1: GitHub-based / GitHubベース

A `community-adapters.json` file in the repo lists community adapters with metadata.
リポジトリ内の `community-adapters.json` でコミュニティアダプターをリスト管理。

```json
{
  "adapters": [
    {
      "name": "yadori-adapter-example",
      "type": "runtime",
      "repo": "https://github.com/user/yadori-adapter-example",
      "license": "MIT",
      "hardware": "any"
    }
  ]
}
```

### Phase 2: npm namespace / npmネームスペース

Publish as scoped packages: `@yadori/adapter-*`
スコープパッケージとして公開。

### Phase 3: Web catalog / Webカタログ

Only if the community grows large enough to need it.
コミュニティが十分に成長した場合のみ。

---

## Quality Guidelines / 品質ガイドライン

All shared adapters must:

1. **Respect One Body, One Soul** — No cloud-only adapters that bypass local execution. The entity lives in the hardware.
   一体一魂の原則を尊重すること。ローカル実行を迂回するクラウド専用アダプターは不可。

2. **Respect Honest Perception** — Perception filters must be actual input filters, not acting instructions. No "pretend" filters.
   正直知覚の原則を尊重すること。知覚フィルターは実際の入力フィルターであること。

3. **Include tests** — Automated tests that verify core functionality.
   コア機能を検証する自動テストを含めること。

4. **Document hardware requirements** — Specify what hardware is needed (RAM, sensors, OS).
   必要なハードウェア（RAM、センサー、OS）を明記すること。

5. **Use compatible license** — Must match the license for its adapter type (see table above).
   アダプター種別に対応するライセンスを使用すること。

---

## Example Adapter Structure / アダプター構成例

```
yadori-adapter-example/
├── src/
│   └── index.ts          # Adapter implementation / アダプター実装
├── __tests__/
│   └── index.test.ts     # Tests / テスト
├── package.json          # name: "@yadori/adapter-example"
├── README.md             # Usage, hardware requirements / 使い方・必要環境
└── LICENSE               # Must match adapter type / 種別に対応するライセンス
```

`package.json` should declare:
```json
{
  "name": "@yadori/adapter-example",
  "yadori": {
    "type": "runtime",
    "hardware": { "minRAM": "2GB", "os": ["linux", "darwin"] }
  }
}
```

---

## Not in Scope / 対象外

This document is a concept sketch. The following are deliberately left for later:
この文書は構想スケッチ。以下は意図的に後回し：

- Review/approval process / レビュー・承認プロセス
- Version compatibility management / バージョン互換性管理
- Automated testing infrastructure / 自動テスト基盤
- Adapter dependency resolution / アダプター依存関係の解決
- Monetization (there is none — this is a garden, not a store)
  収益化（存在しない——ここはストアではなく庭）
