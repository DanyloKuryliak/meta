import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const sp = await searchParams
  const error = sp?.error
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase() || null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <LoginForm initialError={error} adminEmail={adminEmail} />
    </div>
  )
}

