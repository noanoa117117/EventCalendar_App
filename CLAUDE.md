@AGENTS.md

# 作業引き継ぎ

進捗・次のフェーズ・実環境で必要な作業は必ず [PROGRESS.md](./PROGRESS.md) を正とする。
仕様は [REQUIREMENTS.md](./REQUIREMENTS.md)、セットアップは [README.md](./README.md) を参照する。

## 現在の実装状況

- Phase 1〜6（認証、空き時間登録、共有イベントカレンダー、イベント企画、統合レイアウト、管理画面）は実装済み。
- トップ `/` は企画／イベント／空き時間の統合ダッシュボード。個別画面は `/planning`、`/events`、`/availability`。
- Supabase SQLは `0001` → `0002` → `0003` → `0004` の順に適用する。`0004` は管理ロールと管理用RPCを含む。

## ローカル認証なしプレビュー

Google OAuthを使わずUIを確認する場合だけ、ローカルの `.env.local` に次を設定する。

```env
DEV_BYPASS_AUTH=true
```

- `npm run dev` のときだけ `/`・`/planning`・`/events`・`/availability` をローカルプレビューへ切り替える。
- サンプルのユーザー／イベントはブラウザ内メモリだけで扱う。Supabaseへの読み書きやRLSの変更は行わない。
- `next build` / `next start` を含むproductionでは、環境変数があっても必ず無効。
- 実OAuth・DB連携を確認するときは、行を削除するか `false` に戻して開発サーバーを再起動する。

## 管理画面

- 権限は通常ユーザー／管理者／super userの3段階にする。
- 初期super userは `sinigamiyuuna@gmail.com`。
- 管理者は許可メールの追加・無効化・削除、super userは管理者／super userの付与・解除もできる。
- UIの表示制御だけで完結させず、migrationとsecurity-definer RPCで権限を検証する。
