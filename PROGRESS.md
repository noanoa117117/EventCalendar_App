# 進捗管理

ツール（Claude Code / Codex等）をまたいでも状況が分かるよう、ここで進捗とネクストステップを管理する。
作業したら都度このファイルを更新すること。仕様の詳細は [REQUIREMENTS.md](./REQUIREMENTS.md)、セットアップ手順は [README.md](./README.md)。

## 現在のフェーズ

**Phase 1-2: 実装・ビルド確認まで完了。実Supabase環境への適用はまだ（ユーザー側作業、下記TODO）。**

## Done（Phase 1-2 実装）

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

## TODO（ユーザー側の環境構築作業）

- [ ] 実Supabaseプロジェクトを作成し `supabase/migrations/` 配下の全SQLを番号順に適用
- [ ] `supabase/seed.sql` のメールアドレスを自分のものに書き換えて実行（ホワイトリスト登録）
- [ ] Google Cloud ConsoleでOAuthクライアント作成 → SupabaseのGoogle Provider設定
- [ ] `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
- [ ] 実環境でE2E動作確認: ログイン → ニックネーム設定 → ペイント操作 → 他メンバー閲覧切替 → プリセットCRUD

## 次のフェーズ（未着手）

- **Phase 3**: 画面①（共有イベントカレンダー）+ イベントへの参加表明。`events` / `event_participants` テーブルは作成済みだがUIは未実装。
- **Phase 4**: 画面③（イベント企画）+ 共通空き時間のヒートマップ算出・イベント作成フォーム。
- **Phase 5**: 3ペイン統合レイアウト・モバイル下部タブ・レスポンシブ対応（Phase1-2はデスクトップ操作優先で未対応）。

## 設計メモ・ハマりどころ

- **Next.js 16の破壊的変更**: `middleware.ts` は廃止され `proxy.ts`（`export function proxy`）に名称変更。他ツールが古い知識で `middleware.ts` を生成すると効かないので注意。`node_modules/next/dist/docs/` に同梱ドキュメントがあるので破壊的変更の確認に使える。
- **`src/lib/database.types.ts`は手書き**。スキーマを変更したら手動で追従するか `supabase gen types typescript` で再生成すること。各テーブルに `Relationships: []` を書き忘れると `Database["public"]` がpostgrest-jsの `GenericSchema` 制約を満たせず、`.from()`/`.rpc()` の引数型が黙って `never`/`undefined` に壊れる（一度ハマった箇所、ファイル内コメント参照）。
- **`set_availability` RPCが空き時間変更とマージ/分割正規化の唯一の経路**。`availability_slots` のクライアントからの直接書き込み権限は剥奪済みで、RPC側で許可済みユーザー・本人・JSTの登録可能期間を検証する。
- **ESLintの `react-hooks/set-state-in-effect`**: React 19/Next16のリンタがdata-fetching effectパターンにも反応する。`availability-board.tsx` の一箇所のみ理由コメント付きで意図的にdisable。同種のケースが増える場合はSWR/React Query導入も検討（現状の技術スタックには未採用）。
