import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const sp = await searchParams
  const error = sp?.error

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <LoginForm initialError={error} />
    </div>
  )
}

