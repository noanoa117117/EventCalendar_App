# 空き時間カレンダー（Phase 1-6）

Next.js 16 (App Router) + Supabase。Phase 1（認証・ニックネーム・DBスキーマ）、
Phase 2（画面②: 個人の空き時間登録）、Phase 3（画面①: 共有イベントカレンダー）、Phase 4（画面③: イベント企画）、Phase 5（3画面の導線整理）、Phase 6（管理画面）の実装です。仕様は [REQUIREMENTS.md](./REQUIREMENTS.md)、
進捗・ネクストステップは [PROGRESS.md](./PROGRESS.md) を参照してください（作業したら更新すること）。

## 1. Supabaseプロジェクトを作成する

1. https://supabase.com でプロジェクトを新規作成する（リージョンは Tokyo 推奨）。
2. プロジェクトの `Settings > API` から以下を控える。
   - Project URL
   - `anon` `public` key

## 2. DBスキーマを適用する

`supabase/migrations/` 配下のすべての移行ファイルを番号順に適用します。どちらかの方法で:

**方法A: Supabase CLI**

```bash
npx supabase login
npx supabase link --project-ref <あなたのproject-ref>
npx supabase db push
```

**方法B: ダッシュボードのSQL Editor**

`0001_init.sql`、`0002_secure_profile_and_availability_writes.sql`、`0003_harden_authorization_and_availability.sql`、`0004_admin_roles.sql` の順に、各ファイルの中身をSQL Editorへ貼り付けて実行する。

続けて `supabase/seed.sql` の中身も実行する（自分のメールアドレスをホワイトリストに追加する初期データです。実行前に中のメールアドレスを自分のものに書き換えてください）。

メンバーの追加・有効化・削除は、ログイン後に管理者へ表示される「管理」画面から行えます。管理者は一般メンバーを管理でき、super userは管理者／super userのロール変更もできます。

## 3. Cloudflare Accessを設定する（リモート環境）

Cloudflare Accessでアプリを保護し、以下をサーバー環境変数に設定します。

```env
AUTH_MODE=cloudflare
CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
CF_ACCESS_AUD=<application audience tag>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role key>
```

`/auth/cloudflare` は `Cf-Access-Jwt-Assertion` をJWKS、issuer、audienceで検証し、`allowed_emails.is_enabled` をサービスロールで照合してSupabase SSRセッションを発行します。サービスキーは `NEXT_PUBLIC_*` にせず、クライアントへ返さないでください。SupabaseのData APIを直接公開する構成ではCloudflareゲートウェイ外の通信を防げないため、必要に応じてSupabaseを非公開ネットワークに置くかBFF化してください。

### Access Policy（メールをCloudflare側で管理しない設定）

- Action: `Allow`
- Include: `Everyone`
- Require: `Login Methods` → `Google`
- Application identity providers: `Google` のみ
- Apply instant authentication: 有効

`Include` に `Everyone` と `Login Methods` を並べるとOR条件になり、Google以外のログイン方法を将来追加した際に通してしまいます。`Login Methods` は `Require` に置いてください。画面で `Require` が選べない場合は、Application identity providers をGoogleだけに限定し、Google以外のIdP／One-time PIN／Bypass policyを追加しないでください。Cloudflareは本人確認だけを担当し、アプリの利用可否は `public.allowed_emails` の有効な行だけで判定します。

## 4. 環境変数を設定する

```bash
cp .env.local.example .env.local
```

`.env.local` を開き、手順1で控えたURLとanon keyを設定する。ローカルでは `AUTH_MODE=local` のままfixtureメール／パスワードでログインします。リモートは `.env.local.remote` に上記Cloudflare変数も設定し、`npm run env:remote` で有効化します。

認証なしで画面操作だけを確認したいローカル開発時は、追加で次を設定できる。

```env
DEV_BYPASS_AUTH=true
```

これは `npm run dev` 中だけサンプルデータのローカルプレビューを表示する。Supabaseには一切書き込まず、本番ビルド・本番サーバーでは有効にならない。実際のOAuth／DB動作を確認するときは、この値を削除または `false` にして開発サーバーを再起動する。

## 5. 開発サーバーを起動する

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。リモートではCloudflare Accessで認証後、許可済みメールアドレスのみ利用できます。

## スクリプト

- `npm run dev` - 開発サーバー
- `npm run build` - 本番ビルド（型チェック・ESLintを含む）
- `npm run lint` - ESLintのみ

## 実装範囲

Phase 1からPhase 6（イベント企画・3画面の画面遷移・管理画面）まで実装済みです。管理画面を使う前に、`0004_admin_roles.sql` の適用が必要です。
