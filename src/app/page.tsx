import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import QuizLauncher from "@/components/QuizLauncher";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopNav email={user?.email} />
      <main className="page-home">
        <QuizLauncher loggedIn={!!user} />
      </main>
    </>
  );
}
