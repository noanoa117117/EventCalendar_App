# 進捗管理

ツール（Claude Code / Claude / Codex等）をまたいでも、**現在地・確定した判断・未解決課題・次にすること**が分かる運用台帳です。作業を始める前に「現在地」を読み、作業を終えたら該当項目と変更理由・検証結果を更新してください。仕様は [REQUIREMENTS.md](./REQUIREMENTS.md)、手順は [README.md](./README.md)。

## 現在地（最初に読む）

**最終更新: 2026-08-07 / Cloudflare Workers移行を実装・ローカルworkerd検証済み。Cloudflare実環境の設定・staging E2E待ち**

| 項目 | 状態 | 事実・次の判断 |
| --- | --- | --- |
| アプリ機能（Phase 1-6） | 実装済み | 画面①イベント、②空き時間、③企画、管理画面まで実装済み。実Supabase上の総合E2Eは未完了。 |
| 空き時間の保存 | 実装済み・要DB適用確認 | UIは `set_availability_batch` を呼ぶ。実Supabaseに `0006_batch_availability.sql` が適用済みかを最優先で確認する。 |
| 管理画面 | 実装済み・要DB適用確認 | UI/RPCは `0005_admin_access_controls.sql` と `0006` を前提にする。実環境では少なくとも `0001`〜`0004` 適用済み。`0005`/`0006` の適用状況は未記録なので、推測で扱わない。 |
| イベント完全削除 | 実装済み・要DB適用確認 | `0007_super_user_delete_event.sql` 適用後、super userがキャンセル済みイベントを物理削除できる。未キャンセルイベントと一般ユーザーはDB側で拒否する。 |
| ローカル検証 | 構築済み | Docker Supabase + 実在しない fixture 3ユーザー（メール/パスワード）を任意投入できる。通常開発は `npm run dev:local`。fixtureは自動投入しない。 |
| Cloudflare Access 認証 | 実装済み・本番未検証 | JWT検証→Supabase allowlist→SSRセッション発行。13テストは成功済み。未許可メールには管理者登録依頼とGoogle再ログインの案内を返す。Cloudflare Dashboard/本番Secretは未設定。 |
| Workers移行 | 実装済み・未デプロイ | OpenNext `1.20.2` + Wrangler `4.119.0`、Edge互換legacy `src/middleware.ts`、Custom Domain `invitation-event-calendar.amida-solutions.uk`を設定済み。ローカルworkerdで無JWT・不正Hostの403を確認。本番/stagingには未デプロイ。 |

### 次に行うこと（優先順）

1. Cloudflare DashboardでWorker runtime Variables/Secret、Custom Domain、Access Applicationを設定し、stagingまたは本番前のE2Eを行う。デプロイはユーザー承認後にのみ実施する。
2. 実Supabaseの migration `0005` / `0006` の適用状況をSQLで確認し、未適用ならユーザーが適用する。
3. 実機E2E（モバイル含む）を行う。ログイン、空き時間の下書き→確定→再読込→削除、他メンバー閲覧、企画、イベント参加、管理画面を確認する。

### Cloudflare Workersの互換性判断

- 調査対象: Next `16.3.0`、`@opennextjs/cloudflare@1.20.2`、認証の [`src/middleware.ts`](./src/middleware.ts) と [`src/lib/supabase/proxy.ts`](./src/lib/supabase/proxy.ts)。旧 `src/proxy.ts` はWorkers非互換のため削除済み。
- 判断: Next 16の `proxy.ts` はNode.js runtime固定。一方、OpenNext CloudflareはNode.js Middlewareを未サポートであり、現在の認証・allowlistゲートをそのまま載せるのは不可。
- 解決: 認証ゲート全体をEdge/Web APIだけで動くlegacy `src/middleware.ts`へ移した。Next 16.3自体とOpenNext `1.20.2` の組合せは対応範囲であり、問題はProxyの実行形態だけだった。
- 検証: OpenNext Worker buildでmiddleware handlerを生成し、local workerdで想定ホストの`/login=200`、JWTなしの`/events`・`/availability`・`/auth/cloudflare`・未定義`/api/*=403`、不正Host=403を確認した。実Cloudflare Access JWT、Supabase Cookie永続化、Custom Domainは実環境で要確認。

### 引継ぎルール

- **未確認を完了扱いにしない。** 例: migration適用、Cloudflare Dashboard設定、実機E2Eはユーザーの実施報告または実行ログがあるまで未完了。
- 作業ごとに「変更ファイル」「なぜ」「検証コマンドと結果」「残課題」をこのファイルへ追記する。
- Cloudflare Accessは本人確認、`public.allowed_emails` はアプリ利用許可の正本。Cloudflare側で個別メールを二重管理しない。
- 直接Supabase Data APIをブラウザから使う構成は今回維持する。RLSは必須だが、Cloudflare AccessがData APIを直接保護するわけではない（将来のBFF/非公開化は別フェーズ）。

## Done（Phase 1-6 実装）

- [x] Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui scaffold
- [x] Supabaseクライアント（browser/server）+ `src/lib/supabase/proxy.ts` を呼び出す `src/middleware.ts`（Workers向けlegacy Edge認証・ホワイトリスト・ニックネーム未設定のリダイレクトゲート）
- [x] DBマイグレーション + RLS一式: `supabase/migrations/0001_init.sql`
  - allowed_emails / profiles / availability_presets / availability_slots / events / event_participants
  - 全テーブルに `is_allowed_user()` を通したRLS
- [x] RPC: `setup_profile`（初回プロフィール+初期プリセット作成、冪等）, `set_availability`（範囲のマージ/分割正規化、登録可能期間チェック）
- [x] セキュリティ監査修正: プロフィール作成・空き時間更新をRPC経由に限定、編集可能期間をAsia/Tokyoに統一、OAuthの遷移先を同一オリジンのアプリ内パスに限定
- [x] 認証フロー: Cloudflare Access JWTを検証してSupabase SSRセッションを発行。ホワイトリスト外は `/access-denied`、ニックネーム未設定は `/setup-nickname`
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
- [x] Phase 6追加: super userによるキャンセル済みイベントの完全削除（`0007_super_user_delete_event.sql`）

## ユーザー側で必要な作業（実環境を変更するもの）

- [x] 実Supabaseプロジェクトを作成し `0001`〜`0004` を番号順に適用
- [x] `0005_admin_access_controls.sql` / `0006_batch_availability.sql` の実Supabase適用状況を確認し、未適用なら順に適用（適用前に内容を確認する）
- [x] `supabase/seed.sql` のメールアドレスを自分のものに書き換えて実行（ホワイトリスト登録）
- [x] Workers移行完了後、Cloudflare Zero TrustでAccess Applicationを作成し、`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` とサーバー専用の `SUPABASE_SERVICE_ROLE_KEY` をWorkersの環境変数／Secretとして設定
- [x] `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
- [x] 実環境でE2E動作確認: ログイン → ニックネーム設定 → ペイント操作 → 他メンバー閲覧切替 → プリセットCRUD → イベント作成／参加表明／編集／キャンセル
- [x] 実ブラウザで①→②→③の画面遷移、モバイルでの各画面の操作性、および空き時間更新後の企画候補再集計を確認
- [ ] `0007_super_user_delete_event.sql` の実Supabase適用状況を確認
- [ ] `/admin` で許可メール管理・ロール変更を確認

## 次のフェーズ（未着手）

- Cloudflare Workersのstaging/本番前E2Eを完了する。
- その後、実ブラウザレビューで見つかったP2以降の操作性改善を扱う。

## 直近の変更記録

### Cloudflare Workers移行（実装済み・未デプロイ）

- **変更理由**: Vercel/Ubuntuを使わず、Cloudflare Accessの直後でNext.jsを実行するため。対象ドメインは`invitation-event-calendar.amida-solutions.uk`。
- **互換性判断**: Next `16.3.0`の`proxy.ts`はNode runtime固定だが、OpenNext CloudflareはNode.js Middlewareを未サポート。そのため`src/proxy.ts`を削除し、同じ認証ゲートをEdge互換legacy `src/middleware.ts`へ移した。これはOpenNextがNode Proxyに対応するまでの互換性負債であり、将来の戻しには同じE2Eを再実施する。
- **変更ファイル**: `open-next.config.ts`、`wrangler.jsonc`、`next.config.ts`、`package.json`、`public/_headers`、`.gitignore`、`src/middleware.ts`、認証/redirect helper、環境テンプレート、README。`workers_dev=false`、`preview_urls=false`、`keep_vars=true`、`nodejs_compat`、Custom Domain固定を設定。`keep_vars=true`によりWrangler再デプロイでDashboard管理のruntime Variablesを消さない。
- **追加防御**: `AUTH_MODE=cloudflare`では`APP_ORIGIN=https://invitation-event-calendar.amida-solutions.uk`とrequest originの完全一致を必須にし、Vercel URL、workers.dev、Preview URL、任意Hostからは公開パスを含め403。redirect先はHostヘッダーではなく設定済みoriginから作る。
- **検証済み**: `npm test` 13件、`npm run lint`、`npm run build`、`npm run build:worker`、`git diff --check`。workerd local previewで想定Hostの`/login=200`、JWTなしの`/events`・`/availability`・`/auth/cloudflare`・未定義API=403、不正Host=403。
- **Secret判断**: Service Role KeyはRLSを迂回できるためruntime Workers Secretだけに置く。現行OpenNext buildは不要なのでBuild環境へ複製しない。将来buildで必要になった場合だけ、平文VariableではなくBuild Secretとして設定する。
- **未確認**: 実Cloudflare Access JWTの透過、allowlist後のSupabase Set-Cookieの実ドメイン永続化、logout、JWKSネットワーク取得、Workers Buildsのruntime/build variables、Custom Domain/DNS、Access Policy。これらを通すまで本番デプロイしない。

### Cloudflare Access認証・認可（実装済み・本番未検証）

- **変更理由**: `AUTH_MODE=local` だけを信用すると、productionや非loopbackのSupabaseでもCloudflare境界を迂回できた。JWTの時刻claimは任意であり、prefix判定の公開パスは`/login-evil`まで公開扱いになり得た。
- **実装**: local modeは「developmentかつloopback Supabase」に限定。未知の認証モードはfail closed。Cloudflare JWTはRS256、JWKS、issuer、audience、必須の`exp`/`nbf`を検証する。公開パスは完全一致または安全な境界で判定し、SupabaseのsignOut後は検証済みteam domainのCloudflare logoutへ遷移する（localは`/login`）。
- **認可順序**: 検証済みJWTのemailをtrim+lowercaseし、`allowed_emails.is_enabled=true`をサービスロールで照合してからのみ`generateLink`する。未許可・無効・照合エラーでは、auth user作成、プロフィール・初期プリセット作成、Supabase session発行、データ取得を開始しない。
- **検証済み**: `npm test` 13件（正常JWT/メール正規化、欠損・偽造・ES256、issuer/audience、exp/nbf、JWKS鍵ローテーション、安全なnext、既存user ID再利用、local設定、allowlist→generateLinkの順序と未許可時0回）、`npm run lint`、`npm run build` が成功。
- **未許可時の案内**: `/auth/cloudflare` はHTTP 403を維持し、許可されていないGoogleアカウントには、管理者への登録依頼後にCloudflare Access（Google認証）を再試行する旨を表示する。allowlist照合や副作用の順序は変更していない。
- **残課題**: 公開SupabaseのData APIはCloudflare gatewayの外にある。RLSでanon・未許可ユーザーは拒否するが、この通信経路自体を非公開にするには将来BFF化またはSupabaseの非公開化が必要。
- **Policy簡略化の確定事項**: Cloudflare Access Policyは `Allow` + `Include: Everyone` + `Require: Login Methods → Google`、ApplicationのIdPはGoogleのみ、Instant authenticationは有効。`Include` にEveryoneとGoogleを併記しない。個別メールの正本は`public.allowed_emails`。

### 直近のUI修正

- **イベント月表示のモバイル対応**: 7列の月表示ではタイトルを無理に縮めず、確定イベントは色付きドット（4件以上は`+N`）で表示する。タップすると詳細ボトムシートでタイトル・日時・主催者・参加操作を確認できる。週表示では時刻＋タイトルの縦リストを使う。
- **Cloudflare未許可メールの案内**: `/auth/cloudflare` は403を維持し、allowlist外のGoogleアカウントには管理者への登録依頼と再ログインを促す日本語メッセージを表示する。allowlist照合前の副作用はない。
- **イベント完全削除**: `0007_super_user_delete_event.sql` とUIを追加。キャンセル済みイベントだけをsuper userが物理削除できる。未キャンセルイベントや一般ユーザーの削除は拒否する。
- **既知のモバイル問題**: 月表示で同日に複数イベントがある場合、件数バッジは表示されるが個別詳細を開けない。週表示では確認可能で、月表示の詳細導線を次の修正対象とする。

### ローカルSupabase fixture（コミット済み）

- **目的**: 本番Supabaseを汚さず、複数メンバーの空き時間・権限UIを検証する。
- **構成**: `npm run dev:local` がローカルSupabaseを起動して `.env.local` をローカル接続に切替える。fixture投入は意図的に手動であり、通常起動や`db reset`では自動投入しない。
- **データ**: `supabase/local/fixture.sql` が Alice / Bob / Cara の認証ユーザー、許可メール、プロフィール、各3件の空き時間を用意する。cleanupもfixture固有IDだけを対象にする。
- **注意**: 画面ログインにはローカルのメール/パスワード画面を使う。リモート環境ではCloudflare Accessのみを使う。fixtureのメール・パスワード・投入/削除手順は `supabase/local/README.md` を参照。

## 設計メモ・ハマりどころ

- **Next.js 16とWorkersの例外**: 通常のNext 16では`middleware.ts`は`proxy.ts`（`export function proxy`）へ改称された。ただし現行OpenNext WorkersはNode.js Proxyを未対応。このためWorkers移行では、認証ゲートを`src/middleware.ts`のEdge互換legacy形式に保持し、Worker previewで動作確認済み。OpenNextがNode Proxyに対応するまでの互換性負債として扱い、変更時は同じE2Eを再実施する。
- **`src/lib/database.types.ts`は手書き**。スキーマを変更したら手動で追従するか `supabase gen types typescript` で再生成すること。各テーブルに `Relationships: []` を書き忘れると `Database["public"]` がpostgrest-jsの `GenericSchema` 制約を満たせず、`.from()`/`.rpc()` の引数型が黙って `never`/`undefined` に壊れる（一度ハマった箇所、ファイル内コメント参照）。
- **`set_availability` RPCが空き時間変更とマージ/分割正規化の唯一の経路**。`availability_slots` のクライアントからの直接書き込み権限は剥奪済みで、RPC側で許可済みユーザー・本人・JSTの登録可能期間を検証する。
- **ESLintの `react-hooks/set-state-in-effect`**: React 19/Next16のリンタがdata-fetching effectパターンにも反応する。`availability-board.tsx` の一箇所のみ理由コメント付きで意図的にdisable。同種のケースが増える場合はSWR/React Query導入も検討（現状の技術スタックには未採用）。
- **開発時の認証バイパス**: `src/lib/dev-auth.ts` は `NODE_ENV === "development"` と `DEV_BYPASS_AUTH === "true"` の両方が揃う場合だけ有効。実DBを使うE2Eではこのフラグを使わず、ローカルfixtureまたはCloudflare Accessの許可済みアカウントで確認する。
- **Phase 5の画面構成**: ルート `/` は正規の画面①である `/events` へリダイレクトする。画面②は `/availability`、画面③は `/planning`。モバイルで3画面を同時表示しない。
- **管理権限**: `0004_admin_roles.sql` のsecurity-definer RPCが唯一の許可メール／ロール更新経路。`allowed_emails` のテーブル読み取りを復活させてはならない。
