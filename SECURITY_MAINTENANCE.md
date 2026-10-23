# 依存関係のセキュリティ対応（2026-10-23）

対象はアプリの依存パッケージと開発・ビルド環境。機能、画面、認証実装、DBスキーマの変更はない。本番への反映には別途再ビルド・デプロイが必要。

## 更新内容

| 対象 | 更新前 | 更新後 | 理由 |
| --- | --- | --- | --- |
| Next.js / eslint-config-next | 16.3.0 | 16.4.2 | 8〜10月公開の脆弱性修正を取り込む |
| React / React DOM | 19.2.8 | 19.2.9 | 同じ19.2系のパッチに揃える |
| OpenNext Cloudflare | 1.20.2 | 1.20.13 | Next.js 16.4対応を含むアダプターに更新 |
| Wrangler | 4.119.0 | 4.152.0 | Miniflare・画像処理・HTTP依存関係の更新 |
| Node.js（検証環境） | 22.22.1 | 22.23.4 | 10月21日のセキュリティリリース |

`npm audit fix` の互換範囲で間接依存も更新した。例: sharp 0.35.5、undici 7.30.1、MCP SDK 1.32.1、proxy-addr 2.0.8。shadcn は既存の指定範囲内で4.22.1になった。アプリで利用するSupabase SDK、joseなど、監査で指摘されなかった直接依存の無関係な更新は行っていない。

OpenNext配下の `@node-minify/core` は脆弱な `glob` 10.3.3を固定指定していたため、この親に限定した `overrides` で10.5系の修正版を指定した。上流が修正版を指定したら override を外して再監査する。アダプターのダウングレードは行っていない。

## 最近の告知との照合

- [Next.js 10月14日の公式告知](https://nextjs.org/blog/nextjs-security-update-october-14-2026): `use cache` の型付き配列に関するRCE、SVG画像処理に関するRCE、Server ActionsのDoSを修正。最小修正版は16.4.1で、今回は16.4.2を採用した。
- このリポジトリでは `use cache`、Cache Componentsの有効化、`use server`、`next/image`・`next/og` の直接利用を確認できなかった。本番はCloudflare Workersであり、glibc版LinuxやWindows固有の攻撃条件とは異なる。ただし未使用APIやランタイム差異だけを根拠に安全とは断定せず、Next.js自体を更新した。
- [ReactのRSCに関する公式告知](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3): 対象は `react-server-dom-*`。Next.jsに同梱されるRSC実装の修正にはNext.jsの更新が必要であり、ルートのReactだけを更新して完了とはしない。
- [OpenNext公式リリース](https://github.com/opennextjs/opennextjs-cloudflare/releases): 1.20.12でNext.js 16.4対応と10月14日の修正を取り込み、今回は1.20.13を採用した。
- [Node.js 10月21日の公式告知](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): `.nvmrc` を22.23.4に固定し、`engines.node` も修正済みの22・24・26系を指定した。システム全体のNodeは変更していない。開発端末・Cloudflareのビルド環境にも修正版の指定が必要。Workersの本番ランタイムはローカルNodeとは別に管理される。
- [globの公式告知](https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2): CLIのコマンド実行オプションによるコマンド注入。対象を限定したoverrideで修正済みバージョンに更新した。

## 監査結果と残件

`npm audit` の件数は依存パッケージ単位で、異なる脆弱性の数や本番で攻撃可能な箇所の数ではない。

| 範囲 | Critical | High | Moderate | 合計 |
| --- | ---: | ---: | ---: | ---: |
| 更新前・全依存 | 2 | 18 | 4 | 24 |
| 更新後・全依存 | 0 | 9 | 0 | 9 |
| 更新後・`--omit=dev` | 0 | 7 | 0 | 7 |

残る警告はすべて [braces のDoS（GHSA-vfj7-8cjw-p6xm）](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) と、その依存元への波及。確認時点では修正版未公開。`micromatch` → `fast-glob` → shadcn / ts-morph / Next.js用ESLintプラグインなどに伝播している。

主に開発・ビルド用のパターン解析だが、shadcnは `src/app/globals.css` のCSS importに使われ、現在 `dependencies` にあるため、本番依存のみの監査にも7件残る。依存分類の移動によって件数を隠す対応はしていない。アプリコードからこれらのパターン解析へ外部入力を渡す経路は今回の確認では見つからなかったが、包括的な到達性解析は行っていない。上流の修正版を追跡し、公開後に再監査する。

`npm audit fix --force` が提案する旧版shadcn・Next用ESLintへの変更は互換性を壊すため採用しない。残件があるため `npm audit` は引き続き終了コード1になる。

## 検証と反映

- Node.js 22.23.4で `npm ci`、既存テスト87件、通常のlint、Next.js本番ビルド、Cloudflare Workers向けOpenNextビルドが成功。
- ローカルWorkerをCloudflare認証モードで起動し、公開originを模擬したリクエストで `/login` が200、JWTなしの `/events`・`/availability`・`/auth/cloudflare`・`/api/events/cancel` が403になることを確認。実際のAccessログインやSupabase書き込みは未検証。
- lint対象から、Git管理外の外部AIツール状態とSupabase CLI生成物 `supabase/.temp/` を除外。アプリソースの検査ルールは維持した。
- 既存の `middleware` 命名に対する非推奨警告は残る。今回の脆弱性対応に移行は不要なため、コード変更はしていない。

再確認は `.nvmrc` のNodeに切り替えた環境で `npm ci`、`npm audit`、`npm audit --omit=dev`、`npm test`、`npm run lint`、`npm run build`、`npm run build:worker` を実行する。

本番デプロイ・Cloudflare Dashboard変更・Supabase DB操作は行っていない。デプロイ前後のAccess認証・権限・画面確認はREADMEの手順を使う。Supabaseの実サーバーのバージョン・設定、Cloudflare設定、GitHub Actionsのサプライチェーンを含む包括的監査は今回の対象外。
