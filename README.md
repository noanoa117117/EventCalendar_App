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

## 3. Google OAuthを設定する

1. Supabaseダッシュボード `Authentication > Providers > Google` を開き、有効化する。
2. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) でOAuthクライアントIDを作成する（種類: ウェブアプリケーション）。
3. 承認済みのリダイレクトURIに、Supabaseの `Authentication > Providers > Google` 画面に表示される callback URL
   （`https://<project-ref>.supabase.co/auth/v1/callback`）を追加する。
4. 発行されたClient IDとClient SecretをSupabaseのGoogle Provider設定に貼り付けて保存する。

## 4. 環境変数を設定する

```bash
cp .env.local.example .env.local
```

`.env.local` を開き、手順1で控えたURLとanon keyを設定する。

Google OAuthなしで画面操作だけを確認したいローカル開発時は、追加で次を設定できる。

```env
DEV_BYPASS_AUTH=true
```

これは `npm run dev` 中だけサンプルデータのローカルプレビューを表示する。Supabaseには一切書き込まず、本番ビルド・本番サーバーでは有効にならない。実際のOAuth／DB動作を確認するときは、この値を削除または `false` にして開発サーバーを再起動する。

## 5. 開発サーバーを起動する

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。ホワイトリストに登録したGoogleアカウントでログインすると、初回はニックネーム設定画面、その後は画面①の共有イベントカレンダー（`/events`）に入ります。画面②の空き時間（`/availability`）と画面③のイベント企画（`/planning`）へは各画面のナビゲーションから移動します。

## スクリプト

- `npm run dev` - 開発サーバー
- `npm run build` - 本番ビルド（型チェック・ESLintを含む）
- `npm run lint` - ESLintのみ

## 実装範囲

Phase 1からPhase 6（イベント企画・3画面の画面遷移・管理画面）まで実装済みです。管理画面を使う前に、`0004_admin_roles.sql` の適用が必要です。
