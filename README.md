# 空き時間カレンダー（Phase 1-6）

Next.js 16（App Router）+ Supabase。イベント、空き時間登録、企画、管理画面を実装済みです。進捗と未確認事項は、必ず [PROGRESS.md](./PROGRESS.md) を参照してください。

## 1. Supabaseプロジェクトを作成する

1. https://supabase.com でプロジェクトを新規作成する（Tokyo推奨）。
2. `Settings > API` から Project URL と anon public key を控える。

## 2. DBスキーマを適用する

`supabase/migrations/` の `0001` から `0009` を番号順に適用します。既存プロジェクトでは適用済み番号を先に確認し、未適用分だけを実行してください。

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

SQL Editorでも同じ順序です。続けて `supabase/seed.sql` のメールアドレスを自分のものへ変更して実行し、最初のsuper userをallowlistへ登録します。メンバーの追加・有効化・削除はログイン後の管理画面から行います。`0007_super_user_delete_event.sql` は、キャンセル済みイベントをsuper userが完全削除するRPCを追加します。`0008_google_calendar_sync.sql` は、Google Calendar同期用のステータス列を追加します。`0009_active_members_and_admin_nicknames.sql` は、管理一覧のニックネーム取得と、有効な許可ユーザーだけを返すメンバー取得RPCを追加します。

## 3. ローカル開発・fixture

Node.js 22以上、Docker、Supabase CLIが必要です。

```bash
npm install
npm run dev:local
```

`npm run dev` もローカルSupabaseを使います。fixtureの投入は意図的に自動化していません。複数メンバーを確認する時だけ、[supabase/local/README.md](./supabase/local/README.md) の手順でAlice/Bob/Caraのfixtureを投入してください。

`.env.local`、`.env.local.remote`、`.dev.vars` はGit管理外です。`DEV_BYPASS_AUTH=true` は開発時の画面プレビュー専用であり、実DB・本番・Workersでは使いません。

## 4. 本番構成: Cloudflare Workers + Cloudflare Access

本番はVercel、Ubuntu、Cloudflare Pagesの静的exportを使いません。

```text
利用者 → invitation-event-calendar.amida-solutions.uk
       → Cloudflare Access → Cloudflare Workers（Next.js / OpenNext）
       → Supabase
```

`wrangler.jsonc` は `workers_dev=false`、`preview_urls=false`、`keep_vars=true`、Custom Domain `invitation-event-calendar.amida-solutions.uk` を固定しています。`*.workers.dev`やPreview URLを本番経路にしません。`keep_vars=true`により、Wranglerで再デプロイしてもDashboardを正本とするruntime Variablesを削除しません。

### Cloudflare Access Application

Applicationの対象hostnameは `invitation-event-calendar.amida-solutions.uk` にします。推奨Policyは次のとおりです。

- Action: `Allow`
- Include: `Everyone`
- Require: `Login Methods` → `Google`
- Application Identity Providers / Login Methods: `Google` のみ
- Instant authentication: 有効

`Everyone` とGoogleをともに`Include`に入れてはいけません。Include条件はORです。One-time PIN、他のIdentity Provider、Bypass Policyは追加しません。CloudflareはGoogleによる本人確認だけを担当し、アプリ利用可否の唯一の正本は`public.allowed_emails`です。Cloudflare側に個別メールアドレスを二重管理しません。

### WorkersのVariablesとSecrets

Workers & Pages → 対象Worker → Settings → Variables and Secretsで、**runtime**に以下を登録します。`APP_ORIGIN`は固定値であり、Hostヘッダーからredirect先を作りません。

| 種別 | 名前 | 値 |
| --- | --- | --- |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| Variable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| Variable | `AUTH_MODE` | `cloudflare` |
| Variable | `DEV_BYPASS_AUTH` | `false` |
| Variable | `APP_ORIGIN` | `https://invitation-event-calendar.amida-solutions.uk` |
| Variable | `CF_ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| Variable | `CF_ACCESS_AUD` | Access ApplicationのAUD |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| Secret | `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | サービスアカウントJSONのBase64 |
| Variable | `GOOGLE_CALENDAR_ID` | 同期先のGoogleカレンダーID |

`SUPABASE_SERVICE_ROLE_KEY`は`wrangler.jsonc`や`vars`、`NEXT_PUBLIC_*`、ログ、レスポンスへ書きません。CLIで設定する場合は、値を表示・コミットせずに実行します。

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Workers Builds/Git連携を使う場合、`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_ANON_KEY`はビルド時にも必要です。runtime Variablesとは別のBuild Variablesに同じ環境の公開値を登録します。現在のOpenNext buildはService Role Keyを使わないため、`SUPABASE_SERVICE_ROLE_KEY`をBuild環境へ複製しません。runtimeのWorkers Secretだけに登録し、将来Buildで必要になった場合も平文VariableではなくBuild Secretとしてのみ設定します。

### ビルド、preview、初回デプロイ

CloudflareのDashboard変更や本番デプロイは、このリポジトリから自動では行いません。設定後、ローカルで確認します。

```bash
npm test
npm run lint
npm run build
npm run build:worker
npm run preview:worker
```

初回デプロイは、Cloudflareへログイン済みでVariables/Secretsを設定した端末から実行します。

```bash
npm run deploy:worker
```

またはCloudflare Workers BuildsでGitHubリポジトリを接続し、Build commandを`npm run build:worker`、Deploy commandを`npm run deploy:worker`として設定します。初回デプロイ後、Custom DomainがWorkerに接続済みであることを確認してください。既存の競合CNAMEがあるhostnameにはCustom Domainを作成できません。

### デプロイ前後の確認とロールバック

デプロイ前は、Worker previewで`/login`が200、JWTなしの`/events`・`/availability`・`/auth/cloudflare`・`/api/*`が403、任意Hostが403であることを確認します。実環境ではCloudflare Access経由の許可メール／未許可メール／無効メール、logout、ニックネーム設定、管理者権限、モバイル操作まで確認します。

障害時はCloudflare Dashboardの以前のWorker Versionを再度デプロイするか、version IDを指定して実行します。

```bash
npx wrangler rollback <previous-version-id>
```

## 5. 認証・データ境界の制約

`/auth/cloudflare` は `Cf-Access-Jwt-Assertion` をCloudflare JWKSで検証し、RS256、issuer、AUD、`exp`、`nbf`を必須にします。検証済みemailをtrim+lowercaseして`allowed_emails.is_enabled=true`と照合した後にだけSupabase SSR sessionを発行します。未許可・無効メールはuser/profile/preset/session作成やデータ取得へ進みません。

ブラウザからSupabase Data APIを直接使う構成は今回維持します。RLS、本人確認RPC、allowlistによりanon・未許可ユーザー・他人の空き時間更新を拒否しますが、Cloudflare AccessはこのData API自体を非公開にするものではありません。Supabaseの非公開化またはBFF化は別フェーズです。

## スクリプト

- `npm run dev` / `npm run dev:local` — ローカルSupabaseでNext開発サーバー
- `npm run dev:remote` — `.env.local.remote`を有効化してNext開発サーバー
- `npm run build` — 通常のNext本番ビルド
- `npm run build:worker` — OpenNextによるCloudflare Workers変換ビルド
- `npm run preview:worker` — Worker preview
- `npm run deploy:worker` — Cloudflare Workersへデプロイ
- `npm test` / `npm run lint` — 認証・品質確認

## 6. イベント削除と既知の制約

イベント作成者はイベントをキャンセルできます。キャンセルは履歴を残す論理削除です。`0007_super_user_delete_event.sql` 適用後は、super userだけが詳細画面の「完全に削除」からキャンセル済みイベントを物理削除できます。未キャンセルのイベントや一般ユーザーの削除はDB側で拒否されます。

スマホの月表示では、同じ日に複数イベントがある場合、件数バッジは表示されますが、現状その月セルから個別のイベント詳細を開けません。週表示に切り替えると、各イベントをタップして詳細を確認できます。この月表示の詳細導線は次のUI修正対象です。

## 7. Google Calendar同期（MVP）

イベントの作成・編集・キャンセル時に、Googleカレンダーへ自動で一方向同期します。ChronicleBotやDiscordの構成は変更しません。

### セットアップ

1. Google Cloud Consoleでサービスアカウントを作成し、Calendar APIを有効化する。
2. 同期先のGoogleカレンダーの共有設定で、サービスアカウントのメールに「予定の変更」権限を付与する。
3. サービスアカウントのJSON鍵をBase64エンコードし、Cloudflare Workerの環境変数 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` にSecretとして設定する。
4. 同期先のカレンダーIDを `GOOGLE_CALENDAR_ID` に設定する。
5. Supabaseに `0008_google_calendar_sync.sql` を適用する。

```bash
# Base64エンコード例
base64 -w0 service-account.json
```

### 動作

- イベント作成・編集 → Googleカレンダーにイベントを作成または更新
- イベントキャンセル → Googleカレンダーからイベントを削除
- Google event IDはアプリのイベントUUIDからハイフンを除去した値で決定（冪等）
- 同期失敗時はDBイベントは維持し、イベント詳細に同期状態を表示
- 作成者は「再同期」ボタンで手動再試行が可能
- 環境変数が未設定の場合、同期は無視される（エラーにならない）

## 8. Supabaseフリープランの自動休止対策

Supabaseフリープランは1週間APIアクセスがないとプロジェクトが自動休止します。`.github/workflows/keep-supabase-alive.yml` が毎日UTC 03:00（JST 12:00）に`GET /rest/v1/profiles?select=id&limit=1`をanon keyで送り、休止を防ぎます。`workflow_dispatch`で手動実行もできます。HTTPステータスをログへ出力し、200〜299以外はレスポンス本文（`sb_`で始まる文字列は`[REDACTED]`に置換）を出力してジョブを失敗させます。

GitHubリポジトリの `Settings > Secrets and variables > Actions` に以下を登録してください（`.env.local`と同じ値）。

| Secret名 | 値 |
| --- | --- |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL`と同じ |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY`と同じ |
