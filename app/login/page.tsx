import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { getAppPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const notConfigured = !getAppPassword();
  return (
    <Suspense>
      <LoginForm notConfigured={notConfigured} />
    </Suspense>
  );
}
