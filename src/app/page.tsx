import { getUser } from "@/lib/auth-server";
import QuizLauncher from "@/components/QuizLauncher";

export default async function HomePage() {
  const user = await getUser();

  return (
    <main className="page-home">
      <QuizLauncher loggedIn={!!user} />
    </main>
  );
}
