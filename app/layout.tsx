import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "びんぼ～る｜ボロボロ障子の貧乏ピンボール",
  description:
    "破れた障子の穴を避けて空き缶や茶碗に玉を弾き飛ばせ！無料ブラウザパロディピンボールゲーム『びんぼ～る』",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen flex flex-col items-center bg-stone-900 text-stone-100">
        {children}
      </body>
    </html>
  );
}
