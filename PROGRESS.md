# 進捗管理

ツール（Claude Code / Codex等）をまたいでも状況が分かるよう、ここで進捗とネクストステップを管理する。
作業したら都度このファイルを更新すること。仕様の詳細は [REQUIREMENTS.md](./REQUIREMENTS.md)、セットアップ手順は [README.md](./README.md)。

## 現在のフェーズ

**Phase 1-6: 実装・ビルド確認まで完了。実ブラウザE2Eと新migrationの適用はまだ（下記TODO）。**

## Done（Phase 1-6 実装）

- [x] Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui scaffold
- [x] Supabaseクライアント（browser/server）+ `src/proxy.ts`（認証・ホワイトリスト・ニックネーム未設定のリダイレクトゲート）
- [x] DBマイグレーション + RLS一式: `supabase/migrations/0001_init.sql`
  - allowed_emails / profiles / availability_presets / availability_slots / events / event_participants
  - 全テーブルに `is_allowed_user()` を通したRLS
- [x] RPC: `setup_profile`（初回プロフィール+初期プリセット作成、冪等）, `set_availability`（範囲のマージ/分割正規化、登録可能期間チェック）
- [x] セキュリティ監査修正: プロフィール作成・空き時間更新をRPC経由に限定、編集可能期間をAsia/Tokyoに統一、OAuthの遷移先を同一オリジンのアプリ内パスに限定
- [x] 認証フロー: `/login` → Google OAuth → `/auth/callback` → ホワイトリスト外は `/access-denied`、ニックネーム未設定は `/setup-nickname`
- [x] 画面②（`/availability`）: 3カラム（メンバー一覧／月・週カレンダー／プリセット）
  - 月表示: プリセットトグル→日付クリック/ドラッグでペイント登録・解除
  - 週表示: 30分単位の直接ドラッグ登録
  - 過去日・登録可能期間（当月+3ヶ月）外は編集不可
  - プリセット追加/編集/削除（削除しても既存の空き時間は変更しない）
- [x] `npm run build`（型チェック・ESLint込み）通過、`npm run dev` でのスモークテスト確認済み（ログイン画面・アクセス拒否画面のレンダリング）
- [x] Phase 1-2の追加セキュリティ・整合性修正
  - `allowed_emails` はクライアントから参照不可とし、ログインゲートは真偽値だけを返すRPCで判定
  - 空き時間の更新をユーザー・日付ごとに直列化し、同時更新でも正規化を維持
  - 登録可能期間の上限を、閲覧端末のタイムゾーンに関係なくJSTで算出
- [x] Phase 3（画面①）: 共有イベントカレンダー
  - ログイン後のデフォルト画面を月／週表示のイベントカレンダーに変更
  - イベント作成・詳細表示・作成者による編集／キャンセル
  - 参加／未定／不参加の参加表明（イベント作成時の参加者自動登録なし）
- [x] ローカル認証なしプレビュー
  - `.env.local` の `DEV_BYPASS_AUTH=true` で、開発サーバーだけがサンプルデータのイベントカレンダーを表示
  - 操作結果はブラウザ内のみで、Supabase・RLS・production認証には影響しない
- [x] 操作性・モバイル対応の先行修正
  - イベント編集、主催者表示、参加状態のグループ表示、画面①↔②ナビゲーション
  - モバイルのイベント詳細ボトムシート、空き時間画面のカレンダー／メンバー／プリセット切替
  - 空き時間ペイントのタッチドラッグ・中断・高速操作、および週表示の指で押せる行高
  - 開発プレビューでイベント画面と空き時間画面の両方を確認可能
- [x] Phase 4（画面③）: 選択メンバーの共通空き時間をJST・30分単位で集計し、候補から30/60/90/120分のイベントを作成
- [x] Phase 5: 企画／イベント／空き時間を独立した3画面として遷移する導線
- [x] Phase 6: 管理画面とロール管理
  - 通常ユーザー／管理者／super user の3段階
  - 初期super userは `sinigamiyuuna@gmail.com`
  - 管理者は一般メンバーの許可メールを管理し、super userは権限変更も可能
  - 最後の有効super userはDB側で保護

## TODO（ユーザー側の環境構築作業）

- [x] 実Supabaseプロジェクトを作成し `supabase/migrations/` 配下の全SQL（`0001`〜`0004`）を番号順に適用
- [x] `supabase/seed.sql` のメールアドレスを自分のものに書き換えて実行（ホワイトリスト登録）
- [x] Google Cloud ConsoleでOAuthクライアント作成 → SupabaseのGoogle Provider設定
- [x] `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
- [ ] 実環境でE2E動作確認: ログイン → ニックネーム設定 → ペイント操作 → 他メンバー閲覧切替 → プリセットCRUD → イベント作成／参加表明／編集／キャンセル
- [ ] 実ブラウザで①→②→③の画面遷移、モバイルでの各画面の操作性、および空き時間更新後の企画候補再集計を確認
- [ ] `/admin` で許可メール管理・ロール変更を確認

## 次のフェーズ（未着手）

- 実ブラウザレビューで見つかったP2以降の操作性改善を優先する。

## 設計メモ・ハマりどころ

- **Next.js 16の破壊的変更**: `middleware.ts` は廃止され `proxy.ts`（`export function proxy`）に名称変更。他ツールが古い知識で `middleware.ts` を生成すると効かないので注意。`node_modules/next/dist/docs/` に同梱ドキュメントがあるので破壊的変更の確認に使える。
- **`src/lib/database.types.ts`は手書き**。スキーマを変更したら手動で追従するか `supabase gen types typescript` で再生成すること。各テーブルに `Relationships: []` を書き忘れると `Database["public"]` がpostgrest-jsの `GenericSchema` 制約を満たせず、`.from()`/`.rpc()` の引数型が黙って `never`/`undefined` に壊れる（一度ハマった箇所、ファイル内コメント参照）。
- **`set_availability` RPCが空き時間変更とマージ/分割正規化の唯一の経路**。`availability_slots` のクライアントからの直接書き込み権限は剥奪済みで、RPC側で許可済みユーザー・本人・JSTの登録可能期間を検証する。
- **ESLintの `react-hooks/set-state-in-effect`**: React 19/Next16のリンタがdata-fetching effectパターンにも反応する。`availability-board.tsx` の一箇所のみ理由コメント付きで意図的にdisable。同種のケースが増える場合はSWR/React Query導入も検討（現状の技術スタックには未採用）。
- **開発時の認証バイパス**: `src/lib/dev-auth.ts` は `NODE_ENV === "development"` と `DEV_BYPASS_AUTH === "true"` の両方が揃う場合だけ有効。実DBを使うE2Eではこのフラグを使わず、Googleテストアカウントをホワイトリストに登録して確認する。
- **Phase 5の画面構成**: ルート `/` は正規の画面①である `/events` へリダイレクトする。画面②は `/availability`、画面③は `/planning`。モバイルで3画面を同時表示しない。
- **管理権限**: `0004_admin_roles.sql` のsecurity-definer RPCが唯一の許可メール／ロール更新経路。`allowed_emails` のテーブル読み取りを復活させてはならない。
