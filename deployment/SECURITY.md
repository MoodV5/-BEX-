# セキュリティ設定・公開前チェック

この文書は作業者用です。Webサーバーにはアップロードしません。
ローカルの実装・検証と、本番での設定・確認は別です。

## 実装した保護

- `.htaccess`：ディレクトリ一覧の禁止、隠しファイル・内部資料・設定・バックアップ・開発用ディレクトリへのHTTPアクセス拒否。
- 対象21ページと `contact.php`：CSP、フレーム埋め込み禁止、MIME判別の抑制、参照元情報の制限、不要なデバイス権限の禁止。
- CSPはスクリプトを同一オリジンの外部ファイルに限定。インラインJavaScript・eval・外部へのフォーム送信を許可しない。現在のGoogle Fonts、JSON-LD、画像、既存のインラインCSSは維持する。CSSの `unsafe-inline` は既存レイアウト互換用であり、JavaScriptには付けない。
- フォーム：既存のCSRF・入力検証・固定宛先・回数制限・TLS検証に加え、メソッド、本文形式、64KiBの本文上限、想定外の添付、cross-siteリクエストを検証。内部エラーを画面に出さない。秘密設定・状態ファイルは実際のドキュメントルートの外に置く。
- 保存する回数制限ファイルは問い合わせ本文を含まず、ディレクトリ0700・ファイル0600。IPのSHA-256値は匿名化を保証するものではない。古いファイルは運用担当が保存期間を決め、送信制限の有効期間である1時間を十分超えたものだけを安全に清掃する。
- PHPMailer 6.12.0は据え置き。公式の公開セキュリティ情報を確認したが、未知の脆弱性がないことを保証するものではない。PHP更新時にライブラリ更新も再評価する。

## 公開ファイルを準備する

```powershell
node scripts/check-publication-content.mjs
node scripts/check-security-config.mjs
node scripts/prepare-public-release.mjs
```

最後のコマンドは新しい `dist/public-日時/` を作成するだけで、アップロードや既存ファイルの削除はしない。
公開ページから参照する画像、88個の図面ファイル、実行に必要なPHP・PHPMailer・ライセンス・`.htaccess`だけを集める。
元のプロジェクトフォルダやGitリポジトリ全体をFTP転送しない。
`lib/` はHTTP公開を拒否するが、PHPのローカル読み込みには必要なので削除しない。

設定例 `deployment/contact-config.example.php` は別途サーバー上の
`/var/www/vhosts/bex.co.jp/bex-private/contact-config.php` に配置し、実際のパスワードはサーバー上だけで入力する。
公開フォルダ内、Git、JavaScript、チャットにパスワードを置かない。

## 本番管理者と実施すること（まだ未実施）

1. 現行ファイル・既存 `.htaccess`・WordPress DB・設定をバックアップし、復旧手順と作業承認を確保する。
2. 提供画面のPHP 7.4.33はサポート終了済み。現在の状態を確認し、WordPressとフォームの互換性を検証したうえでサポート対象の最新修正版へ更新する。サイト切り替えと同時に無検証で変更しない。
3. 検証環境でApache 2.4の `mod_rewrite` / `mod_authz_core` / `mod_headers` と `AllowOverride` の許可を確認。既存のWordPress・転送ルールを残して今回の `.htaccess` を統合する。設定が許可されていない環境では500になる可能性があるため、いきなり本番へ上書きしない。
4. **Pleskのnginxが静的ファイルを直接配信する場合、`.htaccess`を通らない。** nginx側にも拒否ルールとHTMLの保護ヘッダーを管理者が設定するか、対象リクエストをApacheへ渡す。PHP組み込みサーバーも `.htaccess` を解釈しない。ファイルの配置だけで保護済みと判断しない。
5. nginx側の既存 `location`、キャッシュ、証明書更新との干渉を確認する。`/.well-known/acme-challenge/` は証明書更新用に維持する。
6. HTTPSと正規URLへの転送を設定し、証明書・更新の正常性を確認。HSTSはHTTPSが安定してから導入する。未確認のサブドメインまで対象にする `includeSubDomains` やpreloadは今回自動追加しない。
7. SMTPは `uto@bex.co.jp` から `soumu@bex.co.jp` へ。証明書検証を無効化せず、外部アドレスからの問い合わせで実受信・迷惑メール振り分け・返信先を確認。SPF/DKIM/DMARCは既存メールへの影響を見て管理者と確認する。
8. 以前共有された管理・FTP認証情報は先方と更新する。利用可能ならSFTP/FTPS、管理画面とGitHubの多要素認証・最小権限を使用。777は使用しない。
9. 既存WordPressを残すなら本体・テーマ・プラグインも更新・管理する。利用しない場合の停止・削除は先方の承認後に行う。今回の対策はWordPress自体の監査や保護を完了するものではない。
10. バックアップ、証明書期限、500エラー、SMTP失敗、問い合わせの実受信を確認する担当者と頻度を決める。ログの閲覧権限・保存期間・個人情報の取り扱いも決める。

## 公開前の合格条件

- 全21ページとCSS/JS/画像が正常表示され、メニュー・アニメーション・フォームが動作する。Google Fontsを実際に取得した状態でも確認する。
- `/contact.php?action=token` のレスポンスが `no-store`。Cookieは本番HTTPSでSecure / HttpOnly / SameSite=Lax。
- `/contact.php` は正常送信・不正入力・CSRF不正・添付・連投・SMTP失敗を正しく区別し、失敗時に成功と表示しない。
- `/.git/HEAD`、`/.env`、`/data/reference-content.json`、`/deployment/contact-config.example.php`、`/scripts/test-contact-form.mjs`、`/lib/phpmailer/src/SMTP.php`、`/CONTACT-FORM-SETUP.md`、`/contact.php.bak` が **403または404**。パスワード等の本物のファイルを公開して試験しない。存在しないパスの404だけでは拒否ルールの有効性を証明できないため、検証環境では無害なダミーファイルで確認する。
- `/images/`、`/downloads/` がファイル一覧を表示しない一方、公開PDF・ZIPは個別URLで取得可能。
- HTMLレスポンスにCSPなどの保護ヘッダーがある。HTMLがnginx配信の場合も確認する。WordPress管理画面と証明書更新を壊していない。
- HTTPからHTTPSへの転送にループがなく、PHPコードがソースとして配信されない。

## ローカル検証と限界

`scripts/check-security-config.mjs` は拒否パターン・公開ファイル・設定の整合性を検査するが、Apache構文・本番での適用を検証するものではない。
`scripts/test-contact-form.mjs` はダミー認証情報とローカルTLS SMTPで検査し、本番には接続しない。
`scripts/check-responsive-layout.mjs` は今回のCSPを付けたローカルHTTPで表示・操作、インラインスクリプトと外部へのフォーム送信の拒否を検査するが、Apache/nginxのアクセス制限は再現しない。

2026年11月6日：フォーム59項目（ローカルTLS SMTP・Chrome）、全21ページ×15画面サイズ＝315通りのCSP付き表示検査、28種類の非公開パスのパターン検査、148ファイルの公開許可リスト検査を通過。本番送信・サーバー設定変更はしていない。外部フォントの取得はローカル試験では代替応答を使うため、本番前に実際の配信も確認する。

参考：[Apache設定](https://httpd.apache.org/docs/2.4/mod/core.html)、[OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)、[PHPサポート状況](https://www.php.net/supported-versions.php)、[PHPMailer公式セキュリティ情報](https://github.com/PHPMailer/PHPMailer/security)。
