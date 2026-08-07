@AGENTS.md

# 作業引き継ぎ

進捗・次のフェーズ・実環境で必要な作業は必ず [PROGRESS.md](./PROGRESS.md) を正とする。
仕様は [REQUIREMENTS.md](./REQUIREMENTS.md)、セットアップは [README.md](./README.md) を参照する。

## 現在の実装状況

- Phase 1〜3（認証、空き時間登録、共有イベントカレンダー）は実装済み。
- トップ `/` はイベントカレンダー、個人の空き時間画面は `/availability`。
- Supabase SQLは `0001` → `0002` → `0003` の順に適用する。`0003` は許可リストのメール非公開化と、空き時間の同時更新保護を含む。

## ローカル認証なしプレビュー

Google OAuthを使わずUIを確認する場合だけ、ローカルの `.env.local` に次を設定する。

```env
DEV_BYPASS_AUTH=true
```

- `npm run dev` のときだけ `/`・`/events`・`/availability` をローカルプレビューへ切り替える。
- サンプルのユーザー／イベントはブラウザ内メモリだけで扱う。Supabaseへの読み書きやRLSの変更は行わない。
- `next build` / `next start` を含むproductionでは、環境変数があっても必ず無効。
- 実OAuth・DB連携を確認するときは、行を削除するか `false` に戻して開発サーバーを再起動する。
