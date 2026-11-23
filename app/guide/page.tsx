import Link from "next/link";

export default function GuidePage() {
  return (
    <main className="w-full max-w-md mx-auto p-6 space-y-6 text-stone-200 text-sm leading-relaxed">
      <div className="flex items-center justify-between border-b border-stone-700 pb-3">
        <h1 className="text-xl font-bold text-amber-400">
          遊び方 ＆ 貧乏図鑑ガイド
        </h1>
        <Link
          href="/"
          className="text-xs px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-600"
        >
          ← ゲームへ戻る
        </Link>
      </div>

      <section className="space-y-2 bg-stone-800/60 p-4 rounded-xl border border-stone-700">
        <h2 className="font-bold text-base text-amber-300">🕹️ 基本操作とルール</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-stone-300">
          <li>
            <strong>発射（プランジャー）</strong>：右下の「発射」ボタン長押し（またはスペースキー）でバネを引いて玉を打ち出す。
          </li>
          <li>
            <strong>フリッパー操作</strong>：画面の左半分タップ（または左矢印キー）で左フリッパー、右半分タップ（または右矢印キー）で右フリッパーが動く。
          </li>
          <li>
            <strong>破れ障子の穴（即ロスト）</strong>：盤面の途中に空いた破れ穴に玉が落ちると、下の溝に落ちたのと同じく残機を1つ失う。
          </li>
          <li>
            <strong>クリア条件</strong>：1〜3章は目標スコア到達で即クリア！4〜5章は制限時間0秒まで目標スコアをキープするサバイバル戦。
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-base text-amber-300">📦 盤面ギミック・貧乏バンパー図鑑</h2>
        <div className="grid grid-cols-1 gap-2.5">
          <div className="p-3 rounded-lg bg-stone-800 border border-stone-700">
            <div className="font-bold text-amber-200">🥫 錆びた空き缶バンパー（+100〜150pt）</div>
            <p className="text-xs text-stone-400 mt-1">
              四畳半に転がる定番の空き缶。当たると「カンッ！」と軽快な音とともに玉を強く弾き返す。
            </p>
          </div>
          <div className="p-3 rounded-lg bg-stone-800 border border-stone-700">
            <div className="font-bold text-amber-200">🍚 ヒビ入り茶碗バンパー（+200〜300pt）</div>
            <p className="text-xs text-stone-400 mt-1">
              大事に使っている欠け茶碗。高得点だが反発力が強いので、跳ね返りで破れ穴に落ちないよう注意。
            </p>
          </div>
          <div className="p-3 rounded-lg bg-stone-800 border border-stone-700">
            <div className="font-bold text-sky-300">💧 雨漏り水たまり（2章〜）</div>
            <p className="text-xs text-stone-400 mt-1">
              天井からの雨漏りでできた水たまり。玉が通過すると急激にスピードが落ち、軌道が狂う厄介な罠。
            </p>
          </div>
          <div className="p-3 rounded-lg bg-stone-800 border border-stone-700">
            <div className="font-bold text-rose-400">💼 借金取りブロック（3章〜）</div>
            <p className="text-xs text-stone-400 mt-1">
              左右にうろつくお邪魔キャラ。当たると「コラァ！」とばかりに真下へ弾き落とされる危険物。
            </p>
          </div>
          <div className="p-3 rounded-lg bg-stone-800 border border-stone-700">
            <div className="font-bold text-yellow-400">💰 成金小判・お宝バンパー（5章）</div>
            <p className="text-xs text-stone-400 mt-1">
              一発逆転の黄金バンパー。連続コンボで一気に借金返済＆大富豪へ駆け上がれ！
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-base text-amber-300">📖 全5章ストーリー一覧</h2>
        <ol className="list-decimal pl-5 space-y-1 text-stone-300">
          <li><strong>第1章：隙間風の四畳半</strong>（基本の破れ障子ステージ）</li>
          <li><strong>第2章：雨漏りするボロアパート</strong>（減速水たまりギミック登場）</li>
          <li><strong>第3章：借金取りの玄関先</strong>（動くお邪魔キャラ登場）</li>
          <li><strong>第4章：質屋の蔵の奥</strong>（0秒までスコア維持サバイバル）</li>
          <li><strong>第5章：逆転！成金御殿</strong>（超高速フィーバーサバイバル）</li>
        </ol>
      </section>

      <div className="pt-2">
        <Link
          href="/"
          className="inline-block w-full text-center py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg"
        >
          さっそく『びんぼ～る』を遊ぶ
        </Link>
      </div>
    </main>
  );
}
