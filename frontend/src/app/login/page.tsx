import { Suspense } from "react";
import { LoginView } from "@/modules/auth/components/login-view";

export default function LoginPage() {
  // useSearchParams() needs a Suspense boundary for static rendering.
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
