import { createClient } from "@/lib/supabase/server";
import QuizLauncher from "@/components/QuizLauncher";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="page-home">
      <QuizLauncher loggedIn={!!user} />
    </main>
  );
}
