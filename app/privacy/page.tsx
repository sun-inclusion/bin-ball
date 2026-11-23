import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="w-full max-w-md mx-auto p-6 space-y-6 text-stone-200 text-sm leading-relaxed">
      <h1 className="text-xl font-bold text-amber-400 border-b border-stone-700 pb-2">
        運営者情報・プライバシーポリシー
      </h1>

      <section className="space-y-2">
        <h2 className="font-bold text-base text-stone-100">1. 運営者情報</h2>
        <p>本サービス『びんぼ～る』は、株式会社SUNが運営しています。</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-base text-stone-100">2. 広告の配信について</h2>
        <p>
          当サイトでは、第三者配信の広告サービス（忍者AdMax、i-mobile、Google AdSense等）を利用する場合があります。
          広告配信事業者は、ユーザーの興味に応じた広告を表示するためにCookie（クッキー）を使用することがあります。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-base text-stone-100">3. アクセス解析・データの保存</h2>
        <p>
          ゲームの進行状況やハイスコアは、お使いのブラウザ内のローカルストレージ（localStorage）にのみ保存され、運営者のサーバーへ個人情報が送信されることはありません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-base text-stone-100">4. 免責事項</h2>
        <p>
          当サイトの利用により生じたいかなる損害についても、運営者は一切の責任を負いかねます。また、本作品は完全オリジナルのパロディゲームであり、実在の企業・団体・製品とは一切関係ありません。
        </p>
      </section>

      <div className="pt-4">
        <Link
          href="/"
          className="inline-block w-full text-center py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
        >
          ゲームに戻る
        </Link>
      </div>
    </main>
  );
}
